import { describe, expect, it } from "vitest";
import { readFixtureCsv, SAMPLE_CSV } from "../../../src/features/games/fixture-csv.ts";
import { type Game, listGamesWithVideoStatus } from "../../../src/features/games/games-repository.ts";
import { matchMessage } from "../../../src/features/roster/match-message.ts";
import { form, jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

// Whether a game is streamed live, set on the fixture (Live stream by default). Test clock: Thu 15 Oct 2026, 11am local.
const fields = { date: "2026-10-16", hour: "6", minute: "40", period: "pm", competition: "Practice match", roundLabel: "", opponent: "Riverton", venue: "Saints Stadium, Court 1" };
const gamesOf = async (deps: TestDeps) => (await listGamesWithVideoStatus(deps.db, deps.team.id)).map((r) => r.game);
const recorded = (deps: TestDeps, id: number) => deps.db.prepare("UPDATE games SET live_stream = 0 WHERE team_id = ? AND id = ?").bind(deps.team.id, id).run();
/** The page's row for the game against `who`. */
const rowOf = (page: string, who: string) => page.split(`vs ${who}</a>`)[1]?.split("</tr>")[0] ?? "";

describe("live stream or not, per game", () => {
	it("is Live stream unless the team manager picks Record and upload after, on add or edit; the form needs the choice", async () => {
		const deps = createTestDeps();
		const manager = makeClient(deps);
		expect((await manager("/fixture", form(fields))).status).toBe(400);
		await manager("/fixture", form({ ...fields, video: "live" }));
		await manager("/fixture", form({ ...fields, opponent: "Lakeside", video: "record" }));
		const [riverton, lakeside] = ["Riverton", "Lakeside"].map(async (who) => (await gamesOf(deps)).find((g) => g.opponent === who)!);
		expect([(await riverton).liveStream, (await lakeside).liveStream]).toEqual([true, false]);
		const page = await (await manager("/fixture")).text();
		expect(rowOf(page, "Riverton")).toContain('<span class="t src">Live stream</span>');
		expect(rowOf(page, "Lakeside")).toContain('<span class="t src">Recorded</span>');
		expect(await (await manager(`/fixture?edit=${(await lakeside).id}`)).text()).toContain('<option value="record" selected>');
		await manager(`/fixture/${(await lakeside).id}`, form({ ...fields, opponent: "Lakeside", video: "live" }));
		expect((await gamesOf(deps)).find((g) => g.opponent === "Lakeside")!.liveStream).toBe(true);
		// Everyone else sees it on the Fixture too.
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Pat', 'watcher')").bind(deps.team.id).run();
		await recorded(deps, (await riverton).id);
		expect(rowOf(await (await makeClient(deps, "p@x.com")("/fixture")).text(), "Riverton")).toContain('<span class="t src">Recorded</span>');
	});

	it("Go live offers only games set to Live stream, says when today's is set to be recorded, and the site won't stream one", async () => {
		const deps = createTestDeps();
		const tonight = await seedGame(deps, { startsAt: "2026-10-15T18:40", opponent: "Northside 2" });
		const nextWeek = await seedGame(deps, { startsAt: "2026-10-22T18:40", opponent: "Lakeside" });
		await recorded(deps, tonight);
		const page = await (await makeClient(deps)("/live")).text();
		expect(page).not.toContain(`<option value="${tonight}"`);
		expect(page).toContain(`<option value="${nextWeek}" selected>`);
		expect(page).toContain("Tonight&#39;s game vs Northside 2 is set to be recorded, not live streamed");
		const res = await makeClient(deps)(`/api/live/${tonight}/browser`, jsonBody({ mimeType: "video/mp4" }));
		expect(res.status).toBe(409);
		expect(((await res.json()) as { error: { message: string } }).error.message).toContain("set to be recorded");
	});

	it("the game page and Watch games say whether an upcoming game will be live streamed or recorded", async () => {
		const deps = createTestDeps();
		const live = await seedGame(deps, { startsAt: "2026-10-22T18:40", opponent: "Lakeside" });
		const rec = await seedGame(deps, { startsAt: "2026-10-29T18:40", opponent: "Riverton" });
		await recorded(deps, rec);
		const client = makeClient(deps);
		expect(await (await client(`/games/${live}`)).text()).toContain("Upcoming. It&#39;ll be live streamed here, then saved here after the game.");
		expect(await (await client(`/games/${rec}`)).text()).toContain("Upcoming. It&#39;s being recorded: the video will be here after the game.");
		const list = await (await client("/games")).text();
		const card = (id: number) => list.split(`href="/games/${id}"`)[1]?.split("</a>")[0] ?? "";
		expect(card(live)).toContain('<span class="t src">Live stream</span>');
		expect(card(rec)).toContain('<span class="t src">Recorded</span>');
	});

	it("the match day message tells the family on video to live stream it, or to record and upload it", () => {
		const game = (liveStream: boolean): Game => ({
			id: 1, teamId: "t", startsAt: "2026-10-30T18:40", competition: "Practice match", roundLabel: "", opponent: "Lakeside", venue: "Saints Stadium Court 1",
			noVideo: false, playhqGone: false, fromPlayhq: false, liveStream,
		});
		const message = (g: Game) => matchMessage({ game: g, slots: [{ week: "2026-10-26", duty: "video", position: 1, gameId: 1, familyId: 8 }], names: new Map([[8, "Rivers"]]), video: true, uniform: "Navy" });
		expect(message(game(true))).toContain("🎥 Video: Rivers (live stream it from https://saints.example)");
		expect(message(game(false))).toContain("🎥 Video: Rivers (record it, then upload it to https://saints.example)");
	});

	it("a spreadsheet's Video column takes Live (or Yes), Record or No, and the sample shows them", () => {
		const { games } = readFixtureCsv(SAMPLE_CSV, "VJBL");
		expect(games.map((g) => [g.noVideo, g.liveStream])).toEqual([[false, true], [true, true], [true, true], [false, false]]);
		const read = readFixtureCsv("Date,Time,Video\n1/11/2026,6:40pm,Yes\n2/11/2026,6:40pm,recorded\n3/11/2026,6:40pm,\n", "VJBL").games;
		expect(read.map((g) => g.liveStream)).toEqual([true, false, true]);
	});
});
