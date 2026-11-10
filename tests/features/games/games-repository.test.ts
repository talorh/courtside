import { describe, expect, it } from "vitest";
import {
	countActiveVideosForGame, createGame, getGame, listGamesWithVideoStatus, softDeleteGame, updateGame,
} from "../../../src/features/games/games-repository.ts";
import { createTestDb } from "../../helpers/d1-sqlite.ts";

const TEAM = "b12.1-2026";
const input = { startsAt: "2026-10-25T10:20", competition: "VJBL" as const, roundLabel: "10", opponent: "TBC", venue: "Saints Stadium, Ct 2" };

describe("games repository", () => {
	it("creates, reads, updates and soft-deletes", async () => {
		const db = createTestDb();
		const id = await createGame(db, TEAM, input, 1);
		expect(await getGame(db, TEAM, id)).toMatchObject({ ...input, id, liveStream: true });
		await updateGame(db, TEAM, id, { ...input, opponent: "Lakeside Rockets" }, false, null, "2026-10-17T00:00:00.000Z");
		expect(await getGame(db, TEAM, id)).toMatchObject({ opponent: "Lakeside Rockets", liveStream: false });
		await softDeleteGame(db, TEAM, id, "2026-10-15T00:00:00.000Z");
		expect(await getGame(db, TEAM, id)).toBeNull();
		await expect(updateGame(db, TEAM, id, input, true, null, "2026-10-17T00:00:00.000Z")).rejects.toThrow(/game/);
	});
	it("No video keeps Live stream or Record as it was, and when it was first set; either of those clears it", async () => {
		const db = createTestDb();
		const id = await createGame(db, TEAM, input, 1, null, false);
		const at = () => db.prepare("SELECT no_video_at AS at FROM games WHERE id = ?").bind(id).first<string | null>("at");
		await updateGame(db, TEAM, id, input, null, "2026-10-15T00:00:00.000Z", "2026-10-17T00:00:00.000Z");
		await updateGame(db, TEAM, id, { ...input, venue: "Court 1" }, null, "2026-10-16T00:00:00.000Z", "2026-10-17T00:00:00.000Z");
		expect(await at()).toBe("2026-10-15T00:00:00.000Z");
		expect(await getGame(db, TEAM, id)).toMatchObject({ noVideo: true, liveStream: false, venue: "Court 1" });
		await updateGame(db, TEAM, id, input, true, null, "2026-10-17T00:00:00.000Z");
		expect([await at(), (await getGame(db, TEAM, id))?.liveStream]).toEqual([null, true]);
		// Back to Video from No video: it waits a week from now for its video (no-video-after.ts).
		expect(await db.prepare("SELECT waiting_since FROM games WHERE id = ?").bind(id).first<string>("waiting_since")).toBe("2026-10-17T00:00:00.000Z");
		expect(await getGame(db, TEAM, await createGame(db, TEAM, input, 1, "2026-10-15T00:00:00.000Z"))).toMatchObject({ noVideo: true, liveStream: true });
	});
	it("lists games newest first with their video status", async () => {
		const db = createTestDb();
		const a = await createGame(db, TEAM, { ...input, startsAt: "2026-10-11T11:40" }, 1);
		await createGame(db, TEAM, { ...input, startsAt: "2026-12-01T09:00" }, 1);
		await db.prepare("INSERT INTO videos (team_id, game_id, status, delete_after) VALUES (?, ?, 'ready', 'x')").bind(TEAM, a).run();
		expect(await countActiveVideosForGame(db, TEAM, a)).toBe(1);
		const rows = await listGamesWithVideoStatus(db, TEAM);
		expect(rows.map((r) => [r.game.startsAt, r.videoStatus])).toEqual([["2026-12-01T09:00", null], ["2026-10-11T11:40", "ready"]]);
	});
});
