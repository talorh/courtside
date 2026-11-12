import { afterEach, describe, expect, it, vi } from "vitest";
import { listGamesWithVideoStatus } from "../../../src/features/games/games-repository.ts";
import { listPlayhqFixtures } from "../../../src/features/games/playhq-repository.ts";
import { checkPlayhqFixturesDue, parsePlayhqLink, shortTeamName, toPlayhqGameInput } from "../../../src/features/games/playhq-service.ts";
import type { PlayhqTeamFixture } from "../../../src/platform/playhq.ts";
import { getActiveVideoForGame } from "../../../src/features/videos/videos-repository.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { countingDb } from "../../helpers/counting-db.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedVideo } from "../../helpers/seed.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

afterEach(() => vi.restoreAllMocks());

const LINK = "https://www.playhq.com/example-association/org/saints-basketball-club/99bec93e/junior-basketball-league-202526/teams/saints-b12\.1-2026-1/8fab8b8c";
const team = (): PlayhqTeamFixture => ({
	name: "Saints U12 Boys 1 · U12 Boys - VJL1 (P1) · 2026/27",
	games: [
		{ id: "g1", round: "Round 1", date: "2026-10-30", time: "18:40", opponent: "Hillcrest U12 Boys 3", venue: "Saints Stadium, Court 1" },
		{ id: "g2", round: "Round 2", date: "2026-11-06", time: null, opponent: null, venue: "" },
	],
});
const games = async (deps: TestDeps) => (await listGamesWithVideoStatus(deps.db, deps.team.id)).map((r) => r.game).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
const later = (deps: TestDeps, hours: number) => ({ ...deps, now: () => new Date(deps.now().getTime() + hours * 3_600_000) });

async function added(t = team(), competition = "VJBL") {
	const deps = createTestDeps();
	deps.playhq.teams.set("8fab8b8c", t);
	const client = makeClient(deps);
	const res = await client("/fixture/playhq", form({ url: LINK, competition }));
	return { deps, client, res };
}

describe("PlayHQ links and games", () => {
	it("reads the team from a PlayHQ team link, and nothing else", () => {
		expect(parsePlayhqLink(LINK)).toEqual({ tenant: "example-association", teamId: "8fab8b8c" });
		expect(parsePlayhqLink(`${LINK}/fixture`).teamId).toBe("8fab8b8c");
		for (const bad of ["https://example.com/example-association/org/x/teams/y/8fab8b8c", "https://www.playhq.com/example-association/org/x", "not a link"]) {
			expect(() => parsePlayhqLink(bad)).toThrow(/isn't a PlayHQ team link/);
		}
	});
	it("knows a private PlayHQ link (My teams, signed in) and says to use the team's public page", () => {
		const mine = "https://www.playhq.com/account/my-teams/example-association/saints-b12\.1-2026-1/8fab8b8c?id=5f4a9c79-3ec5-48e6-b0e6-74f5eb6dcb67";
		expect(() => parsePlayhqLink(mine)).toThrow("That's a private PlayHQ link (from My teams, when you're signed in to PlayHQ), so the site can't read it. Use the team's public page instead: find the team on playhq.com without signing in and copy its address. It has /org/ and /teams/ in it.");
		expect(() => parsePlayhqLink("https://playhq.com/account/my-teams")).toThrow(/private PlayHQ link/);
	});
	it("shortens names, numbers rounds and fills in what PlayHQ hasn't set yet", () => {
		expect(shortTeamName("Hillcrest U12 Boys 3")).toBe("Hillcrest 3");
		expect(shortTeamName("Lakeside U12 Boys")).toBe("Lakeside");
		const [first, second] = team().games;
		expect(toPlayhqGameInput("VJBL", { ...second!, round: "Round 2" }, "19:40").startsAt).toBe("2026-11-06T19:40");
		expect(toPlayhqGameInput("VJBL", first!, "19:40").startsAt).toBe("2026-10-30T18:40");
		expect(toPlayhqGameInput("VJBL", first!, "18:40")).toEqual({ startsAt: "2026-10-30T18:40", competition: "VJBL", roundLabel: "1", opponent: "Hillcrest 3", venue: "Saints Stadium, Court 1", phase: "championship" });
		expect(toPlayhqGameInput("Tournament", { ...second!, round: "Finals Round 1" }, "18:40")).toMatchObject({ startsAt: "2026-11-06T18:40", roundLabel: "Finals Round 1", opponent: "TBC" });
		expect(toPlayhqGameInput("Tournament", first!, "18:40").roundLabel).toBe("Round 1");
	});
});

describe("Add fixture", () => {
	it("gives a game PlayHQ hasn't set a time for the team's own usual tip-off: 7:40pm for a U14 team", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		await addMember(deps.db, G14_5.id, "jane@x.com", "manager", "Jane");
		deps.playhq.teams.set("8fab8b8c", team());
		await makeClient(deps, { email: "jane@x.com", team: G14_5.id })("/fixture/playhq", form({ url: LINK, competition: "VJBL" }));
		const u14 = (await listGamesWithVideoStatus(deps.db, G14_5.id)).map((r) => r.game.startsAt).sort();
		expect(u14).toEqual(["2026-10-30T18:40", "2026-11-06T19:40"]);
	});
	it("saves the link, brings in its games and lists it with Check now and Remove", async () => {
		const { deps, client, res } = await added();
		expect(res.headers.get("Location")).toBe("/fixture?done=playhqadded");
		expect((await games(deps)).map((g) => [g.startsAt, g.roundLabel, g.opponent])).toEqual([["2026-10-30T18:40", "1", "Hillcrest 3"], ["2026-11-06T18:40", "2", "TBC"]]);
		const page = await (await client("/fixture?done=playhqadded")).text();
		expect(page).toContain("PlayHQ fixture added");
		expect(page).toContain("Saints U12 Boys 1 · U12 Boys - VJL1 (P1) · 2026/27</a> · 2 games");
		expect(page).toContain("Checked every 8 hours until Fri 18 Dec, six weeks after its last game, for later rounds and finals.");
		expect(page).toContain("Round 1 · vs Hillcrest 3");
		expect(page).toContain("<summary class=\"btn primary\">Add game</summary>");
		expect(page).toContain("<summary class=\"btn primary\">Add fixture</summary>");
	});
	it("turns away a link that isn't a team, a team PlayHQ doesn't have, and one already added", async () => {
		const { client } = await added();
		expect((await client("/fixture/playhq", form({ url: "https://www.playhq.com/x", competition: "VJBL" }))).status).toBe(400);
		expect((await client("/fixture/playhq", form({ url: LINK.replace("8fab8b8c", "deadbeef"), competition: "Tournament" }))).status).toBe(400);
		expect((await client("/fixture/playhq", form({ url: LINK, competition: "VJBL" }))).status).toBe(409);
	});
	it("links a game already added by hand on that day instead of adding it twice; practice matches are left alone", async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		await client("/fixture", form({ date: "2026-10-30", hour: "7", minute: "0", period: "pm", competition: "VJBL", roundLabel: "", opponent: "", venue: "", video: "live" }));
		await client("/fixture", form({ date: "2026-10-23", hour: "6", minute: "40", period: "pm", competition: "Practice match", roundLabel: "", opponent: "", venue: "", video: "live" }));
		deps.playhq.teams.set("8fab8b8c", team());
		await client("/fixture/playhq", form({ url: LINK, competition: "VJBL" }));
		expect((await games(deps)).map((g) => [g.startsAt, g.competition, g.opponent])).toEqual([
			["2026-10-23T18:40", "Practice match", "TBC"], ["2026-10-30T18:40", "VJBL", "Hillcrest 3"], ["2026-11-06T18:40", "VJBL", "TBC"],
		]);
	});
});


describe("The season's phases", () => {
	it("reads each VJBL game's phase of the season from its PlayHQ grade, and the Fixture shows it", async () => {
		const t = team();
		t.games = [
			{ id: "p1", round: "Round 2", date: "2026-11-27", time: "19:40", opponent: "Hillcrest U12 Boys 2", venue: "Saints Stadium", grade: "12 Boys Grading 1 - Pool 2D" },
			{ id: "x1", round: "Round 1", date: "2026-12-11", time: "18:40", opponent: "Hillcrest U12 Boys 2", venue: "", grade: "12 Boys Grading 1 - Crossover" },
			{ id: "p2", round: "Round 1", date: "2027-02-05", time: "18:40", opponent: "Westside U12 Boys 1", venue: "", grade: "U12 Boys Grading 2 - AA Pool B" },
			{ id: "c14", round: "Round 14", date: "2027-06-04", time: "18:40", opponent: "Lakeside U12 Boys 2", venue: "", grade: "U12 Boys - VJL1 (P1)" },
		];
		const { deps, client } = await added(t);
		expect((await games(deps)).map((g) => [g.roundLabel, g.phase])).toEqual([["2", "grading1"], ["1", "crossover"], ["1", "grading2"], ["14", "championship"]]);
		const page = await (await client("/fixture")).text();
		expect(page).toContain("Grading phase 1, Round 2 · vs Hillcrest 2");
		expect(page).toContain("Crossover game · vs Hillcrest 2");
		expect(page).toContain("Grading phase 2, Round 1 · vs Westside 1");
		expect(page).toContain("Round 14 · vs Lakeside 2");
		expect(page).toContain('<span class="t src">VJBL</span> <span class="t src">Grading phase 1</span>');
		expect(page).toContain('<span class="t src">VJBL</span> <span class="t src">Championship season</span>');
		// Everyone's view of the Fixture says it too.
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'w@x.com', 'Wil', 'watcher')").bind(deps.team.id).run();
		expect(await (await makeClient(deps, "w@x.com")("/fixture")).text()).toContain('<span class="t src">VJBL</span> <span class="t src">Crossover game</span>');
	});
	it("a tournament's games have no phase, whatever PlayHQ calls the grade", async () => {
		const t = team();
		t.games = [{ ...t.games[0]!, grade: "U12 Boys Division 1" }];
		const { deps, client } = await added(t, "Tournament");
		expect((await games(deps)).map((g) => g.phase)).toEqual([null]);
		expect(await (await client("/fixture")).text()).toContain('<span class="t src">Tournament</span></td>');
	});
	it("a played grading game PlayHQ drops keeps its phase, and a game PlayHQ moves to another grade changes its", async () => {
		const t = team();
		t.games = [{ ...t.games[0]!, grade: "12 Boys Grading 1 - Pool 2D" }, { ...t.games[1]!, grade: "12 Boys Grading 1 - Pool 2D" }];
		const { deps, client } = await added(t);
		const [fixture] = await listPlayhqFixtures(deps.db, deps.team.id);
		deps.playhq.teams.set("8fab8b8c", { ...t, games: [{ ...t.games[1]!, grade: "12 Boys Grading 1 - Crossover" }] });
		await client(`/fixture/playhq/${fixture!.id}/check`, { method: "POST" });
		expect((await games(deps)).map((g) => [g.roundLabel, g.phase, g.playhqGone])).toEqual([["1", "grading1", true], ["2", "crossover", false]]);
	});
});

describe("A whole season", () => {
	it("comes in with a handful of database trips, well inside the free plan's 50 per request", async () => {
		const deps = createTestDeps();
		const season = team();
		season.games = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, round: `Round ${i + 1}`, date: `2027-0${1 + Math.floor(i / 4) % 9}-${String(1 + (i % 4) * 7).padStart(2, "0")}`, time: "18:40", opponent: "Lakeside U12 Boys 2", venue: "Court 1" }));
		deps.playhq.teams.set("8fab8b8c", season);
		const { db, counter } = countingDb(deps.db);
		const client = makeClient({ ...deps, db });
		expect((await client("/fixture/playhq", form({ url: LINK, competition: "VJBL" }))).status).toBe(303);
		expect(await games(deps)).toHaveLength(30);
		expect(counter.trips).toBeLessThan(15);
		expect(counter.mostParams).toBeLessThanOrEqual(100);
	});
});

describe("Checking PlayHQ again", () => {
	it("updates changed games, adds new ones, and never removes one PlayHQ drops", async () => {
		const { deps, client } = await added();
		const t = team();
		t.games = [{ ...t.games[1]!, time: "19:20", opponent: "Lakeside U12 Boys 2", venue: "Regional Basketball Centre, Court 9" },
			{ id: "g3", round: "Round 3", date: "2026-11-13", time: "18:40", opponent: "Fairview U12 Boys 2", venue: "Fairview Stadium, Court 3" }];
		deps.playhq.teams.set("8fab8b8c", t);
		const [fixture] = await listPlayhqFixtures(deps.db, deps.team.id);
		expect((await client(`/fixture/playhq/${fixture!.id}/check`, { method: "POST" })).headers.get("Location")).toBe("/fixture?done=playhqchecked");
		expect((await games(deps)).map((g) => [g.startsAt, g.opponent, g.playhqGone])).toEqual([
			["2026-10-30T18:40", "Hillcrest 3", true], ["2026-11-06T19:20", "Lakeside 2", false], ["2026-11-13T18:40", "Fairview 2", false],
		]);
		expect(await (await client("/fixture")).text()).toContain("Not on PlayHQ any more");
	});
	it("a game with video keeps it through anything the fixture does: changed, dropped (grading), the fixture removed", async () => {
		const { deps, client } = await added();
		const [first] = await games(deps);
		const videoId = await seedVideo(deps, { gameId: first!.id, streamUid: "played" });
		const [fixture] = await listPlayhqFixtures(deps.db, deps.team.id);
		const check = async (games: PlayhqTeamFixture["games"]) => {
			deps.playhq.teams.set("8fab8b8c", { ...team(), games });
			await client(`/fixture/playhq/${fixture!.id}/check`, { method: "POST" });
		};
		const kept = async () => {
			const row = (await listGamesWithVideoStatus(deps.db, deps.team.id)).find((r) => r.game.id === first!.id);
			return { game: row?.game.startsAt, opponent: row?.game.opponent, gone: row?.game.playhqGone, video: (await getActiveVideoForGame(deps.db, deps.team.id, first!.id))?.id, status: row?.videoStatus };
		};
		// Moved a day and a new opponent: the same game, with its video, just relabelled.
		await check([{ ...team().games[0]!, date: "2026-10-31", opponent: "Lakeside U12 Boys 2" }, team().games[1]!]);
		expect(await kept()).toEqual({ game: "2026-10-31T18:40", opponent: "Lakeside 2", gone: false, video: videoId, status: "ready" });
		// Gone from PlayHQ (a grading game): kept, marked, video and all.
		await check([team().games[1]!]);
		expect(await kept()).toMatchObject({ gone: true, video: videoId, status: "ready" });
		// The fixture removed: its games stay.
		await client(`/fixture/playhq/${fixture!.id}/remove`, form({ confirm: "yes" }));
		expect(await kept()).toMatchObject({ video: videoId, status: "ready" });
		// Only a person removes it: Delete is refused while it has video (Delete with its video is a separate, asked-for step).
		expect((await client(`/fixture/${first!.id}/delete`, form({ confirm: "yes" }))).status).toBe(409);
		expect(await kept()).toMatchObject({ video: videoId, status: "ready" });
	});
	it("keeps a game deleted here deleted", async () => {
		const { deps, client } = await added();
		const [first] = await games(deps);
		await client(`/fixture/${first!.id}/delete`, form({ confirm: "yes" }));
		await checkPlayhqFixturesDue(later(deps, 9));
		expect((await games(deps)).map((g) => g.roundLabel)).toEqual(["2"]);
	});
	it("adding the fixture again brings back its deleted games (without video), then checks keep deletions", async () => {
		const { deps, client } = await added();
		const [first] = await games(deps);
		await client(`/fixture/${first!.id}/delete`, form({ confirm: "yes" }));
		const [fixture] = await listPlayhqFixtures(deps.db, deps.team.id);
		await client(`/fixture/playhq/${fixture!.id}/remove`, form({ confirm: "yes" }));
		await client("/fixture/playhq", form({ url: LINK, competition: "VJBL" }));
		expect((await games(deps)).map((g) => [g.id, g.roundLabel])).toEqual([[first!.id, "1"], [expect.any(Number), "2"]]);
		// Deleted again: the regular checks leave it deleted.
		await client(`/fixture/${first!.id}/delete`, form({ confirm: "yes" }));
		await checkPlayhqFixturesDue(later(deps, 9));
		expect((await games(deps)).map((g) => g.roundLabel)).toEqual(["2"]);
	});
	it("checks every 8 hours, and a VJBL fixture keeps checking through a four-week break, stopping six weeks after the last game", async () => {
		const { deps } = await added();
		expect((await checkPlayhqFixturesDue(later(deps, 7))).playhqChecked).toBe(0);
		expect((await checkPlayhqFixturesDue(later(deps, 9))).playhqChecked).toBe(1);
		// 4 Dec, four weeks after the last game listed (6 Nov): still checked, and the rounds after the break come in.
		const t = team();
		t.games.push({ id: "g3", round: "Round 3", date: "2027-01-29", time: "18:40", opponent: "Lakeside U12 Boys 2", venue: "" });
		deps.playhq.teams.set("8fab8b8c", t);
		expect((await checkPlayhqFixturesDue(later(deps, 24 * 50))).playhqChecked).toBe(1);
		expect((await games(deps)).map((g) => g.roundLabel)).toEqual(["1", "2", "3"]);
		const over = later(deps, 24 * 150); // 14 Mar 2027: six weeks after the last game (29 Jan)
		expect((await checkPlayhqFixturesDue(over)).playhqChecked).toBe(1);
		const [fixture] = await listPlayhqFixtures(deps.db, deps.team.id);
		expect(fixture!.autoCheck).toBe(false);
		expect(await (await makeClient(over)("/fixture")).text()).toContain("Season over, so it&#39;s no longer checked by itself.");
		expect((await checkPlayhqFixturesDue(later(deps, 24 * 151))).playhqChecked).toBe(0);
	});
	it("checks a tournament for four days from its first game, Friday to Monday night, then stops", async () => {
		const t = team(); // Fri 6 Nov and Sat 7 Nov; its finals appear as they're made
		t.games = [{ ...t.games[0]!, date: "2026-11-06", time: "19:35" }, { ...t.games[1]!, date: "2026-11-07", time: "13:35" }];
		const { deps } = await added(t, "Tournament");
		const at = (iso: string) => ({ ...deps, now: () => new Date(iso) });
		expect((await checkPlayhqFixturesDue(at("2026-11-09T12:00:00Z"))).playhqChecked).toBe(1); // Mon 9 Nov, 11pm: its fourth day
		expect((await listPlayhqFixtures(deps.db, deps.team.id))[0]!.autoCheck).toBe(true);
		// Tue 10 Nov: over, so not checked again, and Fixture says so.
		for (const iso of ["2026-11-09T13:30:00Z", "2026-11-09T21:00:00Z", "2026-11-12T00:00:00Z"]) expect((await checkPlayhqFixturesDue(at(iso))).playhqChecked).toBe(0);
		expect(await (await makeClient(at("2026-11-09T13:30:00Z"))("/fixture")).text()).toContain("Tournament over, so it&#39;s no longer checked by itself.");
		// Check now still works, and settles it as over.
		const [fixture] = await listPlayhqFixtures(deps.db, deps.team.id);
		await makeClient(at("2026-11-10T00:00:00Z"))(`/fixture/playhq/${fixture!.id}/check`, { method: "POST" });
		expect((await listPlayhqFixtures(deps.db, deps.team.id))[0]!.autoCheck).toBe(false);
	});
	it("checks a tournament every hour while it's on (its first game's day to its fourth), every 8 hours before", async () => {
		const t = team(); // Sat 31 Oct and Sun 1 Nov; the final is added on the Sunday
		t.games = [{ ...t.games[0]!, date: "2026-10-31", time: "09:00" }, { ...t.games[1]!, date: "2026-10-31", time: "14:00" }];
		const { deps } = await added(t, "Tournament");
		const at = (iso: string) => ({ ...deps, now: () => new Date(iso) });
		expect((await checkPlayhqFixturesDue(at("2026-10-15T01:30:00Z"))).playhqChecked).toBe(0); // before: 8-hourly
		expect((await checkPlayhqFixturesDue(at("2026-10-30T13:30:00Z"))).playhqChecked).toBe(1); // Sat 31 Oct, 12:30am
		expect((await checkPlayhqFixturesDue(at("2026-10-30T14:00:00Z"))).playhqChecked).toBe(0);
		expect((await checkPlayhqFixturesDue(at("2026-10-30T14:35:00Z"))).playhqChecked).toBe(1); // an hour on
		t.games.push({ id: "final", round: "Grand Final", date: "2026-11-01", time: "11:00", opponent: "Lakeside U12 Boys 2", venue: "Court 1" });
		deps.playhq.teams.set("8fab8b8c", t);
		expect((await checkPlayhqFixturesDue(at("2026-10-31T20:00:00Z"))).playhqChecked).toBe(1); // Sun 1 Nov, 7am
		expect((await games(deps)).map((g) => g.roundLabel)).toContain("Grand Final");
		expect((await checkPlayhqFixturesDue(at("2026-11-02T12:50:00Z"))).playhqChecked).toBe(1); // Tue 3 Nov, 12:50am: its fourth day
		expect((await checkPlayhqFixturesDue(at("2026-11-02T13:30:00Z"))).playhqChecked).toBe(0); // under an hour on
		// Fixture says when: hourly from its first day to its fourth, then it stops.
		expect(await (await makeClient(at("2026-11-02T14:00:00Z"))("/fixture")).text()).toContain("Checked every 8 hours, and every hour while the tournament&#39;s on, from Sat 31 Oct to Tue 3 Nov (its finals appear as they&#39;re made); it stops after that.");
	});
	it("stops checking a fixture that never gets a game, 60 days after it was added", async () => {
		const empty = team();
		empty.games = [];
		const { deps } = await added(empty, "Tournament");
		expect(await (await makeClient(deps)("/fixture")).text()).toContain("Checked every 8 hours until its games are out, or until Mon 14 Dec if they never are.");
		expect((await checkPlayhqFixturesDue(later(deps, 24 * 59))).playhqChecked).toBe(1);
		expect((await listPlayhqFixtures(deps.db, deps.team.id))[0]!.autoCheck).toBe(true);
		expect((await checkPlayhqFixturesDue(later(deps, 24 * 61))).playhqChecked).toBe(1);
		expect((await listPlayhqFixtures(deps.db, deps.team.id))[0]!.autoCheck).toBe(false);
		expect((await checkPlayhqFixturesDue(later(deps, 24 * 62))).playhqChecked).toBe(0);
	});
	it("stops trying a tournament that keeps failing once it's over", async () => {
		const t = team();
		t.games = [{ ...t.games[0]!, date: "2026-11-06" }, { ...t.games[1]!, date: "2026-11-07" }];
		const { deps } = await added(t, "Tournament");
		const at = (iso: string) => ({ ...deps, now: () => new Date(iso) });
		deps.playhq.down = true;
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect((await checkPlayhqFixturesDue(at("2026-11-09T12:00:00Z"))).errors).toHaveLength(1); // Mon 9 Nov: still on
		expect((await listPlayhqFixtures(deps.db, deps.team.id))[0]!.autoCheck).toBe(true);
		// Tue 10 Nov: over, so no more tries; a fixture that fails before it has a game stops 60 days on (the next test).
		expect(await checkPlayhqFixturesDue(at("2026-11-09T21:00:00Z"))).toMatchObject({ playhqChecked: 0, errors: [] });
	});
	it("brings in finals as PlayHQ adds them, one week at a time (2025/26: Finals Round 1, Finals Round 2, Preliminary Final)", async () => {
		const { deps } = await added();
		const t = team();
		for (const [i, round] of ["Finals Round 1", "Finals Round 2", "Preliminary Final"].entries()) {
			t.games.push({ id: `f${i}`, round, date: `2026-11-${13 + i * 7}`, time: "19:40", opponent: "Seaview U12 Boys 1", venue: "Regional Basketball Centre, Court 10" });
			deps.playhq.teams.set("8fab8b8c", structuredClone(t));
			await checkPlayhqFixturesDue(later(deps, 24 * (30 + i * 7)));
		}
		expect((await games(deps)).map((g) => [g.roundLabel, g.opponent, g.playhqGone])).toEqual([
			["1", "Hillcrest 3", false], ["2", "TBC", false], ["Finals Round 1", "Seaview 1", false],
			["Finals Round 2", "Seaview 1", false], ["Preliminary Final", "Seaview 1", false],
		]);
		expect(await (await makeClient(deps)("/fixture")).text()).toContain("Preliminary Final · vs Seaview 1");
	});
	it("shows why when PlayHQ can't be read, and leaves the games as they were", async () => {
		const { deps, client } = await added();
		deps.playhq.down = true;
		const [fixture] = await listPlayhqFixtures(deps.db, deps.team.id);
		expect((await client(`/fixture/playhq/${fixture!.id}/check`, { method: "POST" })).headers.get("Location")).toBe("/fixture?done=playhqfailed");
		expect(await (await client("/fixture")).text()).toContain("Last check didn't work: PlayHQ fixture failed (503)");
		expect((await checkPlayhqFixturesDue(later(deps, 9))).errors).toHaveLength(1);
		expect(await games(deps)).toHaveLength(2);
		// Team managers see it on every page until a check works again; nobody else does.
		expect(await (await client("/games")).text()).toContain("<b>PlayHQ couldn't be read</b> for Saints U12 Boys 1");
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'c@x.com', 'Cam', 'coach')").bind(deps.team.id).run();
		expect(await (await makeClient(deps, "c@x.com")("/games")).text()).not.toContain("PlayHQ couldn't be read");
		deps.playhq.down = false;
		await client(`/fixture/playhq/${fixture!.id}/check`, { method: "POST" });
		expect(await (await client("/games")).text()).not.toContain("PlayHQ couldn't be read");
	});
	it("Remove stops the checks and keeps the games", async () => {
		const { deps, client } = await added();
		const [fixture] = await listPlayhqFixtures(deps.db, deps.team.id);
		expect((await client(`/fixture/playhq/${fixture!.id}/remove`, form({ confirm: "yes" }))).headers.get("Location")).toBe("/fixture?done=playhqremoved");
		expect(await listPlayhqFixtures(deps.db, deps.team.id)).toEqual([]);
		expect(await games(deps)).toHaveLength(2);
	});
	it("a fixture added after one was removed doesn't take over the removed one's games (even with the same id)", async () => {
		const { deps, client } = await added();
		const [old] = await listPlayhqFixtures(deps.db, deps.team.id);
		await client(`/fixture/playhq/${old!.id}/remove`, form({ confirm: "yes" }));
		deps.playhq.teams.set("aaaa1111", { name: "Tournament", games: [{ id: "t1", round: "Round 1", date: "2026-11-07", time: "09:00", opponent: "Lakeside", venue: "" }] });
		await client("/fixture/playhq", form({ url: LINK.replace("8fab8b8c", "aaaa1111"), competition: "Tournament", noVideo: "1" }));
		const [next] = await listPlayhqFixtures(deps.db, deps.team.id);
		expect(next!.id).toBe(old!.id);
		expect((await games(deps)).map((g) => [g.opponent, g.playhqGone, g.noVideo])).toEqual([
			["Hillcrest 3", false, false], ["TBC", false, false], ["Lakeside", false, true],
		]);
	});
	it("a first check that fails leaves no fixture behind, so Add fixture can simply be tried again", async () => {
		const deps = createTestDeps();
		deps.playhq.teams.set("8fab8b8c", team());
		const client = makeClient(deps);
		await deps.db.prepare("CREATE TRIGGER no_games BEFORE INSERT ON games BEGIN SELECT RAISE(ABORT, 'disk full'); END").run();
		expect((await client("/fixture/playhq", form({ url: LINK, competition: "VJBL" }))).status).toBe(500);
		expect(await listPlayhqFixtures(deps.db, deps.team.id)).toEqual([]);
		await deps.db.prepare("DROP TRIGGER no_games").run();
		expect((await client("/fixture/playhq", form({ url: LINK, competition: "VJBL" }))).status).toBe(303);
	});
	it("editing a PlayHQ game says the next check replaces hand changes", async () => {
		const { deps, client } = await added();
		const [first] = await games(deps);
		expect(await (await client(`/fixture?edit=${first!.id}`)).text()).toContain("each check copies PlayHQ's details over any change made here");
	});
});
