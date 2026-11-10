import { describe, expect, it } from "vitest";
import { clearTombstones, TOMBSTONE_DAYS } from "../../../src/features/videos/tombstones-service.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { countingDb } from "../../helpers/counting-db.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { addTeam, G14_5 } from "../../helpers/two-teams.ts";

// The test clock is 15 Oct 2026: a deletion 91 days before is a tombstone, 89 days before isn't yet.
const DAYS_AGO = (n: number) => new Date(Date.UTC(2026, 9, 15) - n * 86_400_000).toISOString();
const LONG_AGO = DAYS_AGO(91), LATELY = DAYS_AGO(89);

const count = async (deps: TestDeps, table: string, where = "1=1") =>
	(await deps.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).first<number>("n")) ?? 0;

/** A video deleted and purged at `at`, with a clip (tagged with a player), a view, and its game's closed stream naming it. */
async function deletedVideo(deps: TestDeps, at: string, gameId?: number) {
	const game = gameId ?? await seedGame(deps);
	const id = await seedVideo(deps, { gameId: game, streamUid: `gone-${game}` });
	const t = deps.team.id;
	await deps.db.prepare("UPDATE videos SET deleted_at = ?, deleted_reason = 'admin', purge_after = NULL WHERE id = ?").bind(at, id).run();
	const clip = (await deps.db.prepare("INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, stream_uid, deleted_at) VALUES (?, ?, 'x', 1, 5, 'ready', NULL, ?)").bind(t, id, at).run()).meta.last_row_id;
	await deps.db.prepare("INSERT INTO clip_players (team_id, clip_id, player_id) SELECT ?, ?, id FROM players WHERE team_id = ? LIMIT 1").bind(t, clip, t).run();
	await deps.db.prepare("INSERT INTO video_views (team_id, video_id, member_id, opened_at) VALUES (?, ?, 1, ?)").bind(t, id, at).run();
	await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, status, created_at, finished_at, recording_video_id) VALUES (?, ?, ?, 'saved', ?, ?, ?)")
		.bind(t, game, `in-${id}`, at, at, id).run();
	return { id, game, clip };
}

describe("tombstones: rows deleted over 90 days ago, their media gone, that nothing kept names", () => {
	it("a video goes with its views, its clips and their players; its closed stream just forgets it", async () => {
		const deps = createTestDeps();
		const { id, clip } = await deletedVideo(deps, LONG_AGO);
		expect(await clearTombstones(deps)).toMatchObject({ tombstonesCleared: 1, errors: [] });
		expect(await count(deps, "videos", `id = ${id}`)).toBe(0);
		expect(await count(deps, "clips", `id = ${clip}`)).toBe(0);
		expect(await count(deps, "clip_players", `clip_id = ${clip}`)).toBe(0);
		expect(await count(deps, "video_views", `video_id = ${id}`)).toBe(0);
		expect(await deps.db.prepare("SELECT recording_video_id AS r FROM live_streams WHERE live_input_uid = ?").bind(`in-${id}`).first<number | null>("r")).toBeNull();
		expect(TOMBSTONE_DAYS).toBe(90);
	});
	it("stays while the download log, a removal request, or a clip's request or favourite names it, or it's under 90 days, or its media isn't purged yet", async () => {
		const deps = createTestDeps();
		const t = deps.team.id;
		const downloaded = await deletedVideo(deps, LONG_AGO);
		await deps.db.prepare("INSERT INTO downloads (team_id, video_id, member_id, kind, created_at) VALUES (?, ?, 1, 'hd', ?)").bind(t, downloaded.id, LONG_AGO).run();
		const asked = await deletedVideo(deps, LONG_AGO);
		await deps.db.prepare("INSERT INTO removal_requests (team_id, video_id, member_id, status, created_at) VALUES (?, ?, 1, 'video_deleted', ?)").bind(t, asked.id, LONG_AGO).run();
		const clipAsked = await deletedVideo(deps, LONG_AGO);
		await deps.db.prepare("INSERT INTO clip_removal_requests (team_id, clip_id, member_id, status, created_at) VALUES (?, ?, 1, 'clip_deleted', ?)").bind(t, clipAsked.clip, LONG_AGO).run();
		const starred = await deletedVideo(deps, LONG_AGO);
		await deps.db.prepare("INSERT INTO favourites (team_id, member_id, clip_id, created_at) VALUES (?, 1, ?, ?)").bind(t, starred.clip, LONG_AGO).run();
		await deletedVideo(deps, LATELY);
		const unpurged = await deletedVideo(deps, LONG_AGO);
		await deps.db.prepare("UPDATE videos SET purge_after = ? WHERE id = ?").bind(DAYS_AGO(90), unpurged.id).run();
		expect(await clearTombstones(deps)).toMatchObject({ tombstonesCleared: 0, errors: [] });
		expect(await count(deps, "videos")).toBe(6);
	});
	it("a game goes once its last video has, with its score, notes, favourites and closed streams; one with a kept video stays", async () => {
		const deps = createTestDeps();
		const t = deps.team.id;
		const { id, game } = await deletedVideo(deps, LONG_AGO);
		await deps.db.prepare("UPDATE games SET deleted_at = ? WHERE id = ?").bind(LONG_AGO, game).run();
		await deps.db.prepare("INSERT INTO game_scores (team_id, game_id, ours, opponent, source, entered_at) VALUES (?, ?, 40, 30, 'manual', ?)").bind(t, game, LONG_AGO).run();
		await deps.db.prepare("INSERT INTO coach_notes (team_id, game_id, body, created_by, deleted_at) VALUES (?, ?, 'n', 1, ?)").bind(t, game, LONG_AGO).run();
		await deps.db.prepare("INSERT INTO favourites (team_id, member_id, game_id, created_at) VALUES (?, 1, ?, ?)").bind(t, game, LONG_AGO).run();
		const kept = await deletedVideo(deps, LONG_AGO);
		await deps.db.prepare("INSERT INTO downloads (team_id, video_id, member_id, kind, created_at) VALUES (?, ?, 1, 'hd', ?)").bind(t, kept.id, LONG_AGO).run();
		await deps.db.prepare("UPDATE games SET deleted_at = ? WHERE id = ?").bind(LONG_AGO, kept.game).run();
		// The first run takes the video (the game still had it when the run read them); the next takes the game.
		expect(await clearTombstones(deps)).toMatchObject({ tombstonesCleared: 1, errors: [] });
		expect(await count(deps, "games", `id = ${game}`)).toBe(1);
		expect(await clearTombstones(deps)).toMatchObject({ tombstonesCleared: 1, errors: [] });
		expect(await count(deps, "videos", `id = ${id}`)).toBe(0);
		expect(await count(deps, "games", `id = ${game}`)).toBe(0);
		expect(await count(deps, "game_scores", `game_id = ${game}`)).toBe(0);
		expect(await count(deps, "coach_notes", `game_id = ${game}`)).toBe(0);
		expect(await count(deps, "favourites", `game_id = ${game}`)).toBe(0);
		expect(await count(deps, "live_streams", `game_id = ${game}`)).toBe(0);
		expect(await count(deps, "games", `id = ${kept.game}`)).toBe(1);
		expect(await count(deps, "videos", `id = ${kept.id}`)).toBe(1);
	});
	it("a clip deleted from a video still on the site, and a photo, go too", async () => {
		const deps = createTestDeps();
		const t = deps.team.id;
		const videoId = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "live" });
		const clip = (await deps.db.prepare("INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, deleted_at) VALUES (?, ?, 'x', 1, 5, 'ready', ?)").bind(t, videoId, LONG_AGO).run()).meta.last_row_id;
		const keptClip = (await deps.db.prepare("INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, deleted_at) VALUES (?, ?, 'y', 1, 5, 'ready', ?)").bind(t, videoId, LATELY).run()).meta.last_row_id;
		await deps.db.prepare("INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at, deleted_at, deleted_reason) VALUES (?, 'img-1', '2026-07-01T10:00:00', 10, 10, 10, 1, '2027-12-31T13:00:00.000Z', ?, ?, 'admin')").bind(t, LONG_AGO, LONG_AGO).run();
		await deps.db.prepare("INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at, deleted_at, deleted_reason) VALUES (?, 'img-2', '2026-07-01T10:00:00', 10, 10, 10, 1, '2027-12-31T13:00:00.000Z', ?, ?, 'admin')").bind(t, LONG_AGO, LONG_AGO).run();
		await deps.db.prepare("INSERT INTO photo_removal_requests (team_id, photo_id, member_id, status, created_at) SELECT team_id, id, 1, 'photo_deleted', ? FROM photos WHERE image_id = 'img-2'").bind(LONG_AGO).run();
		expect(await clearTombstones(deps)).toMatchObject({ tombstonesCleared: 2, errors: [] });
		expect(await count(deps, "clips", `id = ${clip}`)).toBe(0);
		expect(await count(deps, "clips", `id = ${keptClip}`)).toBe(1);
		expect(await count(deps, "videos", `id = ${videoId}`)).toBe(1);
		expect(await count(deps, "photos", "image_id = 'img-1'")).toBe(0);
		expect(await count(deps, "photos", "image_id = 'img-2'")).toBe(1);
	});
	it("runs as part of the 5-minute job, each team's turn clearing its own", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		await deps.db.prepare("INSERT INTO games (team_id, starts_at, competition, opponent, deleted_at) VALUES (?, '2026-07-01T18:40', 'VJBL', 'x', ?)").bind(G14_5.id, LONG_AGO).run();
		const { id } = await deletedVideo(deps, LONG_AGO);
		// Each team's turn clears its own: B12.1's video, G14.5's game.
		expect(await runSync(deps)).toMatchObject({ tombstonesCleared: 2 });
		expect(await count(deps, "videos", `id = ${id}`)).toBe(0);
		expect(await count(deps, "games", `team_id = '${G14_5.id}'`)).toBe(0);
		expect(await count(deps, "games", `team_id = '${deps.team.id}'`)).toBe(1);
	});
	it("takes a few a run: with 50 waiting, a run's trips stay bounded", async () => {
		const deps = createTestDeps();
		for (let i = 0; i < 25; i++) await deletedVideo(deps, LONG_AGO);
		for (let i = 0; i < 25; i++) {
			await deps.db.prepare("INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at, deleted_at, deleted_reason) VALUES (?, ?, '2026-07-01T10:00:00', 10, 10, 10, 1, '2027-12-31T13:00:00.000Z', ?, ?, 'admin')")
				.bind(deps.team.id, `p-${i}`, LONG_AGO, LONG_AGO).run();
		}
		const { db, counter } = countingDb(deps.db);
		const result = await clearTombstones({ ...deps, db });
		expect(result.tombstonesCleared).toBe(30); // 10 videos and 20 photos
		expect(counter.trips).toBe(31); // one read, then a batch a row
		expect(counter.mostParams).toBeLessThanOrEqual(10);
	});
});
