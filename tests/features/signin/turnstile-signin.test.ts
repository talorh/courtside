import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../../../src/app/handle-request.ts";
import { buildRouter } from "../../../src/app/routes.ts";
import { buildAdminRouter } from "../../../src/features/admin/admin-routes.ts";
import { SIGN_IN_MESSAGES } from "../../../src/features/signin/views/signin-page.ts";
import { MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";

// Turnstile on the sign-in page: no code is emailed until Cloudflare says a person asked, on the
// email step and on Send a new code. Cloudflare not answering leaves the sign-in's own limits to hold.

const refuse = async (): Promise<string> => { throw new Error("not signed in"); };
const call = (deps: TestDeps, path: string, init?: RequestInit) =>
	handleRequest(new Request(`https://saints.example${path}`, init), deps, refuse, buildRouter(), buildAdminRouter());
const askForCode = (deps: TestDeps, token = "tok") => call(deps, "/signin", {
	method: "POST", headers: { Origin: "https://saints.example", "CF-Connecting-IP": "1.2.3.4" },
	body: new URLSearchParams({ email: MANAGER, next: "/", "cf-turnstile-response": token }),
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
