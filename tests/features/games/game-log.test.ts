import { describe, expect, it } from "vitest";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// The fixture's games and their videos in the admin Log (who did what, to which game) and, for the deletes, in Activity
// too: a game added, changed or deleted (with its video or without), a video deleted or moved to another game.

const log = async (deps: TestDeps) =>
	(await deps.db.prepare("SELECT admin_email, action, detail FROM admin_log ORDER BY id").all<{ admin_email: string; action: string; detail: string }>()).results;
const activity = async (deps: TestDeps) =>
	(await deps.db.prepare("SELECT kind, game_id, detail FROM activity ORDER BY id").all<{ kind: string; game_id: number | null; detail: string | null }>()).results;
const game = { date: "2026-11-20", hour: "6", minute: "40", period: "pm", competition: "VJBL", roundLabel: "6", opponent: "Riverton Wolves", venue: "", video: "live" };

describe("the Log and Activity for games and videos", () => {
	it("logs a game added, changed and deleted, saying which game, and the delete in Activity", async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		await client("/fixture", form(game));
		const id = (await deps.db.prepare("SELECT id FROM games WHERE opponent = 'Riverton Wolves'").first<{ id: number }>())!.id;
		await client(`/fixture/${id}`, form({ ...game, opponent: "Riverton Wolves 2" }));
		await client(`/fixture/${id}/delete`, form({ confirm: "yes" }));
		expect(await log(deps)).toEqual([
			{ admin_email: MANAGER, action: "game_added", detail: "Round 6 · vs Riverton Wolves, Fri 20 Nov" },
			{ admin_email: MANAGER, action: "game_changed", detail: "Round 6 · vs Riverton Wolves 2, Fri 20 Nov" },
			{ admin_email: MANAGER, action: "game_deleted", detail: "Round 6 · vs Riverton Wolves 2, Fri 20 Nov" },
		]);
		expect(await activity(deps)).toEqual([{ kind: "game_deleted", game_id: id, detail: "Round 6 · vs Riverton Wolves 2, Fri 20 Nov" }]);
		const page = await (await client("/admin/log?show=teams")).text();
		expect(page).toContain("deleted Saints B12.1&#39;s game Round 6 · vs Riverton Wolves 2, Fri 20 Nov");
		expect(page).toContain("Game deleted");
	});
	it("logs a video deleted (and a game deleted with its video), in Activity too, saying who", async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		const gameId = await seedGame(deps, { startsAt: "2026-10-30T19:30", opponent: "Lakeside Rockets", roundLabel: "4" });
		const videoId = await seedVideo(deps, { gameId, streamUid: "u1" });
		await client(`/videos/${videoId}/delete`, form({ confirm: "yes" }));
		const other = await seedGame(deps, { startsAt: "2026-10-23T18:30", opponent: "Westside", roundLabel: "3" });
		await seedVideo(deps, { gameId: other, streamUid: "u2" });
		await client(`/fixture/${other}/delete-all`, form({ confirm: "yes" }));
		expect((await log(deps)).map((l) => `${l.action}: ${l.detail}`)).toEqual([
			"video_deleted: Round 4 · vs Lakeside Rockets, Fri 30 Oct",
			"game_deleted: Round 3 · vs Westside, Fri 23 Oct, and its video",
		]);
		expect((await activity(deps)).map((a) => `${a.kind} ${a.game_id}`)).toEqual([`video_deleted ${gameId}`, `game_deleted ${other}`]);
		const notifications = await (await client("/notifications")).text();
		expect(notifications).toContain("deleted the video");
		expect(notifications).toContain("deleted the game");
	});
	it("logs a video moved to another game, and games added from a fixture all at once", async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		const from = await seedGame(deps, { startsAt: "2026-10-30T19:30", opponent: "Lakeside Rockets", roundLabel: "4" });
		const to = await seedGame(deps, { startsAt: "2026-10-31T09:00", opponent: "Riverton", roundLabel: "5" });
		const videoId = await seedVideo(deps, { gameId: from, streamUid: "u1" });
		await client(`/videos/${videoId}/move`, form({ gameId: String(to) }));
		const games = JSON.stringify([{ startsAt: "2026-11-27T18:40", competition: "VJBL", roundLabel: "7", opponent: "Box Hill", venue: "", liveStream: true, noVideo: false }]);
		await client("/fixture/import", form({ games, pick: "0" }));
		expect((await log(deps)).map((l) => `${l.action}: ${l.detail}`)).toEqual([
			"video_moved: from Round 4 · vs Lakeside Rockets, Fri 30 Oct to Round 5 · vs Riverton, Sat 31 Oct",
			"game_added: 1 game from a fixture",
		]);
	});
});
