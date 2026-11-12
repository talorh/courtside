import { describe, expect, it } from "vitest";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";
import { getGame, listGamesWithVideoStatus } from "../../../src/features/games/games-repository.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { aDayLater } from "../../helpers/purge.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

const game = { date: "2026-10-25", hour: "10", minute: "20", period: "am", competition: "VJBL", roundLabel: "10", opponent: "", venue: "Saints Stadium, Ct 2", video: "live" };

describe("fixture routes", () => {
	it("lets an admin add, edit and delete a game", async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		const added = await client("/fixture", form(game));
		expect(added.headers.get("Location")).toBe("/fixture?done=added");
		const page = await (await client("/fixture?done=added")).text();
		expect(page).toContain("Round 10 · vs TBC");
		expect(page).toContain("Game added.");
		expect(page).toContain("<th>Type</th>");
		expect(page).toContain('<td class="f-type"><span class="t src">VJBL</span></td>');
		const [{ game: saved }] = await listGamesWithVideoStatus(deps.db, deps.team.id);
		await client(`/fixture/${saved!.id}`, form({ ...game, opponent: "Lakeside Rockets" }));
		expect(await (await client("/fixture")).text()).toContain("Round 10 · vs Lakeside Rockets");
		expect((await client(`/fixture/${saved!.id}/delete`, form({ confirm: "yes" }))).status).toBe(303);
	});
	it("defaults a new game to 6:40pm on the coming Friday", async () => {
		const page = await (await makeClient(createTestDeps())("/fixture")).text();
		expect(page).toContain('name="date" type="date" required value="2026-10-16"');
		expect(page).toMatch(/<option value="6" selected>6<\/option>/);
		expect(page).toMatch(/<option value="40" selected>40<\/option>/);
		expect(page).toMatch(/<option value="pm" selected>pm<\/option>/);
		expect(page).not.toContain('type="time"');
	});
	it("defaults a U14 team's new game to its own usual tip-off, 7:40pm", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		await addMember(deps.db, G14_5.id, "jane@x.com", "manager", "Jane");
		const page = await (await makeClient(deps, { email: "jane@x.com", team: G14_5.id })("/fixture")).text();
		expect(page).toMatch(/<option value="7" selected>7<\/option>/);
		expect(page).toMatch(/<option value="40" selected>40<\/option>/);
		expect(page).toMatch(/<option value="pm" selected>pm<\/option>/);
	});
	it("labels each game's video stage: uploading, processing, ready, failed", async () => {
		const deps = createTestDeps();
		const add = (opponent: string) => deps.db.prepare("INSERT INTO games (team_id, starts_at, competition, opponent) VALUES (?, '2026-10-11T18:40', 'VJBL', ?)").bind(deps.team.id, opponent).run().then((r) => r.meta.last_row_id);
		for (const [opponent, status] of [["Up", "uploading"], ["Proc", "processing"], ["Done", "ready"], ["Bad", "failed"]] as const) {
			const gameId = await add(opponent);
			await deps.db.prepare("INSERT INTO videos (team_id, game_id, status, delete_after) VALUES (?, ?, ?, 'x')").bind(deps.team.id, gameId, status).run();
		}
		const page = await (await makeClient(deps)("/fixture")).text();
		const label = (opponent: string) => page.split(`vs ${opponent}</a>`)[1]?.match(/<span class="role[^"]*">([^<]+)<\/span>/)?.[1];
		expect([label("Up"), label("Proc"), label("Done"), label("Bad")]).toEqual(["Uploading", "Processing", "Has video", "Upload failed"]);
	});
	it("rejects invalid input with a 400 page, a date that doesn't exist included", async () => {
		const client = makeClient(createTestDeps());
		expect((await client("/fixture", form({ ...game, date: "25/10/2026" }))).status).toBe(400);
		expect((await client("/fixture", form({ ...game, date: "2026-02-31" }))).status).toBe(400);
	});
	it("a game with video can be re-dated, before the season's October too: its video's deletion date is its team's", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		const videoId = await seedVideo(deps, { gameId, streamUid: "u1", deleteAfter: "2027-12-31T13:00:00.000Z" });
		const client = makeClient(deps);
		expect((await client(`/fixture/${gameId}`, form({ ...game, date: "2026-09-25" }))).status).toBe(303);
		expect((await getGame(deps.db, deps.team.id, gameId))?.startsAt.slice(0, 10)).toBe("2026-09-25");
		expect((await getVideo(deps.db, deps.team.id, videoId))?.deleteAfter).toBe("2027-12-31T13:00:00.000Z");
	});
	it("only team managers change the fixture, the roster and members: a coach sees the fixture and roster, nothing else", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'coach@x.com', 'coach')").bind(deps.team.id).run();
		const gameId = await seedGame(deps, { startsAt: "2026-10-23T18:40" });
		const coach = makeClient(deps, "coach@x.com");
		const page = await (await coach(`/fixture?edit=${gameId}`)).text();
		expect(page).toContain('href="/fixture"');
		expect(page).not.toMatch(/<form|Add game|Edit game|No video<\/button>|Delete/);
		expect(page).not.toContain('href="/manage"');
		for (const path of ["/fixture", `/fixture/${gameId}`, `/fixture/${gameId}/delete`, "/fixture/link", "/fixture/import",
			"/fixture/playhq", "/roster/families", "/roster/generate", "/members"]) {
			expect((await coach(path, form(game))).status, path).toBe(403);
		}
		for (const path of ["/manage", "/members", "/fixture/sample.csv", "/roster/week/2026-10-19/message"]) expect((await coach(path)).status, path).toBe(403);
		expect((await coach("/roster")).status).toBe(200);
		// The team manager's page has no "who can see this" line over the title.
		expect(await (await makeClient(deps)("/fixture")).text()).toContain('<div class="pagehead"><h1>Fixture</h1></div>');
	});
	it("a game is In progress for the hour after tip-off, then Complete (or Waiting for video for coaches)", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'pat@x.com', 'watcher')").bind(deps.team.id).run();
		await seedGame(deps, { startsAt: "2026-10-23T18:30", opponent: "Northside 2" });
		const at = (local: string) => ({ ...deps, now: () => new Date(`${local}:00+11:00`) });
		const status = async (local: string, email?: string) =>
			/<td class="f-status"><span class="role[^"]*">([^<]+)</.exec(await (await makeClient(at(local), email)("/fixture")).text())?.[1];
		expect(await status("2026-10-23T18:29", "pat@x.com")).toBe("Upcoming");
		expect(await status("2026-10-23T18:30", "pat@x.com")).toBe("In progress");
		expect(await status("2026-10-23T19:29", "pat@x.com")).toBe("In progress");
		expect(await status("2026-10-23T19:30", "pat@x.com")).toBe("Complete");
		expect(await status("2026-10-23T19:00")).toBe("In progress");
		expect(await status("2026-10-23T19:30")).toBe("Waiting for video");
	});
	it("everyone else sees the fixture, but can't change it", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Lakeside Rockets", venue: "Saints Stadium, Court 2" });
		const played = await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "Played" });
		await seedVideo(deps, { gameId: played, streamUid: "u" });
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'sam@x.com', 'filmer'), (?, 'pat@x.com', 'watcher')")
			.bind(deps.team.id, deps.team.id).run();
		for (const email of ["sam@x.com", "pat@x.com"]) {
			const client = makeClient(deps, email);
			const page = await (await client(`/fixture?edit=${gameId}&delete=${gameId}`)).text();
			expect(page).toContain("vs Lakeside Rockets");
			expect(page).toContain("Saints Stadium, Court 2");
			expect(page).toContain('href="/fixture"');
			expect(page).not.toMatch(/<form|Add game|Add fixture|Edit game|No video<\/button>|Delete|PlayHQ fixtures/);
			// Just whether each game is still to come or played: no video column.
			expect(page).toContain("<th>Status</th>");
			expect(page).toContain('<span class="role">Upcoming</span>');
			expect(page).toContain('<span class="role c">Complete</span>');
			expect(page).not.toMatch(/<th>Video<\/th>|Has video|Waiting for video/);
			expect((await client("/fixture", form(game))).status).toBe(403);
			expect((await client(`/fixture/${gameId}`, form(game))).status).toBe(403);
			expect((await client(`/fixture/${gameId}/delete`, form({ confirm: "yes" }))).status).toBe(403);
			expect((await client("/fixture/sample.csv")).status).toBe(403);
		}
	});
});

describe("deleting a game with its footage", () => {
	async function setup() {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'coach@x.com', 'coach')").bind(deps.team.id).run();
		const gameId = await seedGame(deps);
		await seedVideo(deps, { gameId, streamUid: "u1", r2Key: "originals/a.mov" });
		await seedVideo(deps, { gameId, status: "failed", streamUid: "u0", r2Key: "originals/old.mov" });
		return { deps, gameId };
	}
	it("admin confirms, then the game, videos, originals and clips all go", async () => {
		const { deps, gameId } = await setup();
		const admin = makeClient(deps);
		await admin("/videos/1/clips", form({ start: "0:10", end: "0:20" }));
		// Delete game and video asks first, in place (every delete asks).
		const list = await (await admin("/fixture")).text();
		expect(list).toContain(`<summary class="btn quiet">Delete game and video</summary><form method="post" action="/fixture/${gameId}/delete-all" class="confirmpanel">`);
		expect(list).toContain("The game, its video and its clips are deleted. The files are kept for 24 hours in case it was a mistake, then they&#39;re gone for good.");
		const res = await admin(`/fixture/${gameId}/delete-all`, form({ confirm: "yes" }));
		expect(res.headers.get("Location")).toBe("/fixture?done=deletedall");
		expect(await listGamesWithVideoStatus(deps.db, deps.team.id)).toEqual([]);
		await aDayLater(deps);
		expect(deps.stream.deleted.sort()).toEqual(["clip-1", "u0", "u1"]);
		expect(deps.originals.removed.sort()).toEqual(["originals/a.mov", "originals/old.mov"]);
		expect(await listGamesWithVideoStatus(deps.db, deps.team.id)).toEqual([]);
	});
	it("coaches can't, and don't see the option", async () => {
		const { deps, gameId } = await setup();
		const coach = makeClient(deps, "coach@x.com");
		expect(await (await coach("/fixture")).text()).not.toContain("Delete game and video");
		expect((await coach(`/fixture/${gameId}/delete-all`, form({ confirm: "yes" }))).status).toBe(403);
	});
});

describe("fixture order", () => {
	it("lists games oldest first, like the Games list", async () => {
		const deps = createTestDeps();
		const later = await seedGame(deps, { startsAt: "2026-11-07T18:40", opponent: "Later" });
		const sooner = await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Sooner" });
		const page = await (await makeClient(deps)("/fixture")).text();
		expect(page.indexOf(`href="/games/${sooner}"`)).toBeLessThan(page.indexOf(`href="/games/${later}"`));
	});
});

describe("the season's phase on the game form", () => {
	it("a VJBL game can be given its phase, shown on Edit; another competition's is never kept", async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		const game = { date: "2026-11-27", hour: "7", minute: "40", period: "pm", roundLabel: "2", opponent: "Hillcrest 2", venue: "", video: "live" };
		await client("/fixture", form({ ...game, competition: "VJBL", phase: "grading1" }));
		await client("/fixture", form({ ...game, date: "2026-11-28", competition: "Tournament", phase: "grading1" }));
		const list = async () => (await listGamesWithVideoStatus(deps.db, deps.team.id)).map((r) => [r.game.competition, r.game.phase]).sort();
		expect(await list()).toEqual([["Tournament", null], ["VJBL", "grading1"]]);
		const [vjbl] = (await listGamesWithVideoStatus(deps.db, deps.team.id)).filter((r) => r.game.competition === "VJBL");
		const edit = await (await client(`/fixture?edit=${vjbl!.game.id}`)).text();
		expect(edit).toContain('<option value="grading1" selected>Grading phase 1</option>');
		expect(edit).toContain('<option value="">Not set</option>');
		// Saved without a phase, it has none; a phase the form doesn't know is refused.
		expect((await client(`/fixture/${vjbl!.game.id}`, form({ ...game, competition: "VJBL", phase: "" }))).status).toBe(303);
		expect(await list()).toEqual([["Tournament", null], ["VJBL", null]]);
		expect((await client(`/fixture/${vjbl!.game.id}`, form({ ...game, competition: "VJBL", phase: "finals" }))).status).toBe(400);
	});
});
