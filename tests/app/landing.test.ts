import { describe, expect, it } from "vitest";
import { unauthenticated } from "../../src/app/errors.ts";
import { handleRequest } from "../../src/app/handle-request.ts";
import { sitePath } from "../../src/app/landing.ts";
import { buildRouter } from "../../src/app/routes.ts";
import { buildAdminRouter } from "../../src/features/admin/admin-routes.ts";
import { countingDb } from "../helpers/counting-db.ts";
import { form, makeClient, MANAGER } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../helpers/two-teams.ts";

const B12 = "b12.1-2026";

async function both() {
	const deps = createTestDeps();
	await addTeam(deps.db);
	await addMember(deps.db, B12, "both@x.com", "filmer");
	await addMember(deps.db, G14_5.id, "both@x.com", "watcher");
	return deps;
}

describe("Which team?", () => {
	it("lists someone's teams, current ones first, marks the one they're on, and comes back to the page they wanted", async () => {
		const deps = await both();
		// Last season's B12.1 is over, and this season's has the same code.
		await deps.db.prepare("UPDATE teams SET status = 'closed' WHERE id = ?").bind(B12).run();
		await addTeam(deps.db, { ...G14_5, id: "b12.1-2027", code: "b12.1", seasonStart: 2027, name: "Saints U12 Boys 12.1" });
		await addMember(deps.db, "b12.1-2027", "both@x.com", "watcher");
		const page = await (await makeClient(deps, { email: "both@x.com", team: G14_5.id })("/teams?next=%2Fgames%2F12")).text();
		const order = ["Your teams", "Saints B12.1 (2027/28)", "Saints G14.5", "Past seasons", "Saints B12.1 (2026/27)"].map((s) => page.indexOf(s));
		expect(order.every((at, i) => at > 0 && (i === 0 || at > (order[i - 1] ?? 0)))).toBe(true);
		expect(page).toContain(`<input type="hidden" name="team" value="${G14_5.id}"><input type="hidden" name="next" value="/games/12">`);
		expect(page).toMatch(/aria-current="true"><b>Saints G14\.5<\/b><span class="small">Saints U14 Girls 14\.5 \(you&#39;re here\)/);
		expect(page).toContain('<a href="/">Back to Saints G14.5</a>');
		expect(page).not.toContain("All teams");
		expect(page).toContain("tap <b>Switch team</b> at the top of any page");
	});

	it("doesn't ask when there's only one team to choose: it opens it, at the page they wanted", async () => {
		const deps = createTestDeps();
		const res = await makeClient(deps)("/teams?next=%2Fgames");
		expect([res.status, res.headers.get("Location")]).toEqual([302, "/games"]);
		expect(res.headers.get("Set-Cookie")).toBe(`team=${B12}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000, admin_team=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
		// An admin on no team's list, with one team on the site: a visit to it, for this browser session.
		await deps.db.prepare("UPDATE members SET removed_at = '2026-10-28T00:00:00.000Z' WHERE email = ?").bind(MANAGER).run();
		const visit = await makeClient(deps)("/teams");
		expect([visit.status, visit.headers.get("Location"), visit.headers.get("Set-Cookie")]).toEqual([302, "/", `admin_team=${B12}; Path=/; Secure; HttpOnly; SameSite=Lax`]);
	});

	it("shows an admin every other team too, but not the ones they're in", async () => {
		const deps = await both();
		const page = await (await makeClient(deps)("/teams")).text();
		expect(page.indexOf("All teams (site admin)")).toBeGreaterThan(page.indexOf("Saints B12.1"));
		expect(page.slice(page.indexOf("All teams"))).toContain("Saints G14.5");
		expect(page.match(/value="b12.1-2026"/g)).toHaveLength(1);
		// In one team, the team's name at the top is their Home, so the page doesn't say it switches.
		expect(page).not.toContain("Switch team");
	});

	it("never shows anyone but an admin a team they aren't in", async () => {
		const deps = await both();
		await addTeam(deps.db, { ...G14_5, id: "u14-girls-14-2", code: "g14.2", name: "Saints U14 Girls 14.2" });
		await addMember(deps.db, B12, "p@x.com", "watcher");
		await addMember(deps.db, "u14-girls-14-2", "p@x.com", "watcher");
		const page = await (await makeClient(deps, "p@x.com")("/teams")).text();
		expect(page).toMatch(/Saints B12\.1[\s\S]*Saints G14\.2/);
		expect(page).not.toMatch(/G14\.5|All teams/);
	});

	it("tells someone on no team's list so, and lets an admin on none see every team", async () => {
		const deps = await both();
		expect((await makeClient(deps, "stranger@x.com")("/teams")).status).toBe(403);
		await deps.db.prepare("UPDATE members SET removed_at = '2026-10-28T00:00:00.000Z' WHERE email = ?").bind(MANAGER).run();
		const page = await (await makeClient(deps)("/teams")).text();
		expect(page).toContain("All teams (site admin)");
		expect(page).not.toContain("Your teams");
	});
});

describe("switching team", () => {
	it("makes a team the person is in their team for a year, ends an admin's visit, and goes to the page they wanted", async () => {
		const deps = await both();
		const res = await makeClient(deps, { email: "both@x.com", team: B12 })("/teams/switch", form({ team: G14_5.id, next: "/games/12?clip=3" }));
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/games/12?clip=3"]);
		expect(res.headers.get("Set-Cookie")).toBe(`team=${G14_5.id}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000, admin_team=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
	});

	it("keeps the choice of someone whose old cookie named a team that's gone (it isn't cleared straight after)", async () => {
		const deps = await both();
		const res = await makeClient(deps, { email: "both@x.com", team: "deleted-team" })("/teams/switch", form({ team: G14_5.id }));
		expect(res.headers.get("Set-Cookie")).toBe(`team=${G14_5.id}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000, admin_team=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
	});

	it("gives an admin a visit to a team they aren't in for this browser session only", async () => {
		const deps = await both();
		const res = await makeClient(deps)("/teams/switch", form({ team: G14_5.id }));
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/"]);
		expect(res.headers.get("Set-Cookie")).toBe(`admin_team=${G14_5.id}; Path=/; Secure; HttpOnly; SameSite=Lax`);
	});

	it("keeps an admin's visit to a team session-only even once they've a hidden way in", async () => {
		const deps = await both();
		await makeClient(deps, { adminTeam: G14_5.id })("/");
		const res = await makeClient(deps)("/teams/switch", form({ team: G14_5.id }));
		expect(res.headers.get("Set-Cookie")).toBe(`admin_team=${G14_5.id}; Path=/; Secure; HttpOnly; SameSite=Lax`);
	});

	it("answers not found, changing nothing, for a team someone can't open, deleted or not", async () => {
		const deps = await both();
		await addMember(deps.db, B12, "p@x.com", "watcher");
		for (const team of [G14_5.id, "nonsense"]) {
			const res = await makeClient(deps, "p@x.com")("/teams/switch", form({ team, next: "/" }));
			expect(res.status).toBe(404);
			expect(res.headers.get("Set-Cookie")).toBeNull();
		}
		await deps.db.prepare("UPDATE teams SET status = 'deleted' WHERE id = ?").bind(G14_5.id).run();
		expect((await makeClient(deps)("/teams/switch", form({ team: G14_5.id }))).status).toBe(404);
	});

	it("still refuses a switch posted from another site", async () => {
		const deps = await both();
		const res = await makeClient(deps, "both@x.com")("/teams/switch", { ...form({ team: G14_5.id }), headers: { Origin: "https://evil.test" } });
		expect(res.status).toBe(403);
		expect(res.headers.get("Set-Cookie")).toBeNull();
	});
});

describe("where a switch can send someone", () => {
	it("is a page on this site, never anywhere else, and never back to Which team?", () => {
		expect(sitePath("/games/12?clip=3")).toBe("/games/12?clip=3");
		// "/..//evil.test" parses to the path "//evil.test", which a browser would take for another site.
		for (const next of ["//evil.test/x", "https://evil.test/", "/\t/evil.test", "/\\evil.test", "/..//evil.test", "/a/..//evil.test/x", "/.//evil.test", "games/12", "", null, undefined, "/teams", "/teams/switch"]) {
			expect(sitePath(next)).toBe("/");
		}
	});

	it("keeps a link to a part of a page (Activity's removal requests: /members#removals)", () => {
		expect(sitePath("/manage#removals")).toBe("/manage#removals");
		expect(sitePath("/games/12?tab=clips#c5")).toBe("/games/12?tab=clips#c5");
	});
});

describe("the spinner when the Home Screen app opens (never a white screen)", () => {
	const launch = (deps: ReturnType<typeof createTestDeps>, path: string, headers: Record<string, string> = {}) =>
		handleRequest(new Request(`https://saints.example${path}`, { headers }), deps, async () => MANAGER, buildRouter(), buildAdminRouter());

	it("answers /?app at once, before any trip to the database, with a page that opens Home in its place", async () => {
		const deps = createTestDeps();
		const { db, counter } = countingDb(deps.db);
		const res = await launch({ ...deps, db }, "/?app");
		expect(counter.trips).toBe(0);
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		const page = await res.text();
		expect(page).toContain('<html lang="en-AU" data-to="/">');
		expect(page).toContain('<script type="module" src="/landing.js"></script>');
		// For a browser without scripts, or one that's slow to load them: a link, never an automatic refresh that could loop.
		// The club's mark, the club's name and the bouncing ball, and nothing to tap (only ever a moment).
		// The club's mark is in the page itself, allowed by this page's own CSP (no fetch, so no cache to go stale).
		expect(page).toContain('<img class="launchmark" src="data:image/webp;base64,');
		expect(res.headers.get("Content-Security-Policy")).toContain("img-src 'self' data: blob: https://imagedelivery.net");
		expect((await launch({ ...deps, db }, "/signin")).headers.get("Content-Security-Policy")).toContain("img-src 'self' blob: https://imagedelivery.net");
		expect(page).toContain('<h1 class="launchname">Courtside</h1><div class="launchspin" role="progressbar" aria-label="Opening the site">');
		expect(page).toContain('<svg class="launchball" viewBox="0 0 100 100" aria-hidden="true">');
		expect(page).not.toContain("Continue");
		expect(page).not.toContain("<a ");
		expect(page).not.toContain("http-equiv");
	});

	it("is what a fresh open of / gets (Sec-Fetch-Site none and a navigation: an older icon, or the address typed)", async () => {
		const deps = createTestDeps();
		const fresh = await (await launch(deps, "/", { "Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate" })).text();
		expect(fresh).toContain('data-to="/"');
		const others: Array<Record<string, string>> = [{ "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "navigate" }, { "Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "cors" }, {}];
		for (const headers of others) {
			expect(await (await launch(deps, "/", headers)).text()).not.toContain("data-to=");
		}
		expect(await (await launch(deps, "/games", { "Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate" })).text()).not.toContain("data-to=");
	});

	it("needs no sign-in itself (the app never shows a white screen), and the page it opens asks for one", async () => {
		const deps = createTestDeps();
		const refuse = async (): Promise<string> => { throw unauthenticated("Please sign in."); };
		const spinner = await handleRequest(new Request("https://saints.example/?app"), deps, refuse, buildRouter(), buildAdminRouter());
		expect(spinner.status).toBe(200);
		expect(await spinner.text()).toContain('data-to="/"');
		const home = await handleRequest(new Request("https://saints.example/"), deps, refuse, buildRouter(), buildAdminRouter());
		expect([home.status, home.headers.get("Location")]).toEqual([303, "/signin?next=%2F"]);
	});
});
