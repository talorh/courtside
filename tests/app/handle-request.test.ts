import { afterEach, describe, expect, it, vi } from "vitest";
import { conflict } from "../../src/app/errors.ts";
import { Router } from "../../src/app/router.ts";
import { getActiveMember } from "../../src/features/members/members-repository.ts";
import { makeClient, ORIGIN, MANAGER } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../helpers/two-teams.ts";

function testRouter() {
	const router = new Router();
	router.get("/hello", "watcher", async ({ member }) => new Response(`hi ${member.role}`));
	router.get("/admin-only", "manager", async () => new Response("manager"));
	router.post("/api/thing", "watcher", async () => { throw conflict("Already done."); });
	router.post("/api/save", "watcher", async () => new Response("saved"));
	router.post("/api/ask-to-remove", "watcher", async () => new Response("asked"), { closedTeams: true });
	router.get("/boom", "watcher", async () => { throw new Error("secret detail"); });
	router.get("/ctx", "watcher", async ({ team, member, viewer, viewAs, deps }) =>
		Response.json({ team: team.id, memberTeam: member.teamId, role: member.role, memberId: member.id, hidden: member.hidden, viewer: viewer.email, isAdmin: viewer.isAdmin, viewAs, depsTeam: deps.team.id }));
	return router;
}

afterEach(() => vi.restoreAllMocks());

describe("handleRequest", () => {
	it("every response, errors and the not-a-member page included, names only this site's Stream, R2 and Images hosts", async () => {
		const deps = createTestDeps();
		for (const res of [await makeClient(deps, undefined, testRouter())("/boom"), await makeClient(deps, "stranger@x.com", testRouter())("/hello")]) {
			const csp = res.headers.get("Content-Security-Policy")!;
			// Photos: blob: is a photo the member chose on their own phone, drawn to make it smaller; Cloudflare
			// Images serves the team's photos through signed links.
			expect(csp).toContain("img-src 'self' blob: https://imagedelivery.net https://customer-cust.cloudflarestream.com;");
			expect(csp).not.toContain("*");
		}
	});
	it("puts the admin banner in as written, even with $ patterns in a PlayHQ team's name", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO playhq_fixtures (team_id, competition, playhq_team_id, url, name, last_error) VALUES (?, 'VJBL', 'x', 'u', ?, 'down')")
			.bind(deps.team.id, "Saints $' $& Boys").run();
		expect(await (await makeClient(deps)("/help")).text()).toContain("Saints $&#39; $&amp; Boys");
	});
	it("serves members and records last seen", async () => {
		const deps = createTestDeps();
		const res = await makeClient(deps, undefined, testRouter())("/hello");
		expect(await res.text()).toBe("hi manager");
		expect((await getActiveMember(deps.db, deps.team.id, 1))?.lastSeenAt).toBe("2026-10-15T00:00:00.000Z");
	});
	it("shows someone on no team's list a 403 page that names no team and no person, with Try again and Sign out", async () => {
		const res = await makeClient(createTestDeps(), "stranger@x.com", testRouter())("/hello");
		expect(res.status).toBe(403);
		const page = await res.text();
		expect(page).toContain("isn't on a team's list yet");
		expect(page).toContain('Ask your team manager to sub you in, then tap Try again.</p>\n<p><a class="btn" href="/">Try again</a></p>');
		expect(page).toContain('<a href="/signout" data-signout>Sign out</a> (to sign in with another email)');
		expect(page).toContain("<h1>Not on a team&#39;s list yet</h1>");
		// The page's title names no team either once the layout takes the team from the request.
		expect(page).not.toMatch(/Sam/);
	});
	it("sends an admin who's on no team's list to the admin area", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("UPDATE members SET removed_at = '2026-10-28T00:00:00.000Z' WHERE email = ?").bind(MANAGER).run();
		const res = await makeClient(deps, undefined, testRouter())("/hello");
		expect([res.status, res.headers.get("Location")]).toEqual([302, "/admin"]);
	});
	it("returns 404 for unknown pages and 403 for low roles", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'p@x.com', 'watcher')").bind(deps.team.id).run();
		const watcher = makeClient(deps, "p@x.com", testRouter());
		expect((await watcher("/nope")).status).toBe(404);
		expect((await watcher("/admin-only")).status).toBe(403);
	});
	it("blocks cross-site posts", async () => {
		const res = await makeClient(createTestDeps(), undefined, testRouter())("/api/thing", { method: "POST", headers: { Origin: "https://evil.test" } });
		expect(res.status).toBe(403);
	});
	it("uses the JSON envelope under /api and hides internal errors", async () => {
		const client = makeClient(createTestDeps(), undefined, testRouter());
		const api = await client("/api/thing", { method: "POST", headers: { Origin: ORIGIN } });
		expect(api.status).toBe(409);
		expect(await api.json()).toEqual({ ok: false, error: { code: "conflict", message: "Already done." } });
		const boom = await client("/boom");
		expect(boom.status).toBe(500);
		expect(await boom.text()).not.toContain("secret detail");
	});
	it("logs an error with the team it happened in", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		await makeClient(createTestDeps(), undefined, testRouter())("/boom");
		expect(JSON.parse(String(logged.mock.calls[0]?.[0]))).toMatchObject({ event: "request_error", teamId: "b12.1-2026" });
	});
});

describe("the current team", () => {
	it("runs a page as the person's membership of their current team, with that team's deps", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db);
		const b12 = await addMember(deps.db, deps.team.id, "both@x.com", "filmer");
		const g14 = await addMember(deps.db, G14_5.id, "both@x.com", "watcher");
		const ctx = async (team: string) => (await makeClient(deps, { email: "both@x.com", team }, testRouter())("/ctx")).json();
		expect(await ctx(G14_5.id)).toEqual({ team: G14_5.id, memberTeam: G14_5.id, role: "watcher", memberId: g14, hidden: false, viewer: "both@x.com", isAdmin: false, viewAs: null, depsTeam: G14_5.id });
		expect(await ctx(deps.team.id)).toMatchObject({ team: deps.team.id, role: "filmer", memberId: b12, depsTeam: deps.team.id });
	});
	it("remembers someone's only team when their cookie named another", async () => {
		const deps = createTestDeps();
		const res = await makeClient(deps, { team: "nonsense" }, testRouter())("/hello");
		expect(res.status).toBe(200);
		expect(res.headers.get("Set-Cookie")).toBe("team=b12.1-2026; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000");
	});
	it("asks someone in several teams which one, then brings them back to the page they wanted", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db);
		await addMember(deps.db, deps.team.id, "both@x.com", "filmer");
		await addMember(deps.db, G14_5.id, "both@x.com", "watcher");
		const client = makeClient(deps, { email: "both@x.com", team: null }, testRouter());
		const page = await client("/games/12?tab=clips");
		expect([page.status, page.headers.get("Location")]).toEqual([302, "/teams?next=%2Fgames%2F12%3Ftab%3Dclips"]);
		const api = await client("/api/anything");
		expect(api.status).toBe(409);
		expect(await api.json()).toEqual({ ok: false, error: { code: "choose_team", message: "Choose your team first: reload the page." } });
		// A page script's write says its team, so it runs there even before a choice.
		expect(await (await client("/api/save", { method: "POST" })).text()).toBe("saved");
	});
	it("lets an admin into a team they aren't in through a hidden team manager membership, made once, with no Last seen", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db);
		const manager = makeClient(deps, { adminTeam: G14_5.id }, testRouter());
		const first = await (await manager("/ctx")).json() as { memberId: number };
		expect(first).toMatchObject({ team: G14_5.id, role: "manager", hidden: true, isAdmin: true, depsTeam: G14_5.id });
		expect(((await (await manager("/ctx")).json()) as { memberId: number }).memberId).toBe(first.memberId);
		const rows = await deps.db.prepare("SELECT hidden, last_seen_at FROM members WHERE team_id = ? AND email = ?").bind(G14_5.id, MANAGER).all();
		expect(rows.results).toEqual([{ hidden: 1, last_seen_at: null }]);
	});
	it("keeps someone who isn't an admin out of a team they aren't in, whatever their cookies say", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db);
		await addMember(deps.db, deps.team.id, "p@x.com", "watcher");
		const res = await makeClient(deps, { email: "p@x.com", team: G14_5.id, adminTeam: G14_5.id }, testRouter())("/ctx");
		expect(await res.json()).toMatchObject({ team: deps.team.id, role: "watcher" });
		expect(res.headers.get("Set-Cookie")).toContain("admin_team=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM members WHERE team_id = ?").bind(G14_5.id).first("n")).toBe(0);
	});
	it("makes a closed team's site read-only: pages work, and only writes marked for closed teams get through", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("UPDATE teams SET status = 'closed' WHERE id = ?").bind(deps.team.id).run();
		const client = makeClient(deps, undefined, testRouter());
		expect((await client("/hello")).status).toBe(200);
		const refused = await client("/api/save", { method: "POST" });
		expect(refused.status).toBe(409);
		expect(await refused.json()).toEqual({ ok: false, error: { code: "conflict", message: "Saints B12.1's season is over, so its site is read-only." } });
		expect(await (await client("/api/ask-to-remove", { method: "POST" })).text()).toBe("asked");
	});
});
