import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../../../src/app/handle-request.ts";
import { buildRouter } from "../../../src/app/routes.ts";
import { buildAdminRouter } from "../../../src/features/admin/admin-routes.ts";
import { SIGN_IN_MESSAGES } from "../../../src/features/signin/views/signin-page.ts";
import { createTurnstile } from "../../../src/platform/turnstile.ts";
import { MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";

// Turnstile on the sign-in page: no code is emailed until Cloudflare says a person asked, on the
// email step and on Send a new code. Cloudflare not answering leaves the sign-in's own limits to hold.

const refuse = async (): Promise<string> => { throw new Error("not signed in"); };
const call = (deps: TestDeps, path: string, init?: RequestInit) =>
	handleRequest(new Request(`https://saints.example${path}`, init), deps, refuse, buildRouter(), buildAdminRouter());
const askForCode = (deps: TestDeps, token = "tok", email = MANAGER) => call(deps, "/signin", {
	method: "POST", headers: { Origin: "https://saints.example", "CF-Connecting-IP": "1.2.3.4" },
	body: new URLSearchParams({ email, next: "/", "cf-turnstile-response": token }),
});

describe("Turnstile on the sign-in page", () => {
	it("puts the widget on the email step, and on the code step's Send a new code, with the site's key, for this page", async () => {
		const deps = createTestDeps();
		const widget = '<div class="cf-turnstile" data-sitekey="0xSITEKEY" data-action="signin" data-appearance="interaction-only" data-size="flexible"></div>';
		const email = await (await call(deps, "/signin")).text();
		expect(email).toContain(`${widget}<button class="btn primary big">Send login code</button>`);
		vi.spyOn(console, "log").mockImplementation(() => {});
		const code = await (await askForCode(deps)).text();
		expect(code).toContain(`${widget}<button class="btn quiet" data-resend>Send a new code</button>`);
	});
	it("marks Send a new code ready at once when the code has run out or used its tries, and only then", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		await askForCode(deps);
		const tryCode = async (code: string) => (await call(deps, "/signin/code", {
			method: "POST", headers: { Origin: "https://saints.example", "CF-Connecting-IP": "1.2.3.4" }, body: new URLSearchParams({ email: MANAGER, next: "/", code }),
		})).text();
		const wrong = await tryCode("000000");
		expect(wrong).toContain('<button class="btn quiet" data-resend>Send a new code</button>');
		await deps.db.prepare("UPDATE sign_in_codes SET tries = 5").run();
		const expired = await tryCode("000000");
		expect(expired).toContain(SIGN_IN_MESSAGES.expired);
		expect(expired).toContain('<button class="btn quiet" data-resend data-resend-now>Send a new code</button>');
	});
	it("lets the sign-in pages, and only them, load Turnstile's script and frame", async () => {
		const deps = createTestDeps();
		const csp = (await call(deps, "/signin")).headers.get("Content-Security-Policy")!;
		expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com;");
		expect(csp).toContain("frame-src https://customer-cust.cloudflarestream.com https://challenges.cloudflare.com;");
		const elsewhere = (await call(deps, "/signout")).headers.get("Content-Security-Policy")!;
		expect(elsewhere).not.toContain("challenges.cloudflare.com");
	});
	it("asks Cloudflare with the page's token, the person's IP address and this site's address, then emails the code", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		expect((await askForCode(deps)).status).toBe(200);
		expect(deps.turnstile.calls).toEqual([{ token: "tok", ip: "1.2.3.4", hostname: "saints.example" }]);
		expect(deps.email.sent).toHaveLength(1);
	});
	it("sends no code when Cloudflare says it wasn't a person, and says to try again", async () => {
		const deps = createTestDeps();
		deps.turnstile.result = "failed";
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const res = await askForCode(deps, "");
		expect(res.status).toBe(400);
		expect(await res.text()).toContain(SIGN_IN_MESSAGES.robot.replaceAll("'", "&#39;"));
		expect(deps.email.sent).toEqual([]);
		expect(log.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([{ event: "signin_refused", teamId: null, email: "s…@saints.example", why: "turnstile", detail: "fake" }]);
	});
	it("keeps what was typed masked when it isn't an address, in the robot check's sign-in event and its problem line", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		deps.turnstile.result = "failed";
		await askForCode(deps, "", "Magic Johnson 0400 000 000");
		await askForCode(deps, "", "Magic@Example.com");
		const events = await deps.db.prepare("SELECT kind, email FROM sign_in_events ORDER BY id").all();
		expect(events.results).toEqual([{ kind: "robot", email: "m…" }, { kind: "robot", email: "magic@example.com" }]);
		deps.turnstile.result = "unreachable";
		await askForCode(deps, "tok", "Magic Johnson 0400 000 000");
		const problems = await deps.db.prepare("SELECT who FROM problems ORDER BY id").all();
		expect(problems.results).toEqual([{ who: "m…" }]);
	});
	it("sends no code and opens no access request when Cloudflare refuses the question (a 4xx), and records it as a robot", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const refused = vi.fn(async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 400 }));
		const withTurnstile = { ...deps, turnstile: createTurnstile({ secret: "ts", fetch: refused }) };
		const post = (path: string, body: Record<string, string>) => handleRequest(new Request(`https://saints.example${path}`, {
			method: "POST", headers: { Origin: "https://saints.example", "CF-Connecting-IP": "1.2.3.4" }, body: new URLSearchParams(body),
		}), withTurnstile, refuse, buildRouter(), buildAdminRouter());
		const code = await post("/signin", { email: MANAGER, next: "/", "cf-turnstile-response": "tok" });
		expect(code.status).toBe(400);
		expect(await code.text()).toContain(SIGN_IN_MESSAGES.robot.replaceAll("'", "&#39;"));
		// A token longer than Cloudflare makes is refused the same way, without asking.
		expect((await post("/signin", { email: MANAGER, next: "/", "cf-turnstile-response": "x".repeat(4000) })).status).toBe(400);
		const access = await post("/signin/access", { name: "Steph Curry", team: "Saints B12.1", email: "steph@example.com", "cf-turnstile-response": "tok" });
		expect(access.status).toBe(400);
		expect(refused).toHaveBeenCalledTimes(2);
		expect(deps.email.sent).toEqual([]);
		expect((await deps.db.prepare("SELECT kind FROM sign_in_events").all()).results).toEqual([{ kind: "robot" }, { kind: "robot" }]);
		expect((await deps.db.prepare("SELECT COUNT(*) AS n FROM support_requests").first<number>("n"))).toBe(0);
		expect(warn).not.toHaveBeenCalled();
	});
	it("still refuses when Cloudflare refuses the site's own secret, but logs it and opens a problem, on both forms", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const keyRefused = vi.fn(async () => new Response("{}", { status: 403 }));
		const withTurnstile = { ...deps, turnstile: createTurnstile({ secret: "old", fetch: keyRefused }) };
		const post = (path: string, body: Record<string, string>) => handleRequest(new Request(`https://saints.example${path}`, {
			method: "POST", headers: { Origin: "https://saints.example", "CF-Connecting-IP": "1.2.3.4" }, body: new URLSearchParams(body),
		}), withTurnstile, refuse, buildRouter(), buildAdminRouter());
		expect((await post("/signin", { email: MANAGER, next: "/", "cf-turnstile-response": "tok" })).status).toBe(400);
		expect((await post("/signin/access", { name: "Steph Curry", team: "Saints B12.1", email: "steph@example.com", "cf-turnstile-response": "tok" })).status).toBe(400);
		expect(deps.email.sent).toEqual([]);
		expect(warn.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
			{ event: "turnstile_key_refused", teamId: null, form: "signin", detail: "HTTP 403" },
			{ event: "turnstile_key_refused", teamId: null, form: "access", detail: "HTTP 403" },
		]);
		const problems = await deps.db.prepare("SELECT kind, what, detail FROM problems ORDER BY id").all();
		expect(problems.results).toEqual([{ kind: "site_problem", what: "Turnstile refused the site's own secret key, so nobody can sign in or ask for access", detail: "HTTP 403" }]);
	});
	it("still sends the code when Cloudflare can't be reached, and logs that it couldn't check", async () => {
		const deps = createTestDeps();
		deps.turnstile.result = "unreachable";
		vi.spyOn(console, "log").mockImplementation(() => {});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect((await askForCode(deps)).status).toBe(200);
		expect(deps.email.sent).toHaveLength(1);
		expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({ event: "turnstile_unreachable", teamId: null, detail: "fake" });
	});
});
