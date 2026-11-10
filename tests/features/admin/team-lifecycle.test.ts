import { describe, expect, it } from "vitest";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { B12_1, createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

const G = G14_5.id;
const SEASON_END = "2027-12-31T13:00:00.000Z";
// The tests' clock is 11am on Thu 15 Oct 2026 in the club's time zone (daylight saving): the next 3am there is 16:00 UTC.
const TONIGHT = "2026-10-15T16:00:00.000Z";

async function withG14(status: "active" | "closed" = "active", deleteAfter: string | null = null) {
	const deps = createTestDeps();
	await addTeam(deps.db, { ...G14_5, status, closedAt: status === "closed" ? "2026-10-01T00:00:00.000Z" : null, deleteAfter });
	await addMember(deps.db, G, "jane@example.com", "manager", "Jane Citizen");
	return deps;
}
const admin = (deps: TestDeps) => makeClient(deps);
const team = async (deps: TestDeps, id = G) =>
	deps.db.prepare("SELECT id, name, code, season_start, ask_name, status, closed_at, delete_after FROM teams WHERE id = ?").bind(id).first();
const log = async (deps: TestDeps) => (await deps.db.prepare("SELECT admin_email, team_id, action, detail FROM admin_log ORDER BY id").all()).results;
const addGame = (deps: TestDeps, teamId = G) =>
	deps.db.prepare("INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, '2026-10-20T18:40', 'VJBL', '1', 'Lakeside')").bind(teamId).run();

describe("editing a team", () => {
	it("changes who to ask any time, and logs what changed", async () => {
		const deps = await withG14();
		await addGame(deps);
		const res = await admin(deps)(`/admin/teams/${G}`, form({ code: "g14.5", season: "2026", askName: " Jane " }));
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/admin/teams?done=saved"]);
		expect(await team(deps)).toMatchObject({ ask_name: "Jane", code: "g14.5" });
		expect(await log(deps)).toEqual([{ admin_email: MANAGER, team_id: G, action: "team_edited", detail: "who to ask: Jane" }]);
		expect(await (await admin(deps)("/admin/teams?done=saved")).text()).toContain("Changes saved.");
	});

	it("fixes a mistyped code or season until the team's first game, keeping its id", async () => {
		const deps = await withG14();
		await deps.db.prepare("UPDATE teams SET code = 'g14.6', name = 'Saints U14 Girls 14.6' WHERE id = ?").bind(G).run();
		expect((await admin(deps)(`/admin/teams/${G}`, form({ code: "G14.5", season: "2027", askName: "" }))).status).toBe(303);
		expect(await team(deps)).toMatchObject({ id: G, code: "g14.5", name: "Saints U14 Girls 14.5", season_start: 2027, ask_name: null });
		expect((await log(deps))[0]).toMatchObject({ action: "team_edited", detail: "code g14.6 to g14.5, season 2026/27 to 2027/28" });
	});

	it("keeps the code and season once the team has a game", async () => {
		const deps = await withG14();
		await addGame(deps);
		const res = await admin(deps)(`/admin/teams/${G}`, form({ code: "g14.6", season: "2026", askName: "" }));
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("Saints G14.5 has games now, so its code and season stay as they are.");
		expect(await team(deps)).toMatchObject({ code: "g14.5" });
		const page = await (await admin(deps)(`/admin/teams/${G}/edit`)).text();
		expect(page).toMatch(/name="code"[^>]*readonly/);
		expect(page).toContain("Its code and season stay as they are now it has games.");
	});

	it("never takes a code an open team has, and an edited team's old code can be onboarded again", async () => {
		const deps = await withG14();
		const clash = await admin(deps)(`/admin/teams/${G}`, form({ code: "b12.1", season: "2026", askName: "" }));
		expect(clash.status).toBe(409);
		expect(await clash.text()).toContain("Saints B12.1 is still open: close it first.");
		await admin(deps)(`/admin/teams/${G}`, form({ code: "g14.6", season: "2026", askName: "" }));
		const again = await admin(deps)("/admin/teams", form({ code: "g14.5", season: "2026", managerName: "Kim", managerEmail: "kim@example.com", askName: "" }));
		expect(again.headers.get("Location")).toBe("/admin/teams/g14.5-2026-2/welcome?emailed=sent");
	});
});

describe("closing a team", () => {
	it("makes it read-only at once, to be deleted when its season's footage is due; logged", async () => {
		const deps = await withG14();
		const res = await admin(deps)(`/admin/teams/${G}/close`, form({ when: "due", confirmCode: "" }));
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/admin/teams?done=closed"]);
		expect(await team(deps)).toMatchObject({ status: "closed", closed_at: "2026-10-15T00:00:00.000Z", delete_after: SEASON_END });
		expect(await log(deps)).toEqual([{ admin_email: MANAGER, team_id: G, action: "team_closed", detail: "deleted at the season's end" }]);
		expect(await (await admin(deps)("/admin/teams?done=closed")).text()).toContain("Season ended. The team is closed and read-only now.");
		expect(await (await admin(deps)("/admin/log")).text()).toContain("ended Saints G14.5&#39;s season and closed it, to be deleted at the season&#39;s end");
	});

	it("deletes it tonight at 3am only with its code typed", async () => {
		const deps = await withG14();
		const wrong = await admin(deps)(`/admin/teams/${G}/close`, form({ when: "tonight", confirmCode: "g14" }));
		expect(wrong.status).toBe(400);
		const page = await wrong.text();
		expect(page).toContain("Type g14.5 to delete it tonight.");
		expect(page).toMatch(/value="tonight" checked/);
		expect(await team(deps)).toMatchObject({ status: "active" });
		expect((await admin(deps)(`/admin/teams/${G}/close`, form({ when: "tonight", confirmCode: " G14.5 " }))).status).toBe(303);
		expect(await team(deps)).toMatchObject({ status: "closed", delete_after: TONIGHT });
		expect((await log(deps)).map((l) => [l.action, l.detail])).toEqual([["team_closed", "deleted tonight"]]);
	});

	it("is refused while anything in the team is uploading or streaming, but not for an upload left days ago", async () => {
		const deps = await withG14();
		const game = (await addGame(deps)).meta.last_row_id;
		const jane = await deps.db.prepare("SELECT id FROM members WHERE email = 'jane@example.com'").first<number>("id");
		await deps.db.prepare("INSERT INTO videos (team_id, game_id, status, r2_key, r2_upload_id, uploaded_by, delete_after, created_at) VALUES (?, ?, 'uploading', 'originals/x/old.mov', 'old', ?, ?, '2026-10-12T00:00:00.000Z')")
			.bind(G, game, jane, SEASON_END).run();
		expect((await admin(deps)(`/admin/teams/${G}/close`, form({ when: "due", confirmCode: "" }))).status).toBe(303);
		await deps.db.prepare("UPDATE teams SET status = 'active', closed_at = NULL, delete_after = NULL WHERE id = ?").bind(G).run();
		deps.presigner.parts.set("old", [{ partNumber: 1, etag: "e", uploaded: "2026-10-14T23:55:00.000Z" }]);
		const busy = await admin(deps)(`/admin/teams/${G}/close`, form({ when: "due", confirmCode: "" }));
		expect(busy.status).toBe(409);
		expect(await busy.text()).toContain("Saints G14.5 has an upload or live stream going: close it once that&#39;s done.");
		deps.presigner.parts.delete("old");
		await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at, last_live_at) VALUES (?, ?, 'in-1', ?, '2026-10-14T23:00:00.000Z', '2026-10-14T23:58:00.000Z')")
			.bind(G, game, jane).run();
		expect((await admin(deps)(`/admin/teams/${G}/close`, form({ when: "due", confirmCode: "" }))).status).toBe(409);
		expect(await team(deps)).toMatchObject({ status: "active" });
	});

	it("is refused for a team that's closed already", async () => {
		const deps = await withG14("closed", SEASON_END);
		const res = await admin(deps)(`/admin/teams/${G}/close`, form({ when: "due", confirmCode: "" }));
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("Saints G14.5&#39;s season is over already.");
	});
});

describe("reopening, deleting tonight and cancelling that", () => {
	const yes = (data: Record<string, string> = {}) => form({ confirm: "yes", ...data });

	it("reopens a closed team before deleting starts; logged", async () => {
		const deps = await withG14("closed", SEASON_END);
		const res = await admin(deps)(`/admin/teams/${G}/reopen`, yes());
		expect(res.headers.get("Location")).toBe("/admin/teams?done=reopened");
		expect(await team(deps)).toMatchObject({ status: "active", closed_at: null, delete_after: null });
		expect((await log(deps)).map((l) => l.action)).toEqual(["team_reopened"]);
	});

	it("won't reopen once deleting has started, or while an open team has its code", async () => {
		const started = await withG14("closed", "2026-10-14T16:00:00.000Z");
		const late = await admin(started)(`/admin/teams/${G}/reopen`, yes());
		expect(late.status).toBe(409);
		expect(await late.text()).toContain("Deleting Saints G14.5 has started, so it can&#39;t be reopened.");
		const deps = await withG14("closed", SEASON_END);
		await addTeam(deps.db, { ...G14_5, id: "g14.5-2027", seasonStart: 2027 });
		const taken = await admin(deps)(`/admin/teams/${G}/reopen`, yes());
		expect(taken.status).toBe(409);
		expect(await taken.text()).toContain("Saints G14.5 (2027/28) has its code now: close that first.");
		expect(await team(deps)).toMatchObject({ status: "closed" });
	});

	it("deletes a closed team tonight with its code typed, and cancelling puts it back to its season's date; both logged", async () => {
		const deps = await withG14("closed", SEASON_END);
		expect((await admin(deps)(`/admin/teams/${G}/delete`, form({ confirmCode: "g14.6" }))).status).toBe(400);
		expect(await team(deps)).toMatchObject({ delete_after: SEASON_END });
		expect((await admin(deps)(`/admin/teams/${G}/delete`, form({ confirmCode: "g14.5" }))).headers.get("Location")).toBe("/admin/teams?done=tonight");
		expect(await team(deps)).toMatchObject({ status: "closed", delete_after: TONIGHT });
		expect((await admin(deps)(`/admin/teams/${G}/keep`, yes())).headers.get("Location")).toBe("/admin/teams?done=kept");
		expect(await team(deps)).toMatchObject({ delete_after: SEASON_END });
		expect((await log(deps)).map((l) => l.action)).toEqual(["delete_scheduled", "delete_cancelled"]);
	});

	it("can't delete an open team, or cancel once deleting has started", async () => {
		const open = await withG14();
		expect((await admin(open)(`/admin/teams/${G}/delete`, form({ confirmCode: "g14.5" }))).status).toBe(409);
		const started = await withG14("closed", "2026-10-14T16:00:00.000Z");
		expect((await admin(started)(`/admin/teams/${G}/keep`, yes())).status).toBe(409);
	});
});

describe("the Teams page's controls", () => {
	it("offers Open and a More menu: View as, Edit, and End season and close team while it's running; Reopen and Delete tonight once its season's over; Cancel once it's set for tonight", async () => {
		const deps = await withG14("closed", SEASON_END);
		await addTeam(deps.db, { ...G14_5, id: "b14.2-2026", code: "b14.2", name: "Saints U14 Boys 14.2", status: "closed", closedAt: "2026-10-01T00:00:00.000Z", deleteAfter: TONIGHT });
		await addTeam(deps.db, { ...G14_5, id: "b16.1-2026", code: "b16.1", name: "Saints U16 Boys 16.1", status: "closed", closedAt: "2026-10-01T00:00:00.000Z", deleteAfter: "2026-10-14T16:00:00.000Z" });
		const page = await (await admin(deps)("/admin/teams")).text();
		const row = (label: string) => page.slice(page.indexOf(`<b>${label}</b>`), page.indexOf("</tr>", page.indexOf(`<b>${label}</b>`)));
		const menu = (label: string) => row(label).slice(row(label).indexOf('<details class="rowmenu">'));
		expect(menu("Saints B12.1")).toContain('<summary class="btn">More<span class="sr"> for Saints B12.1</span></summary>');
		expect(menu("Saints B12.1")).toContain(`<a href="/admin/teams/${B12_1.id}/edit">Edit</a>`);
		expect(menu("Saints B12.1")).toContain(`<a class="danger" href="/admin/teams/${B12_1.id}/close">End season and close team</a>`);
		expect(row("Saints G14.5")).toContain("To be deleted Fri 31 Dec 2027");
		expect(menu("Saints G14.5")).toContain(`<a href="/admin/teams/${G}/reopen">Reopen</a>`);
		expect(menu("Saints G14.5")).toContain(`<a class="danger" href="/admin/teams/${G}/delete">Delete tonight</a>`);
		expect(row("Saints B14.2")).toContain("To be deleted at 3am Fri 16 Oct");
		expect(menu("Saints B14.2")).toContain('<a href="/admin/teams/b14.2-2026/keep">Cancel tonight&#39;s delete</a>');
		expect(row("Saints B14.2")).not.toContain("Delete tonight");
		expect(row("Saints B16.1")).toContain("Being deleted");
		expect(row("Saints B16.1")).not.toMatch(/reopen|keep|Delete tonight|\/edit|rowmenu/);
	});

	it("has a page for each: edit, close and delete tonight", async () => {
		const deps = await withG14();
		expect(await (await admin(deps)(`/admin/teams/${G}/edit`)).text()).toContain(`<form class="panel stack" method="post" action="/admin/teams/${G}">`);
		const close = await (await admin(deps)(`/admin/teams/${G}/close`)).text();
		expect(close).toContain("<h1>End Saints G14.5&#39;s season</h1>");
		expect(close).toContain('<a class="backlink" href="/admin/teams">‹ Teams</a>');
		expect(close).toContain("When they&#39;re due: Fri 31 Dec 2027");
		expect(close).toContain('<input type="radio" name="when" value="due" checked>');
		expect(close).toContain('<button class="btn danger">End the season and close Saints G14.5</button>');
		expect(await (await admin(deps)(`/admin/teams/${G}/delete`)).text()).toContain("Saints G14.5&#39;s season isn&#39;t over: end it first.");
		await deps.db.prepare("UPDATE teams SET status = 'closed', delete_after = ? WHERE id = ?").bind(TONIGHT, G).run();
		const reopen = await (await admin(deps)(`/admin/teams/${G}/reopen`)).text();
		expect(reopen).toContain(`<form class="panel stack" method="post" action="/admin/teams/${G}/reopen"><input type="hidden" name="confirm" value="yes">`);
		const keep = await (await admin(deps)(`/admin/teams/${G}/keep`)).text();
		expect(keep).toContain("Saints G14.5 is set to be deleted at 3am Fri 16 Oct. Cancel that, and it stays until Fri 31 Dec 2027.");
		expect(keep).toContain(`action="/admin/teams/${G}/keep"><input type="hidden" name="confirm" value="yes">`);
	});
});
