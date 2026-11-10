import { describe, expect, it } from "vitest";
import { listGamesWithVideoStatus } from "../../../src/features/games/games-repository.ts";
import { checkFinalScores } from "../../../src/features/scores/scores-service.ts";
import { FetchBudgetSpent } from "../../../src/platform/fetch-budget.ts";
import type { PlayhqResult } from "../../../src/platform/playhq.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// "In progress" during the game (no live scores), the final score entered at the end
// (by the team manager, or from PlayHQ for a PlayHQ game), and a game with its final score never checked again.
const LINK = "https://www.playhq.com/example-association/org/saints-basketball-club/99bec93e/junior-basketball-league-202526/teams/saints-b12\.1-2026-1/8fab8b8c";
const at = (deps: TestDeps, iso: string) => { (deps as { now: () => Date }).now = () => new Date(iso); };
const scoreOf = (deps: TestDeps, gameId: number) => deps.db.prepare("SELECT ours, opponent, source FROM game_scores WHERE team_id = ? AND game_id = ?").bind(deps.team.id, gameId).first();
const final = (home: number, away: number, status = "FINAL"): PlayhqResult => ({ status, home: { teamId: "8fab8b8c", score: home }, away: { teamId: "22e3b51f", score: away } });

/** A VJBL fixture from PlayHQ with one game: Fri 30 Oct 2026, 6:40pm local (07:40 UTC), the Saints at home. */
async function playhqGame(o: { noVideo?: boolean } = {}) {
	const deps = createTestDeps();
	deps.playhq.teams.set("8fab8b8c", { name: "Saints U12 Boys 1", games: [{ id: "g1", round: "Round 1", date: "2026-10-30", time: "18:40", opponent: "Hillcrest U12 Boys 3", venue: "Saints Stadium, Court 1" }] });
	await makeClient(deps)("/fixture/playhq", form({ url: LINK, competition: "VJBL", ...(o.noVideo ? { noVideo: "1" } : {}) }));
	const [{ game }] = await listGamesWithVideoStatus(deps.db, deps.team.id);
	return { deps, gameId: game!.id };
}

describe("scores", () => {
	it("a team manager enters, fixes and clears a final score on the game page; nobody else can", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-11T11:40", opponent: "Lakeside Rockets" });
		const manager = makeClient(deps);
		const done = await manager(`/games/${gameId}/score`, form({ ours: "34", opponent: "28" }));
		expect(done.headers.get("Location")).toBe(`/games/${gameId}?done=score`);
		expect(await scoreOf(deps, gameId)).toEqual({ ours: 34, opponent: 28, source: "manual" });
		await manager(`/games/${gameId}/score`, form({ ours: "34", opponent: "30" }));
		expect(await scoreOf(deps, gameId)).toMatchObject({ opponent: 30 });
		for (const bad of [{ ours: "-1", opponent: "30" }, { ours: "", opponent: "30" }, { ours: "34", opponent: "301" }, { ours: "3.5", opponent: "30" }]) {
			expect((await manager(`/games/${gameId}/score`, form(bad))).status).toBe(400);
		}
		expect(await scoreOf(deps, gameId)).toMatchObject({ ours: 34, opponent: 30 });
		for (const [email, role] of [["c@x.com", "coach"], ["f@x.com", "filmer"], ["p@x.com", "watcher"]]) {
			await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, 'Someone', ?)").bind(deps.team.id, email, role).run();
			expect((await makeClient(deps, email)(`/games/${gameId}/score`, form({ ours: "1", opponent: "0" }))).status).toBe(403);
		}
		await manager(`/games/${gameId}/score/clear`, form({}));
		expect(await scoreOf(deps, gameId)).toBeNull();
	});

	it("a game that hasn't started can't have a score", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-30T18:40" });
		expect((await makeClient(deps)(`/games/${gameId}/score`, form({ ours: "10", opponent: "8" }))).status).toBe(400);
	});

	it("shows the result on the game page, Watch games, the Fixture and Home: won, lost or drew", async () => {
		const deps = createTestDeps();
		const won = await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "Lakeside" });
		const lost = await seedGame(deps, { startsAt: "2026-10-10T18:40", opponent: "Riverton" });
		const drew = await seedGame(deps, { startsAt: "2026-10-11T11:40", opponent: "Northside" });
		const manager = makeClient(deps);
		await manager(`/games/${won}/score`, form({ ours: "34", opponent: "28" }));
		await manager(`/games/${lost}/score`, form({ ours: "28", opponent: "34" }));
		await manager(`/games/${drew}/score`, form({ ours: "30", opponent: "30" }));
		expect(await (await manager(`/games/${won}`)).text()).toContain("Won 34 to 28");
		const list = await (await manager("/games")).text();
		for (const words of ["Won 34 to 28", "Lost 28 to 34", "Drew 30 all"]) expect(list).toContain(words);
		const fixture = await (await manager("/fixture")).text();
		expect(fixture.split("vs Riverton</a>")[1]?.split("</tr>")[0]).toContain("Lost 28 to 34");
		await seedVideo(deps, { gameId: drew, streamUid: "u-drew" });
		expect((await (await manager("/")).text()).split('class="panel latest"')[1]?.split("</a>")[0]).toContain("Drew 30 all");
	});

	it("during the game's hour it's In progress, on Watch games and the game page", async () => {
		const deps = createTestDeps();
		at(deps, "2026-10-15T08:00:00Z"); // 7pm local, 20 minutes after tip-off
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40", opponent: "Lakeside" });
		const client = makeClient(deps);
		const card = async () => (await (await client("/games")).text()).split(`href="/games/${gameId}"`)[1]?.split("</a>")[0];
		expect(await card()).toContain("In progress");
		expect(await (await client(`/games/${gameId}`)).text()).toContain("<dt>Result</dt><dd>In progress</dd>");
		// The final score entered at the buzzer, inside the hour: it's over.
		await client(`/games/${gameId}/score`, form({ ours: "40", opponent: "31" }));
		expect(await card()).not.toContain("In progress");
		expect(await card()).toContain("Won 40 to 31");
		expect(await (await client(`/games/${gameId}`)).text()).toContain("<dt>Result</dt><dd>Won 40 to 31</dd>");
	});

	it("PlayHQ: from half an hour after tip-off, its final score goes in as soon as PlayHQ says FINAL, and the game is never asked about again", async () => {
		const { deps, gameId } = await playhqGame();
		deps.playhq.results.set("g1", final(66, 29, "IN_PROGRESS"));
		at(deps, "2026-10-30T08:00:00Z"); // 7pm: 20 minutes in, too soon to ask
		await checkFinalScores(deps);
		expect(deps.playhq.resultReads).toEqual([]);
		at(deps, "2026-10-30T08:10:00Z"); // 7:10pm: half an hour in, PlayHQ hasn't got the result yet
		await checkFinalScores(deps);
		expect(deps.playhq.resultReads).toEqual(["g1"]);
		expect(await scoreOf(deps, gameId)).toBeNull();
		deps.playhq.results.set("g1", final(66, 29));
		at(deps, "2026-10-30T08:15:00Z"); // 7:15pm: still the game's hour, but it's over
		expect(await checkFinalScores(deps)).toMatchObject({ scoresEntered: 1 });
		expect(await scoreOf(deps, gameId)).toEqual({ ours: 66, opponent: 29, source: "playhq" });
		// Over now, not In progress, though its hour isn't up. Fixed by saving over it, not cleared (PlayHQ would put it back).
		const page = await (await makeClient(deps)(`/games/${gameId}`)).text();
		expect(page).toContain("Won 66 to 29, from PlayHQ.");
		expect(page).not.toContain("In progress");
		expect(page).not.toContain("Clear score");
		expect((await (await makeClient(deps)("/games")).text()).split(`href="/games/${gameId}"`)[1]?.split("</a>")[0]).not.toContain("In progress");
		for (const later of ["2026-10-30T08:20:00Z", "2026-10-30T12:00:00Z", "2026-10-31T09:00:00Z"]) {
			at(deps, later);
			await checkFinalScores(deps);
		}
		expect(deps.playhq.resultReads).toEqual(["g1", "g1"]);
	});

	it("PlayHQ: a team manager's Check now on the fixture gets a final score straight away", async () => {
		const { deps, gameId } = await playhqGame();
		deps.playhq.results.set("g1", final(39, 55));
		at(deps, "2026-10-30T08:20:00Z");
		const fixtureId = (await deps.db.prepare("SELECT id FROM playhq_fixtures").first<{ id: number }>())!.id;
		await makeClient(deps)(`/fixture/playhq/${fixtureId}/check`, form({}));
		expect(await scoreOf(deps, gameId)).toEqual({ ours: 39, opponent: 55, source: "playhq" });
	});

	it("PlayHQ: a game from a fixture set to No video still gets its final score (nothing's filmed, the result still counts)", async () => {
		const { deps, gameId } = await playhqGame({ noVideo: true });
		expect((await deps.db.prepare("SELECT no_video_at FROM games WHERE id = ?").bind(gameId).first<{ no_video_at: string | null }>())?.no_video_at).not.toBeNull();
		deps.playhq.results.set("g1", final(66, 29));
		at(deps, "2026-10-30T08:50:00Z");
		expect(await checkFinalScores(deps)).toMatchObject({ scoresEntered: 1 });
		expect(await scoreOf(deps, gameId)).toEqual({ ours: 66, opponent: 29, source: "playhq" });
	});
	it("PlayHQ: the Saints' score is whichever side is our team, home or away", async () => {
		const { deps, gameId } = await playhqGame();
		deps.playhq.results.set("g1", { status: "FINAL", home: { teamId: "22e3b51f", score: 41 }, away: { teamId: "8fab8b8c", score: 38 } });
		at(deps, "2026-10-30T08:45:00Z");
		await checkFinalScores(deps);
		expect(await scoreOf(deps, gameId)).toEqual({ ours: 38, opponent: 41, source: "playhq" });
	});

	it("PlayHQ: a score the team manager entered is never asked about or replaced", async () => {
		const { deps, gameId } = await playhqGame();
		at(deps, "2026-10-30T08:45:00Z");
		await makeClient(deps)(`/games/${gameId}/score`, form({ ours: "50", opponent: "20" }));
		deps.playhq.results.set("g1", final(66, 29));
		await checkFinalScores(deps);
		expect(deps.playhq.resultReads).toEqual([]);
		expect(await scoreOf(deps, gameId)).toEqual({ ours: 50, opponent: 20, source: "manual" });
	});

	it("PlayHQ: a score the team manager enters while PlayHQ is being asked stays", async () => {
		const { deps, gameId } = await playhqGame();
		at(deps, "2026-10-30T08:45:00Z");
		const gameResult = async () => {
			await makeClient(deps)(`/games/${gameId}/score`, form({ ours: "50", opponent: "20" }));
			return final(66, 29);
		};
		expect(await checkFinalScores({ ...deps, playhq: Object.assign(Object.create(deps.playhq), { gameResult }) })).toMatchObject({ scoresEntered: 0 });
		expect(await scoreOf(deps, gameId)).toEqual({ ours: 50, opponent: 20, source: "manual" });
	});

	it("PlayHQ: asked every 5-minute run until 3 hours after tip-off, then hourly, and not after 3 days", async () => {
		const { deps } = await playhqGame();
		const reads = async (iso: string) => { at(deps, iso); await checkFinalScores(deps); return deps.playhq.resultReads.length; };
		expect(await reads("2026-10-30T08:45:00Z")).toBe(1);
		expect(await reads("2026-10-30T08:50:00Z")).toBe(2); // keen: every run
		expect(await reads("2026-10-30T11:00:00Z")).toBe(3); // 10pm: past the keen 2 hours
		expect(await reads("2026-10-30T11:20:00Z")).toBe(3); // hourly now
		expect(await reads("2026-10-30T12:05:00Z")).toBe(4);
		expect(await reads("2026-11-02T08:00:00Z")).toBe(4); // more than 3 days after tip-off: never
	});

	it("PlayHQ: with the run's outside calls used up, the game waits for the next run (it isn't counted as asked)", async () => {
		const { deps, gameId } = await playhqGame();
		deps.playhq.results.set("g1", final(66, 29));
		at(deps, "2026-10-30T08:45:00Z");
		const spent = { ...deps, playhq: Object.assign(Object.create(deps.playhq), { gameResult: () => Promise.reject(new FetchBudgetSpent()) }) };
		const { errors } = await checkFinalScores(spent);
		expect(errors.every((err) => err instanceof FetchBudgetSpent) && errors.length === 1).toBe(true);
		at(deps, "2026-10-30T08:46:00Z"); // a minute on, as if the next run came straight after
		expect(await checkFinalScores(deps)).toMatchObject({ scoresEntered: 1 });
		expect(await scoreOf(deps, gameId)).toMatchObject({ ours: 66 });
	});

	it("PlayHQ down: nothing changes and the run doesn't fail; the team manager can still enter it", async () => {
		const { deps, gameId } = await playhqGame();
		deps.playhq.down = true;
		at(deps, "2026-10-30T08:45:00Z");
		await expect(checkFinalScores(deps)).resolves.toMatchObject({ scoresEntered: 0, errors: [] });
		expect(await scoreOf(deps, gameId)).toBeNull();
		expect(await (await makeClient(deps)(`/games/${gameId}`)).text()).toContain('action="/games/' + gameId + '/score"');
	});
});
