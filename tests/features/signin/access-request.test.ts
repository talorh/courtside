import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../../../src/app/handle-request.ts";
import { buildRouter } from "../../../src/app/routes.ts";
import { buildAdminRouter } from "../../../src/features/admin/admin-routes.ts";
import { getHold, signInFigures } from "../../../src/auth/sign-in-codes-repository.ts";
import { LIMITS } from "../../../src/auth/sign-in-limits.ts";
import { requestCode } from "../../../src/auth/sign-in-service.ts";
import { ACCESS_PER_HOUR } from "../../../src/features/signin/access-service.ts";
import { MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";

// Request access, from the sign-in page: someone not on a team's list asks to be added, and the site's admins get a
// ticket. Nothing is ever emailed to the address typed.

afterEach(() => vi.restoreAllMocks());

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1";
const refuse = async (): Promise<string> => { throw new Error("not signed in"); };
const call = (deps: TestDeps, path: string, init?: RequestInit) =>
	handleRequest(new Request(`https://saints.example${path}`, init), deps, refuse, buildRouter(), buildAdminRouter());
const ask = (deps: TestDeps, fields: Record<string, string>, ip = "1.2.3.4") => call(deps, "/signin/access", {
	method: "POST", headers: { Origin: "https://saints.example", "CF-Connecting-IP": ip, "User-Agent": IPHONE },
	body: new URLSearchParams({ name: "Steph Curry", team: "Saints B12.1", email: "Steph@Example.com", "cf-turnstile-response": "tok", ...fields }),
});
const text = async (res: Response) => (await res.text()).replaceAll("&#39;", "'");
const tickets = (deps: TestDeps) => deps.db.prepare("SELECT source, team_id, alert_kind, title, topic, contact, status FROM support_requests ORDER BY id").all().then((r) => r.results);

describe("Request access, from the sign-in page", () => {
	it("is offered under the sign-in form: Can't get in? Ask your team manager, or raise an access request here", async () => {
		const page = await text(await call(createTestDeps(), "/signin"));
		expect(page).toContain(`Can't get in? Ask your team manager, or <a href="/signin/access">raise an access request here</a>.`);
	});

	it("asks for a name, a team and an email, with the same robot check as a code, and nobody signed in", async () => {
		const res = await call(createTestDeps(), "/signin/access");
		const page = await text(res);
		expect(res.status).toBe(200);
		// Text boxes like the email's (the stylesheet styles text and email inputs), and no example team to read as typed.
		for (const field of ['type="text" name="name"', 'type="text" name="team"', 'type="email" name="email"']) expect(page).toContain(field);
		expect(page).not.toMatch(/name="team"[^>]*placeholder/);
		expect(page).toContain('<div class="cf-turnstile" data-sitekey="0xSITEKEY"');
		expect(res.headers.get("Content-Security-Policy")).toContain("https://challenges.cloudflare.com");
	});

	it("opens a ticket for the admins, emailed to them, and emails the person nothing", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		const page = await text(await ask(deps, {}));
		expect(page).toContain("Request sent");
		expect(await tickets(deps)).toEqual([{ source: "site", team_id: null, alert_kind: "access:steph@example.com", title: "Access request: Steph Curry, Saints B12.1", topic: "members", contact: "steph@example.com", status: "new" }]);
		expect(deps.email.sent.map((e) => e.subject)).toEqual(["Courtside: Access request: Steph Curry, Saints B12.1 (#1)"]);
		expect(deps.email.sent[0]!.to).toEqual([MANAGER]);
		expect(deps.email.sent[0]!.text).toContain("Email: steph@example.com");
		expect(deps.turnstile.calls).toEqual([{ token: "tok", ip: "1.2.3.4", hostname: "saints.example" }]);
	});

	it("takes one open request an address, says an address on a list can sign in, and asks for what's missing", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		await ask(deps, {});
		expect(await text(await ask(deps, { name: "Steph again" }))).toContain("There's already a request for that email address.");
		expect(await text(await ask(deps, { email: MANAGER }))).toContain("already on a team's list, so you can sign in with it now");
		const missing = await ask(deps, { team: " " });
		expect(missing.status).toBe(400);
		expect(await text(missing)).toContain("Fill in your name, your team and your email.");
		expect(await text(await ask(deps, { email: "not an email" }))).toContain("That isn't an email address.");
		expect(await tickets(deps)).toHaveLength(1);
		expect(deps.email.sent).toHaveLength(1);
	});

	it("sends nothing when Cloudflare says it wasn't a person, and stops at the hour's limit for the whole site", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		deps.turnstile.result = "failed";
		expect((await ask(deps, {})).status).toBe(400);
		expect(await tickets(deps)).toEqual([]);
		deps.turnstile.result = "ok";
		// Each from its own internet address, so it's the whole site's limit that holds, not one address's.
		for (let i = 0; i < ACCESS_PER_HOUR; i++) await ask(deps, { email: `parent${i}@example.com` }, `10.0.0.${i}`);
		const busy = await ask(deps, { email: "one.more@example.com" }, "10.0.1.1");
		expect(busy.status).toBe(429);
		expect(await text(busy)).toContain("Try again in an hour.");
		expect(await tickets(deps)).toHaveLength(ACCESS_PER_HOUR);
	});
	it("stops at the hour's limit for the whole site even when the requests are sent together", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		const answers = await Promise.all(Array.from({ length: 15 }, (_, i) => ask(deps, { email: `parent${i}@example.com` }, `10.0.0.${i}`)));
		expect(answers.filter((r) => r.status === 200)).toHaveLength(ACCESS_PER_HOUR);
		expect(answers.filter((r) => r.status === 429)).toHaveLength(15 - ACCESS_PER_HOUR);
		expect(await tickets(deps)).toHaveLength(ACCESS_PER_HOUR);
	});
});

describe("Request access's tries, recorded and limited", () => {
	const events = (deps: TestDeps) => deps.db.prepare("SELECT kind, email, ip, device FROM sign_in_events ORDER BY id").all().then((r) => r.results);
	function clocked() {
		let now = new Date("2026-11-16T09:00:00.000Z");
		const deps = createTestDeps();
		deps.now = () => now;
		vi.spyOn(console, "log").mockImplementation(() => {});
		return { deps, later: (ms: number) => { now = new Date(now.getTime() + ms); } };
	}

	it("records every try as a sign-in event: the address as typed if it is one, masked if it isn't, with where it came from", async () => {
		const { deps } = clocked();
		await ask(deps, {});
		await ask(deps, { email: MANAGER });
		await ask(deps, { email: "not an email" });
		await ask(deps, { team: "" });
		expect(await events(deps)).toEqual([
			{ kind: "access", email: "steph@example.com", ip: "1.2.3.4", device: "iPhone, Safari" },
			{ kind: "access", email: MANAGER, ip: "1.2.3.4", device: "iPhone, Safari" },
			{ kind: "access", email: "n…", ip: "1.2.3.4", device: "iPhone, Safari" },
			{ kind: "access", email: "steph@example.com", ip: "1.2.3.4", device: "iPhone, Safari" },
		]);
	});

	it(`answers busy past ${LIMITS.unknownPerIp15m} tries from one internet address in 15 minutes, whatever the address, before the list is looked at`, async () => {
		const { deps, later } = clocked();
		for (let i = 0; i < LIMITS.unknownPerIp15m; i++) {
			expect(await text(await ask(deps, { email: MANAGER }, "5.5.5.5"))).toContain("already on a team's list");
		}
		for (const email of [MANAGER, "stranger@example.com"]) {
			const busy = await ask(deps, { email }, "5.5.5.5");
			expect(busy.status).toBe(429);
			const page = await text(busy);
			expect(page).toContain("A lot of requests have come in just now. Try again in an hour.");
			expect(page).not.toContain("already on a team's list");
		}
		expect(await tickets(deps)).toEqual([]);
		// Another internet address isn't held back, and this one asks again once 15 minutes have gone without a try.
		expect(await text(await ask(deps, { email: MANAGER }, "6.6.6.6"))).toContain("already on a team's list");
		later(15 * 60_000 + 1);
		expect(await text(await ask(deps, {}, "5.5.5.5"))).toContain("Request sent");
	});

	it("leaves the sign-in's own limits, holds and figures as they were", async () => {
		const { deps } = clocked();
		for (let i = 0; i <= LIMITS.unknownPerIp15m + 2; i++) await ask(deps, { email: i % 2 ? MANAGER : `stranger${i}@example.com` }, "5.5.5.5");
		expect(await signInFigures(deps.db, "2026-11-16T00:00:00.000Z")).toEqual({ codesSent: 0, wrong: 0, refused: 0, signedIn: 0 });
		expect(await getHold(deps.db, MANAGER)).toBeNull();
		// The same internet address still gets a code for an address on a list, and is still allowed its unknown addresses.
		expect(await requestCode(deps, MANAGER, "5.5.5.5")).toBe("sent");
		for (let i = 0; i < LIMITS.unknownPerIp15m; i++) expect(await requestCode(deps, `nobody${i}@example.com`, "5.5.5.5")).toBe("unknown");
		expect(await requestCode(deps, "one.more@example.com", "5.5.5.5")).toBe("limited");
	});
});
