import { describe, expect, it } from "vitest";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { purgeMedia } from "../../../src/features/videos/video-removal-service.ts";
import { markRepairFailed } from "../../../src/features/videos/video-writes-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// A Go live recording Stream refuses (Safari's bad frame lengths, say) is repaired once: the joiner copies it into a fresh
// file, and Stream is asked again. Refused again, or not repaired, it fails as any video does, with its ticket.

const REFUSED = { readyToStream: false, state: "error", errorReason: "The video exceeded the maximum acceptable duration.", durationSeconds: -1 };
async function refused(live = true) {
	let now = new Date("2026-11-19T06:00:00Z");
	const deps = createTestDeps(now);
	(deps as { now: () => Date }).now = () => now;
	const later = (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); };
	const gameId = await seedGame(deps, { startsAt: "2026-11-20T18:30" });
	const key = "originals/b12.1-2026/att-1/live-2026-11-20.mp4";
	const videoId = await seedVideo(deps, { gameId, status: "processing", streamUid: "uid-bad", r2Key: key });
	deps.stream.videos.set("uid-bad", REFUSED);
	if (live) {
		await deps.db.prepare(`INSERT INTO live_streams (team_id, game_id, live_input_uid, status, created_at, recording_video_id, source)
			VALUES (?, ?, 'input-1', 'saved', '2026-11-19T05:51:00.000Z', ?, 'camera')`).bind(deps.team.id, gameId, videoId).run();
	}
	const store = (k: string) => deps.originals.puts.set(k, { body: "repaired", contentType: "video/mp4", custom: {}, uploaded: now.toISOString() });
	return { deps, videoId, key, repaired: key.replace(/\.mp4$/, ".repaired.mp4"), later, store };
}
const tickets = async (deps: TestDeps) => (await deps.db.prepare("SELECT COUNT(*) AS n FROM support_requests").first<number>("n")) ?? 0;
const video = (deps: TestDeps, id: number) => getVideo(deps.db, deps.team.id, id);

describe("repairing a Go live recording Stream refused", () => {
	it("sends it to the joiner once, as one part into a fresh file, instead of failing it; no ticket yet", async () => {
		const { deps, videoId, key, repaired } = await refused();
		await runSync(deps);
		expect(await video(deps, videoId)).toMatchObject({ status: "processing", streamUid: null, r2Key: key });
		expect((await video(deps, videoId))?.repairTriedAt).not.toBeNull();
		expect(deps.stream.deleted).toContain("uid-bad");
		expect(await tickets(deps)).toBe(0);
		await runSync(deps);
		expect(deps.joiner.asked.at(-1)!.segments.map((u) => u.split("?")[0])).toEqual([`https://r2.test/${key}`]);
		expect(deps.joiner.started).toEqual([`https://r2.test/${repaired}`]);
	});

	it("sends the repaired file to Stream, keeping the one it refused; refused again, it fails with its ticket", async () => {
		const { deps, videoId, key, repaired, later, store } = await refused();
		await runSync(deps);
		await runSync(deps);
		later(5);
		store(repaired);
		await runSync(deps);
		const sent = await video(deps, videoId);
		expect(sent).toMatchObject({ status: "processing", r2Key: repaired });
		expect(sent?.streamUid).not.toBeNull();
		expect(deps.originals.removed).not.toContain(key);
		expect(await deps.db.prepare("SELECT detail FROM admin_log WHERE action = 'video_joined'").first("detail")).toMatch(/Stream refused it, so the joiner copied it/);
		deps.stream.videos.set(sent!.streamUid!, REFUSED);
		later(5);
		await runSync(deps);
		expect(await video(deps, videoId)).toMatchObject({ status: "failed" });
		expect(await tickets(deps)).toBe(1);
	});

	it("a plain upload Stream refuses fails at once, as before", async () => {
		const { deps, videoId } = await refused(false);
		await runSync(deps);
		expect(await video(deps, videoId)).toMatchObject({ status: "failed" });
		expect(deps.joiner.asked).toEqual([]);
		expect(await tickets(deps)).toBe(1);
	});

	it("a repair the joiner can't do fails the video with its ticket, offering no first part to keep", async () => {
		const { deps, videoId, later } = await refused();
		deps.joiner.result = { ok: false, reason: "ffmpeg: Invalid data found when processing input" };
		await runSync(deps);
		for (let i = 0; i < 20; i++) { later(10); await runSync(deps); }
		expect(await video(deps, videoId)).toMatchObject({ status: "failed", joinFailedAt: null });
		expect(await tickets(deps)).toBe(1);
	});

	it("two runs at once: one repairs it, the other leaves it alone, never failing it or telling anyone", async () => {
		const { deps, videoId } = await refused();
		await Promise.all([runSync(deps), runSync(deps)]);
		const v = await video(deps, videoId);
		expect(v).toMatchObject({ status: "processing", streamUid: null });
		expect(await tickets(deps)).toBe(0);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM activity WHERE kind = 'video_failed'").first("n")).toBe(0);
	});

	it("lets the refused file go once the repaired copy plays, or when the video is deleted", async () => {
		const { deps, videoId, key, repaired, later, store } = await refused();
		await runSync(deps);
		await runSync(deps);
		later(5);
		store(repaired);
		await runSync(deps);
		const sent = (await video(deps, videoId))!;
		deps.stream.videos.set(sent.streamUid!, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 2830 });
		later(5);
		await runSync(deps);
		expect(await video(deps, videoId)).toMatchObject({ status: "ready" });
		expect(deps.originals.removed).toContain(key);
		// Deleted before it played: the refused file goes with the repaired one.
		const other = await refused();
		await runSync(other.deps); await runSync(other.deps); other.later(5); other.store(other.repaired); await runSync(other.deps);
		await purgeMedia(other.deps, (await video(other.deps, other.videoId))!);
		expect(other.deps.originals.removed).toEqual(expect.arrayContaining([other.key, other.repaired]));
	});

	it("a repair given up says so as any failure does: Stream's reason kept, the Log's video_failed line, a Problems line", async () => {
		const { deps, videoId, later } = await refused();
		deps.joiner.result = { ok: false, reason: "ffmpeg: Invalid data found when processing input" };
		await runSync(deps);
		for (let i = 0; i < 20; i++) { later(10); await runSync(deps); }
		expect((await video(deps, videoId))?.failureReason).toMatch(/^The video exceeded the maximum acceptable duration\..*couldn't be repaired: ffmpeg: Invalid data/);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM activity WHERE kind = 'video_failed'").first("n")).toBe(1);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM problems WHERE what LIKE '%couldn''t be repaired%'").first("n")).toBe(1);
	});

	it("two runs giving the same repair up at once fail it once: one activity line, one ticket", async () => {
		const { deps, videoId, later } = await refused();
		await runSync(deps);
		later(5);
		await deps.db.prepare("UPDATE videos SET join_tries = 6, join_tried_at = '2026-11-19T05:30:00.000Z' WHERE id = ?").bind(videoId).run();
		await Promise.all([runSync(deps), runSync(deps)]);
		expect(await video(deps, videoId)).toMatchObject({ status: "failed" });
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM activity WHERE kind = 'video_failed'").first("n")).toBe(1);
		expect(await tickets(deps)).toBe(1);
	});

	it("says in the Log that the recording was repaired, not that parts were joined", async () => {
		const { deps, repaired, later, store } = await refused();
		await runSync(deps); await runSync(deps); later(5); store(repaired); await runSync(deps);
		const page = await (await makeClient(deps)("/admin/log?event=video_joined")).text();
		const line = page.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
		expect(line, line.slice(line.indexOf("repaired") - 200, line.indexOf("repaired") + 200)).toMatch(/repaired the recording of Saints B12\.1&#39;s game .{0,60}: Stream refused it, so the joiner copied it into a fresh file/);
	});

	it("never fails a repair another run has just finished: only while the video is still on the file Stream refused", async () => {
		const { deps, videoId, key, repaired, later, store } = await refused();
		await runSync(deps); await runSync(deps); later(5); store(repaired);
		await deps.db.prepare("UPDATE videos SET r2_key = ? WHERE id = ?").bind(repaired, videoId).run(); // finish() has moved it on
		expect(await markRepairFailed(deps.db, deps.team.id, videoId, key, "given up")).toBe(false);
		expect(await video(deps, videoId)).toMatchObject({ status: "processing" });
	});
});
