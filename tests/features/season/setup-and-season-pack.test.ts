import { afterEach, describe, expect, it, vi } from "vitest";
import { setupSteps } from "../../../src/features/teams/team-setup.ts";
import { setupCounts } from "../../../src/features/teams/team-setup-repository.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { addMember } from "../../helpers/two-teams.ts";

// Manage team's setup checklist (at the top, until every step's done; on admin Teams too) and its end-of-season pack (at
// the bottom: every game's HD video, each player's clips, the photos and the roster).

afterEach(() => vi.restoreAllMocks());

const counts = { players: 7, filmers: 1, coaches: 1, managers: 1, games: 1, duties: 1 };
const manage = async (deps: TestDeps) => (await makeClient(deps)("/manage")).text();

describe("the setup checklist", () => {
	it("counts the squad entered at seven players, and the people step done with someone set to Watch and film, a coach and a team manager", () => {
		const step = (label: string, c: Partial<typeof counts>) => setupSteps({ ...counts, ...c }).find((s) => s.label === label)!;
		const squad = (c: Partial<typeof counts>) => step("Squad entered", c);
		expect(squad({}).done).toBe(true);
		expect(squad({ players: 6 })).toMatchObject({ done: false, how: "Add at least 7 players on Manage team. So far: 6." });
		expect(squad({ players: 10 }).done).toBe(true);
		const people = (c: Partial<typeof counts>) => step("Who films, the coach and the team manager added", c);
		expect(people({}).done).toBe(true);
		expect(people({ filmers: 0 })).toMatchObject({ done: false });
		expect(people({ filmers: 0 }).how).toBe("Under People, add at least one person set to Watch and film, the coach and a team manager. So far: nobody set to Watch and film yet; the coach added; the team manager added.");
		expect(people({ coaches: 0 })).toMatchObject({ done: false });
		expect(people({ coaches: 0 }).how).toContain("; no coach yet;");
		expect(people({ managers: 0 })).toMatchObject({ done: false });
		expect(people({ managers: 0, filmers: 3 }).how).toContain("So far: 3 set to Watch and film; the coach added; no team manager yet.");
		expect(setupSteps(counts)).toHaveLength(4);
		expect(setupSteps(counts).every((s) => s.done)).toBe(true);
	});

	it("counts a team's current people by role, leaving out anyone removed or hidden", async () => {
		const deps = createTestDeps();
		await addMember(deps.db, deps.team.id, "coach@x.com", "coach");
		await addMember(deps.db, deps.team.id, "filmer@x.com", "filmer");
		await addMember(deps.db, deps.team.id, "gone@x.com", "filmer");
		await deps.db.prepare("UPDATE members SET removed_at = '2026-10-01T00:00:00.000Z' WHERE email = 'gone@x.com'").run();
		expect(await setupCounts(deps.db, deps.team.id)).toMatchObject({ players: 10, filmers: 1, coaches: 1, managers: 1, games: 0, duties: 0 });
	});

	it("is at the top of Manage team while there's a step to do, and gone once every step's done", async () => {
		const deps = createTestDeps();
		const page = await manage(deps);
		expect(page).toMatch(/<h2 id="setup-h">Getting the team ready: \d of 4 done<\/h2>/);
		expect(page.indexOf('id="setup-h"')).toBeLessThan(page.indexOf('id="players-h"'));
		expect(page).toContain('<a href="/manage#people">Who films, the coach and the team manager added</a>');
		await addMember(deps.db, deps.team.id, "filmer@x.com", "filmer");
		await addMember(deps.db, deps.team.id, "coach@x.com", "coach");
		const game = await seedGame(deps, { startsAt: "2026-11-07T09:00" });
		const family = await deps.db.prepare("INSERT INTO roster_families (team_id, surname) VALUES (?, 'Smith')").bind(deps.team.id).run();
		await deps.db.prepare("INSERT INTO roster_slots (team_id, week, duty, position, game_id, family_id) VALUES (?, '2026-11-02', 'scoring', 1, ?, ?)").bind(deps.team.id, game, family.meta.last_row_id).run();
		expect(await manage(deps)).not.toContain('id="setup-h"');
	});

	it("shows on the admin area's Teams: how far each running team has got, and what's left", async () => {
		const deps = createTestDeps();
		const page = await (await makeClient(deps)("/admin/teams")).text();
		expect(page).toMatch(/<td class="t-setup"><span class="t warn">\d of 4<\/span><span class="sub">Still to add: [^<]*who films, the coach and the team manager/);
	});
});

describe("the end-of-season pack", () => {
	it("lists every game's HD video, each player's clips under their name, and the photos and roster, at the bottom", async () => {
		const deps = createTestDeps();
		const game = await seedGame(deps, { startsAt: "2026-11-07T09:00", opponent: "Lakeside Rockets" });
		const video = await seedVideo(deps, { gameId: game, streamUid: "uid-pack" });
		const clip = (label: string) => deps.db.prepare("INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, stream_uid) VALUES (?, ?, ?, 10, 20, 'ready', ?)")
			.bind(deps.team.id, video, label, `clip-${label}`).run().then((r) => r.meta.last_row_id);
		const [steal, block] = [await clip("Steal"), await clip("Block")];
		const steph = (await deps.db.prepare("SELECT id FROM players WHERE team_id = ? ORDER BY number LIMIT 1").bind(deps.team.id).first<{ id: number }>())!.id;
		await deps.db.prepare("INSERT INTO clip_players (team_id, clip_id, player_id) VALUES (?, ?, ?)").bind(deps.team.id, steal, steph).run();
		const page = await manage(deps);
		const pack = page.slice(page.indexOf('id="season-pack"'));
		expect(page.indexOf('id="season-pack"')).toBeGreaterThan(page.indexOf('id="addperson"'));
		// Folded until it's opened.
		expect(page).toContain('<details class="panel seasonpack" id="season-pack"><summary><h2>End of season: keep it all</h2>');
		expect(pack).toContain("This season's videos, clips and photos are deleted after <b>Fri 31 Dec 2027</b>.");
		expect(pack).toContain(`<a href="/videos/${video}/download/hd">`);
		expect(pack).toMatch(new RegExp(`<summary>#\\d+ [^<]+ <span class="small">1 clip</span></summary><ul class="packlist"><li><a href="/clips/${steal}/download">Steal</a>`));
		expect(pack).toMatch(new RegExp(`<summary>No one in the squad tagged <span class="small">1 clip</span></summary><ul class="packlist"><li><a href="/clips/${block}/download">Block</a>`));
		expect(pack).toContain('0 photos: <a href="/photos">save them on Photos</a>');
		await deps.db.prepare("INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at) VALUES (?, 'img-1', '2026-11-07T09:00:00', 10, 10, 10, 1, '2027-12-31T13:00:00.000Z', '2026-11-07T00:00:00.000Z')").bind(deps.team.id).run();
		expect(await manage(deps)).toContain('1 photo: <a href="/photos">save it on Photos</a>');
		expect(pack).toContain('<a href="/roster/export.xlsx">');
	});

	it("asks Stream for every HD copy not made yet, and says they're all ready when they are", async () => {
		const deps = createTestDeps();
		const [a, b] = [await seedGame(deps, { startsAt: "2026-11-07T09:00" }), await seedGame(deps, { startsAt: "2026-11-14T09:00" })];
		await seedVideo(deps, { gameId: a, streamUid: "uid-a" });
		await seedVideo(deps, { gameId: b, streamUid: "uid-b" });
		deps.stream.downloads.set("uid-b", "ready");
		const client = makeClient(deps);
		const asked = await client("/season-pack/hd", form({}));
		expect([asked.status, asked.headers.get("Location")]).toEqual([303, "/manage?done=hdasked#season-pack"]);
		expect([deps.stream.downloads.get("uid-a"), deps.stream.downloads.get("uid-b")]).toEqual(["inprogress", "ready"]);
		deps.stream.downloads.set("uid-a", "ready");
		expect((await client("/season-pack/hd", form({}))).headers.get("Location")).toBe("/manage?done=hdready#season-pack");
		const after = await (await client("/manage?done=hdready")).text();
		expect(after).toContain("Every game&#39;s HD copy is ready to download.");
		// Open straight after its button, to show how it went.
		expect(after).toContain('<details class="panel seasonpack" id="season-pack" open>');
	});

	it("is the team manager's: someone set to Watch and film can't ask for it", async () => {
		const deps = createTestDeps();
		await addMember(deps.db, deps.team.id, "film@x.com", "filmer");
		const res = await makeClient(deps, { email: "film@x.com" })("/season-pack/hd", form({}));
		expect(res.status).toBe(403);
	});

	it("carries on past a game whose HD copy Stream won't make, and says some couldn't be made", async () => {
		const deps = createTestDeps();
		const [a, b] = [await seedGame(deps, { startsAt: "2026-11-07T09:00" }), await seedGame(deps, { startsAt: "2026-11-14T09:00" })];
		await seedVideo(deps, { gameId: a, streamUid: "uid-a" });
		await seedVideo(deps, { gameId: b, streamUid: "uid-b" });
		deps.stream.downloads.set("uid-a", "error");
		vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await makeClient(deps)("/season-pack/hd", form({}));
		expect(res.headers.get("Location")).toBe("/manage?done=hdsome#season-pack");
		expect(deps.stream.downloads.get("uid-b")).toBe("inprogress");
	});

	it("says the day a closed team's footage really goes, when it's set to go tonight", async () => {
		const deps = { ...createTestDeps(), now: () => new Date("2026-11-20T05:00:00.000Z") };
		await deps.db.prepare("UPDATE teams SET status = 'closed', closed_at = '2026-11-20T04:00:00.000Z', delete_after = '2026-11-20T16:00:00.000Z' WHERE id = ?").bind(deps.team.id).run();
		const page = await manage(deps);
		expect(page).toContain("deleted after <b>Fri 20 Nov 2026</b>");
		expect(page).not.toContain('id="setup-h"');
	});

	it("is pointed to from Home's notice before the season's footage goes, for the team manager", async () => {
		const deps = { ...createTestDeps(), now: () => new Date("2027-11-15T00:00:00.000Z") };
		const home = await (await makeClient(deps)("/")).text();
		expect(home).toContain('<a href="/manage#season-pack">The end-of-season pack</a> on Manage team has them all.');
		await addMember(deps.db, deps.team.id, "fam@x.com", "watcher");
		expect(await (await makeClient(deps, { email: "fam@x.com" })("/")).text()).not.toContain("season-pack");
	});

	it("keeps a clip of a player since taken off the squad, with the clips no one in the squad is tagged in", async () => {
		const deps = createTestDeps();
		const video = await seedVideo(deps, { gameId: await seedGame(deps, { startsAt: "2026-11-07T09:00" }), streamUid: "uid-gone" });
		const clip = (await deps.db.prepare("INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, stream_uid) VALUES (?, ?, 'Dunk', 10, 20, 'ready', 'clip-dunk')")
			.bind(deps.team.id, video).run()).meta.last_row_id;
		const left = (await deps.db.prepare("SELECT id FROM players WHERE team_id = ? ORDER BY number LIMIT 1").bind(deps.team.id).first<{ id: number }>())!.id;
		await deps.db.prepare("INSERT INTO clip_players (team_id, clip_id, player_id) VALUES (?, ?, ?)").bind(deps.team.id, clip, left).run();
		await deps.db.prepare("UPDATE players SET removed_at = '2026-11-10T00:00:00.000Z' WHERE id = ?").bind(left).run();
		expect(await manage(deps)).toMatch(new RegExp(`<summary>No one in the squad tagged <span class="small">1 clip</span></summary><ul class="packlist"><li><a href="/clips/${clip}/download">Dunk</a>`));
	});
});
