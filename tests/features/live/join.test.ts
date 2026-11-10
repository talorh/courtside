import { describe, expect, it } from "vitest";
import { insertSegment, listSegments, segmentKey } from "../../../src/features/live/recording-segments-repository.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

/** A recording whose two segments are whole in R2, waiting for the join (as finishSegments leaves it). */
async function addWaiting(deps: TestDeps, date: string, nowIso: string) {
	const gameId = await seedGame(deps, { startsAt: `${date}T18:40` });
	const key = `originals/b12.1-2026/att-${date}/live-${date}.mp4`;
	const videoId = await seedVideo(deps, { gameId, status: "processing", r2Key: key });
	deps.originals.completed.push({ key, parts: [] }, { key: segmentKey(key, 2), parts: [] });
	await insertSegment(deps.db, { teamId: deps.team.id, videoId, n: 2, r2Key: segmentKey(key, 2), r2UploadId: "up-2", nowIso });
	await deps.db.prepare("UPDATE recording_segments SET r2_upload_id = NULL, completed_at = ? WHERE video_id = ?").bind(nowIso, videoId).run();
	return { gameId, videoId, key, joined: key.replace(/\.mp4$/, ".joined.mp4") };
}
async function waiting() {
	let now = new Date("2026-10-15T10:00:00Z");
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	const later = (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); };
	/** The joined file lands in storage, as the joiner's PUT leaves it. */
	const store = (key: string) => deps.originals.puts.set(key, { body: "joined", contentType: "video/mp4", custom: {}, uploaded: now.toISOString() });
	return { deps, ...(await addWaiting(deps, "2026-10-15", now.toISOString())), later, store, nowIso: () => now.toISOString() };
}
const alert = (deps: TestDeps) => deps.db.prepare("SELECT level, detail FROM platform_alerts WHERE kind = 'joiner'").first<{ level: string; detail: string }>();
const video = (deps: TestDeps, id: number) => getVideo(deps.db, deps.team.id, id);

describe("the join step", () => {
	it("begins the join from the segments' links on one run and leaves the video as it is", async () => {
		const { deps, videoId, key, joined } = await waiting();
		const summary = await runSync(deps);
		expect(summary.joined).toBe(0);
		expect(deps.joiner.started).toEqual([`https://r2.test/${joined}`]);
		expect(deps.joiner.asked[0]!.segments.map((u) => u.split("?")[0])).toEqual([`https://r2.test/${key}`, `https://r2.test/${segmentKey(key, 2)}`]);
		expect(deps.joiner.asked[0]).toMatchObject({ container: "mp4", output: `https://r2.test/${joined}?put=1`, start: true });
		expect(await video(deps, videoId)).toMatchObject({ r2Key: key, joinTries: 1, streamUid: null });
		expect(deps.originals.removed).toEqual([]);
	});
	it("a later run finds the joined file: the video points at it, the segments go and Stream is asked for the copy", async () => {
		const { deps, videoId, key, joined, later, store } = await waiting();
		await runSync(deps);
		later(5);
		store(joined);
		const summary = await runSync(deps);
		expect(summary.joined).toBe(1);
		expect(await video(deps, videoId)).toMatchObject({ r2Key: joined, status: "processing", streamUid: "uid-1", joinTries: 0, joinTriedAt: null });
		expect(await listSegments(deps.db, deps.team.id, videoId)).toEqual([]);
		expect(deps.originals.removed.sort()).toEqual([key, segmentKey(key, 2)].sort());
		expect(await deps.db.prepare("SELECT detail FROM admin_log WHERE action = 'video_joined'").first()).toMatchObject({ detail: expect.stringContaining("2 parts joined into one video (0 MB, 5 min)") });
	});
	it("a join still running is left to run: no second join begun, no try counted, however long it takes", async () => {
		const { deps, videoId, later } = await waiting();
		deps.joiner.slow = true;
		await runSync(deps);
		for (let i = 0; i < 6; i++) { later(5); await runSync(deps); }
		expect(deps.joiner.started).toHaveLength(1);
		expect(deps.joiner.asked).toHaveLength(7);
		expect(await video(deps, videoId)).toMatchObject({ joinTries: 1, joinFailedAt: null });
	});
	it("a failed join is begun again ten minutes after it began; the sixth failure asks the team manager, writes a Problems line and raises the joiner alert", async () => {
		const { deps, videoId, later } = await waiting();
		deps.joiner.result = { ok: false, reason: "ffmpeg: moov atom not found" };
		await runSync(deps); // begun
		later(5);
		await runSync(deps); // told it failed: too soon to begin again
		expect(await video(deps, videoId)).toMatchObject({ joinTries: 1, joinFailedAt: null });
		expect(deps.joiner.started).toHaveLength(1);
		for (let i = 0; i < 5; i++) { later(5); await runSync(deps); later(5); await runSync(deps); }
		expect(await video(deps, videoId)).toMatchObject({ joinTries: 6, joinFailedAt: expect.any(String), status: "processing" });
		expect(deps.joiner.started).toHaveLength(6);
		expect(await deps.db.prepare("SELECT what, detail FROM problems WHERE kind = 'stream_problem'").first()).toMatchObject({ what: expect.stringContaining("couldn't be joined"), detail: expect.stringContaining("moov atom") });
		expect(await alert(deps)).toMatchObject({ level: "urgent" });
		expect(await deps.db.prepare("SELECT action FROM admin_log WHERE action = 'join_failed'").first()).toBeTruthy();
		const asked = deps.joiner.asked.length;
		later(10);
		await runSync(deps);
		expect(deps.joiner.asked).toHaveLength(asked); // given up
	});
	it("a joiner that doesn't answer counts as a try, ten minutes apart, and nothing is deleted; six and the team manager is asked", async () => {
		const { deps, videoId, key, later } = await waiting();
		deps.joiner.down = true;
		await runSync(deps);
		later(5);
		await runSync(deps);
		expect(await video(deps, videoId)).toMatchObject({ joinTries: 1, r2Key: key, joinFailedAt: null });
		for (let i = 0; i < 5; i++) { later(10); await runSync(deps); }
		expect(await video(deps, videoId)).toMatchObject({ joinTries: 6, joinFailedAt: expect.any(String), r2Key: key });
		expect(deps.originals.removed).toEqual([]);
	});
	it("a join the joiner says is done isn't trusted without its file in storage: nothing is deleted, and it's begun again when due", async () => {
		const { deps, videoId, key, later } = await waiting();
		await runSync(deps);
		later(5);
		await runSync(deps); // done, says the joiner, but nothing is under the joined key
		expect(await video(deps, videoId)).toMatchObject({ joinTries: 1, r2Key: key });
		expect(deps.originals.removed).toEqual([]);
		later(5);
		await runSync(deps);
		expect(deps.joiner.started).toHaveLength(2);
	});
	it("a join that finishes between the look in storage and the ask is finished on that run, not called a failure", async () => {
		const { deps, videoId, joined, later, store } = await waiting();
		await runSync(deps);
		later(5);
		deps.joiner.whenDone = () => store(joined);
		expect((await runSync(deps)).joined).toBe(1);
		expect(await video(deps, videoId)).toMatchObject({ r2Key: joined, streamUid: "uid-1" });
	});
	it("a joiner that lost the join (its container restarted) begins it again when the ten minutes are up", async () => {
		const { deps, videoId, later } = await waiting();
		await runSync(deps);
		deps.joiner.lose();
		later(5);
		await runSync(deps);
		expect(deps.joiner.started).toHaveLength(1);
		expect(deps.joiner.asked[1]).toMatchObject({ start: false });
		later(5);
		await runSync(deps);
		expect(deps.joiner.started).toHaveLength(2);
		expect((await video(deps, videoId))?.joinTries).toBe(2);
	});
	it("a join lost on its last try gives up once its ten minutes are up", async () => {
		const { deps, videoId, later, nowIso } = await waiting();
		await deps.db.prepare("UPDATE videos SET join_tries = 6, join_tried_at = ? WHERE id = ?").bind(nowIso(), videoId).run();
		later(5);
		await runSync(deps);
		expect((await video(deps, videoId))?.joinFailedAt).toBeNull();
		later(5);
		await runSync(deps);
		expect(await video(deps, videoId)).toMatchObject({ joinFailedAt: expect.any(String) });
		expect(deps.joiner.started).toEqual([]);
		expect(await alert(deps)).toMatchObject({ level: "urgent", detail: expect.stringContaining("stopped part way") });
	});
	it("a joined file already in storage is the video, whatever the joiner remembers or says", async () => {
		const { deps, videoId, joined, later, store } = await waiting();
		await runSync(deps);
		deps.joiner.lose();
		deps.joiner.down = true;
		store(joined);
		later(5);
		expect((await runSync(deps)).joined).toBe(1);
		expect(await video(deps, videoId)).toMatchObject({ r2Key: joined, streamUid: "uid-1" });
	});
	it("pointing the video at the joined file and dropping its segments is one write: if either fails, neither happens", async () => {
		const { deps, videoId, key, joined, later, store } = await waiting();
		await runSync(deps);
		await deps.db.prepare("CREATE TRIGGER no_segment_delete BEFORE DELETE ON recording_segments BEGIN SELECT RAISE(ABORT, 'team_id: the database stopped'); END").run();
		later(5);
		store(joined);
		await expect(runSync(deps)).rejects.toThrow();
		expect(await video(deps, videoId)).toMatchObject({ r2Key: key, joinTries: 1 });
		expect(await listSegments(deps.db, deps.team.id, videoId)).toHaveLength(1);
		expect(deps.originals.removed).toEqual([]);
	});
	it("every waiting video is asked about on every run, so two games on one night don't wait on each other's ask", async () => {
		const { deps, nowIso } = await waiting();
		await addWaiting(deps, "2026-10-16", nowIso());
		await runSync(deps);
		expect(deps.joiner.started).toHaveLength(2);
	});
	it("without a joiner (cf dev) the step leaves the video waiting", async () => {
		const { deps, videoId } = await waiting();
		(deps as { joiner: unknown }).joiner = null;
		await runSync(deps);
		expect((await video(deps, videoId))?.joinTries).toBe(0);
		expect(deps.stream.uploads).toHaveLength(0);
	});
});
