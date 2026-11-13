import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../../../src/app/handle-request.ts";
import { buildRouter } from "../../../src/app/routes.ts";
import { buildAdminRouter } from "../../../src/features/admin/admin-routes.ts";
import { ACCESS_PER_HOUR } from "../../../src/features/signin/access-service.ts";
import { MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";

// Request access, from the sign-in page: someone not on a team's list asks to be added, and the site's admins get a
// ticket. Nothing is ever emailed to the address typed.

afterEach(() => vi.restoreAllMocks());

const refuse = async (): Promise<string> => { throw new Error("not signed in"); };
const call = (deps: TestDeps, path: string, init?: RequestInit) =>
	handleRequest(new Request(`https://saints.example${path}`, init), deps, refuse, buildRouter(), buildAdminRouter());
const ask = (deps: TestDeps, fields: Record<string, string>) => call(deps, "/signin/access", {
	method: "POST", headers: { Origin: "https://saints.example", "CF-Connecting-IP": "1.2.3.4" },
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
		for (let i = 0; i < ACCESS_PER_HOUR; i++) await ask(deps, { email: `parent${i}@example.com` });
		const busy = await ask(deps, { email: "one.more@example.com" });
		expect(busy.status).toBe(429);
		expect(await text(busy)).toContain("Try again in an hour.");
		expect(await tickets(deps)).toHaveLength(ACCESS_PER_HOUR);
	});
});
