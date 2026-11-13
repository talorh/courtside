import { describe, expect, it } from "vitest";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { B12_1, createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";
import { insertNote } from "../../../src/features/notes/notes-repository.ts";
import { seedGame } from "../../helpers/seed.ts";

const B = B12_1.id;
const G = G14_5.id;
const SESSION = "Path=/; Secure; HttpOnly; SameSite=Lax";

async function setup() {
	const deps = createTestDeps();
	await addTeam(deps.db, G14_5);
	await addMember(deps.db, G, "jane@example.com", "manager", "Jane Citizen");
	await addMember(deps.db, B, "p@x.com", "watcher");
	return deps;
}
const log = async (deps: TestDeps) => (await deps.db.prepare("SELECT admin_email, team_id, action, detail FROM admin_log ORDER BY id").all()).results;
const adminIn = (deps: TestDeps, team: string) => deps.db.prepare("SELECT id, name, role, hidden FROM members WHERE team_id = ? AND email = ?").bind(team, MANAGER).first();

describe("an admin opening a team they aren't in", () => {
	it("sees it as its team manager, with a banner and Back to Admin; the first visit is logged", async () => {
		const deps = await setup();
		const open = await makeClient(deps)("/teams/switch", form({ team: G, next: "/" }));
		expect(open.headers.getSetCookie()).toEqual([`admin_team=${G}; ${SESSION}`]);
		const visit = makeClient(deps, { adminTeam: G });
		const home = await (await visit("/")).text();
		expect(home).toContain('<div class="adminstrip" role="status">Admin: you&#39;re seeing Saints G14.5 as its team manager. <a href="/admin">Back to Admin</a></div>');
		expect(home).toContain('href="/manage"');
		await visit("/games");
		expect(await log(deps)).toEqual([{ admin_email: MANAGER, team_id: G, action: "team_opened", detail: "" }]);
		expect(await adminIn(deps, G)).toMatchObject({ name: "Site admin", role: "manager", hidden: 1 });
	});

	it("shows what the admin did there as Site admin, never a blank name", async () => {
		const deps = await setup();
		await makeClient(deps, { adminTeam: G })("/");
		const manager = (await adminIn(deps, G)) as { id: number };
		await deps.db.prepare("INSERT INTO activity (team_id, kind, member_id, created_at) VALUES (?, 'clip_made', ?, '2026-10-14T00:00:00.000Z')").bind(G, manager.id).run();
		const page = await (await makeClient(deps, { adminTeam: G })("/notifications")).text();
		expect(page).toContain("Site admin");
	});

	it("gives a team manager adding the admin's email a real membership without the Site admin name", async () => {
		const deps = await setup();
		await makeClient(deps, { adminTeam: G })("/");
		await makeClient(deps, { email: "jane@example.com", team: G })("/members", form({ email: MANAGER, name: "", role: "coach" }));
		expect(await adminIn(deps, G)).toMatchObject({ name: "", role: "coach", hidden: 0 });
	});

	it("shows Sam no banner in their own team", async () => {
		const deps = await setup();
		const home = await (await makeClient(deps)("/")).text();
		expect(home).not.toContain("adminstrip");
	});
});

describe("View as (an admin trying a team as another role)", () => {
	it("shows exactly what that role sees, says so with Stop, and logs it; Stop puts it back", async () => {
		const deps = await setup();
		const start = await makeClient(deps)("/view-as", form({ role: "watcher" }));
		expect([start.status, start.headers.get("Location")]).toEqual([303, "/"]);
		expect(start.headers.getSetCookie()).toEqual([`viewas=${B}:watcher; ${SESSION}`]);
		const viewing = makeClient(deps, { viewAs: `${B}:watcher` });
		const home = await (await viewing("/")).text();
		expect(home).toContain('<div class="adminstrip" role="status">Viewing Saints B12.1 as Watch only. <form method="post" action="/view-as/stop" class="inline">');
		expect(home).not.toContain('href="/manage"');
		expect(home).not.toContain('href="/upload"');
		expect((await viewing("/manage")).status).toBe(403);
		const stop = await viewing("/view-as/stop", form({ next: "/games" }));
		expect([stop.status, stop.headers.get("Location")]).toEqual([303, "/games"]);
		expect(stop.headers.getSetCookie()).toEqual([`viewas=; ${SESSION}; Max-Age=0`]);
		expect((await log(deps)).map((l) => [l.team_id, l.action, l.detail])).toEqual([[B, "view_as", "Watch only"], [B, "view_as", "stopped"]]);
		expect(await (await makeClient(deps)("/")).text()).toContain('href="/manage"');
	});

	it("opens another team as that role from the Teams page", async () => {
		const deps = await setup();
		const res = await makeClient(deps)("/view-as", form({ team: G, role: "filmer" }));
		expect(res.headers.getSetCookie()).toEqual([`admin_team=${G}; ${SESSION}`, `viewas=${G}:filmer; ${SESSION}`]);
		const page = await (await makeClient(deps, { adminTeam: G, viewAs: `${G}:filmer` })("/")).text();
		expect(page).toContain("Viewing Saints G14.5 as Watch and film.");
		expect(page).toContain('href="/upload"');
		expect(await (await makeClient(deps)("/admin/teams")).text()).toContain(`<form method="post" action="/view-as" class="viewas"><input type="hidden" name="team" value="${G}">`);
	});

	it("offers Team manager too (another team's team manager), with everything a team manager has", async () => {
		const deps = await setup();
		const teams = await (await makeClient(deps)("/admin/teams")).text();
		expect(teams).toContain('<option value="watcher" selected>Watch only</option><option value="filmer">Watch and film</option><option value="coach">Coach</option><option value="manager">Team manager</option>');
		const res = await makeClient(deps)("/view-as", form({ team: G, role: "manager" }));
		expect(res.headers.getSetCookie()).toEqual([`admin_team=${G}; ${SESSION}`, `viewas=${G}:manager; ${SESSION}`]);
		const viewing = makeClient(deps, { adminTeam: G, viewAs: `${G}:manager` });
		const home = await (await viewing("/")).text();
		expect(home).toContain("Viewing Saints G14.5 as Team manager.");
		expect(home).toContain('href="/manage"');
		expect(home).toContain('<body class="desk">');
		expect((await viewing("/manage")).status).toBe(200);
		// Logged like any View as (the first open of a team they aren't in is logged too, as ever).
		expect((await log(deps)).map((l) => [l.team_id, l.action, l.detail])).toContainEqual([G, "view_as", "Team manager"]);
	});

	it("only ever counts for the team it names", async () => {
		const deps = await setup();
		const home = await (await makeClient(deps, { viewAs: `${G}:parent` })("/")).text();
		expect(home).not.toContain("Viewing");
		expect(home).toContain('href="/manage"');
	});

	it("records what's done while viewing as the admin's own", async () => {
		const deps = await setup();
		const game = (await deps.db.prepare("INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, '2026-10-11T11:40', 'VJBL', '9', 'Lakeside')").bind(B).run()).meta.last_row_id;
		await makeClient(deps, { viewAs: `${B}:watcher` })(`/games/${game}/favourite`, form({ on: "1", back: "/games" }));
		const manager = (await adminIn(deps, B)) as { id: number };
		expect(await deps.db.prepare("SELECT member_id FROM favourites WHERE team_id = ?").bind(B).first("member_id")).toBe(manager.id);
	});

	it("is nothing to anyone but an admin: the address is not found, and a made-up cookie is ignored", async () => {
		const deps = await setup();
		expect((await makeClient(deps, "p@x.com")("/view-as", form({ role: "coach" }))).status).toBe(404);
		expect((await makeClient(deps, "p@x.com")("/view-as/stop", form({}))).status).toBe(404);
		const home = await (await makeClient(deps, { email: "p@x.com", viewAs: `${B}:coach` })("/")).text();
		expect(home).not.toContain('href="/upload"');
		expect(home).not.toContain("Viewing");
		expect(await log(deps)).toEqual([]);
	});

	it("refuses a role that isn't one", async () => {
		const deps = await setup();
		expect((await makeClient(deps)("/view-as", form({ role: "admin" }))).status).toBe(400);
	});
});

describe("View as coach and the coaches' notes", () => {
	it("leaves the notes out: they're the coaches' own, so the page says so and the notes routes refuse", async () => {
		const deps = await setup();
		const gameId = await seedGame(deps);
		await deps.db.prepare("INSERT INTO members (team_id, email, role, name) VALUES (?, 'coach@x.com', 'coach', 'Coach Pop')").bind(B).run();
		const coach = (await deps.db.prepare("SELECT id FROM members WHERE team_id = ? AND email = 'coach@x.com'").bind(B).first<{ id: number }>())!;
		await insertNote(deps.db, B, { gameId, atSeconds: 222, body: "Press after every made basket", createdBy: coach.id });
		const viewing = makeClient(deps, { viewAs: `${B}:coach` });
		const page = await (await viewing(`/games/${gameId}`)).text();
		expect(page).not.toContain("Press after every made basket");
		expect(page).not.toContain('id="notes-title"');
		expect(page).toContain("Coaches' notes are the coaches' own, so View as leaves them out.");
		expect((await viewing(`/games/${gameId}/notes`, form({ at: "", body: "A note" }))).status).toBe(403);
		expect((await viewing(`/games/${gameId}/notes.xlsx`)).status).toBe(403);
		// The real coach still has them.
		const own = await (await makeClient(deps, { email: "coach@x.com" })(`/games/${gameId}`)).text();
		expect(own).toContain("Press after every made basket");
	});
});
