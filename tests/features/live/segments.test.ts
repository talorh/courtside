import { describe, expect, it } from "vitest";
import {
	completeSegmentRow, deleteSegmentRows, insertSegment, listSegments, segmentKey, videosWithSegments,
} from "../../../src/features/live/recording-segments-repository.ts";
import { countJoinTry, setJoinFailed } from "../../../src/features/videos/video-writes-repository.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

describe("recording segments", () => {
	it("names each segment beside the recording, lists them in order, completes and deletes them", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		const videoId = await seedVideo(deps, { gameId, status: "uploading", r2Key: "originals/b12.1-2026/att/live-2026-10-15.mp4", r2UploadId: "up-1" });
		expect(segmentKey("originals/b12.1-2026/att/live-2026-10-15.mp4", 2)).toBe("originals/b12.1-2026/att/live-2026-10-15.2.mp4");
		await insertSegment(deps.db, { teamId: deps.team.id, videoId, n: 2, r2Key: segmentKey("originals/b12.1-2026/att/live-2026-10-15.mp4", 2), r2UploadId: "up-2", nowIso: "2026-10-15T09:00:00.000Z" });
		await insertSegment(deps.db, { teamId: deps.team.id, videoId, n: 3, r2Key: segmentKey("originals/b12.1-2026/att/live-2026-10-15.mp4", 3), r2UploadId: "up-3", nowIso: "2026-10-15T09:10:00.000Z" });
		expect((await listSegments(deps.db, deps.team.id, videoId)).map((s) => [s.n, s.r2UploadId])).toEqual([[2, "up-2"], [3, "up-3"]]);
		expect(await videosWithSegments(deps.db, deps.team.id)).toEqual(new Set([videoId]));
		await completeSegmentRow(deps.db, deps.team.id, videoId, 2, "2026-10-15T09:20:00.000Z");
		expect((await listSegments(deps.db, deps.team.id, videoId)).map((s) => [s.n, s.r2UploadId, s.completedAt])).toEqual([[2, null, "2026-10-15T09:20:00.000Z"], [3, "up-3", null]]);
		await deleteSegmentRows(deps.db, deps.team.id, videoId);
		expect(await listSegments(deps.db, deps.team.id, videoId)).toEqual([]);
	});
	it("counts the join's tries and marks it failed", async () => {
		const deps = createTestDeps();
		const videoId = await seedVideo(deps, { gameId: await seedGame(deps), status: "processing", r2Key: "originals/b12.1-2026/att/live.mp4" });
		await countJoinTry(deps.db, deps.team.id, videoId, "2026-10-15T09:00:00.000Z");
		expect(await getVideo(deps.db, deps.team.id, videoId)).toMatchObject({ joinTries: 1, joinTriedAt: "2026-10-15T09:00:00.000Z", joinFailedAt: null });
		await setJoinFailed(deps.db, deps.team.id, videoId, "2026-10-15T10:00:00.000Z");
		expect((await getVideo(deps.db, deps.team.id, videoId))?.joinFailedAt).toBe("2026-10-15T10:00:00.000Z");
	});
});

describe("uploading into a segment", () => {
	async function segmented() {
		let now = new Date("2026-10-15T00:00:00Z");
		const deps = createTestDeps();
		(deps as { now: () => Date }).now = () => now;
		const later = (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); };
		const team = deps.team.id;
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'sam@x.com', 'filmer')").bind(team).run();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		const sam = makeClient(deps, "sam@x.com");
		const start = ((await (await sam(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }))).json()) as { data: { videoId: number } }).data;
		const video = (await getVideo(deps.db, team, start.videoId))!;
		const key2 = segmentKey(video.r2Key!, 2);
		const up2 = await deps.originals.createMultipart(key2, "video/mp4");
		await insertSegment(deps.db, { teamId: team, videoId: video.id, n: 2, r2Key: key2, r2UploadId: up2, nowIso: deps.now().toISOString() });
		const reached = (uploadId: string, numbers: number[]) => deps.presigner.parts.set(uploadId, numbers.map((partNumber) => ({ partNumber, etag: `"e${partNumber}"`, uploaded: "2026-10-14T23:00:00.000Z" })));
		return { deps, gameId, sam, video, key2, up2, reached, later };
	}
	const data = async <T,>(res: Response) => ((await res.json()) as { data: T }).data;
	it("part URLs and complete go to the segment asked for; segment 1 is the default, as older pages send", async () => {
		const { deps, sam, video, key2, up2 } = await segmented();
		const one = await data<{ urls: Record<number, string> }>(await sam(`/api/uploads/${video.id}/part-urls`, jsonBody({ partNumbers: [1] })));
		expect(one.urls[1]).toContain(`${video.r2Key}?partNumber=1&uploadId=${video.r2UploadId}`);
		const two = await data<{ urls: Record<number, string> }>(await sam(`/api/uploads/${video.id}/part-urls`, jsonBody({ partNumbers: [1], segment: 2 })));
		expect(two.urls[1]).toContain(`${key2}?partNumber=1&uploadId=${up2}`);
		expect((await sam(`/api/uploads/${video.id}/part-urls`, jsonBody({ partNumbers: [1], segment: 3 }))).status).toBe(404);
		void deps;
	});
	it("completing the current segment completes the earlier ones from R2's own part lists, and leaves the video processing for the join, not a Stream copy", async () => {
		const { deps, sam, video, key2, reached } = await segmented();
		reached(video.r2UploadId!, [1, 2, 3]);
		const res = await sam(`/api/uploads/${video.id}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "x1" }], segment: 2 }));
		expect(await data<{ status: string }>(res)).toEqual({ status: "joining" });
		expect(deps.originals.completed.map((c) => [c.key, c.parts.length])).toEqual([[video.r2Key, 3], [key2, 1]]);
		expect(await getVideo(deps.db, deps.team.id, video.id)).toMatchObject({ status: "processing", streamUid: null });
		expect(deps.stream.uploads).toHaveLength(0);
		expect((await listSegments(deps.db, deps.team.id, video.id))[0]).toMatchObject({ n: 2, r2UploadId: null });
		expect(await deps.db.prepare("SELECT status FROM live_streams").first("status")).toBe("saved");
	});
	it("an earlier segment nothing reached R2 for is dropped, not kept as an empty file", async () => {
		const { deps, sam, video, key2 } = await segmented();
		const res = await sam(`/api/uploads/${video.id}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "x1" }], segment: 2 }));
		expect(res.status).toBe(200);
		expect(deps.originals.completed.map((c) => c.key)).toEqual([key2]);
		expect(deps.originals.aborted).toContain(video.r2Key);
		// Only one segment is left whole: the video is its own file, and goes to Stream as any upload does.
		expect(await getVideo(deps.db, deps.team.id, video.id)).toMatchObject({ status: "processing", r2Key: key2, streamUid: "uid-1" });
		expect(await listSegments(deps.db, deps.team.id, video.id)).toEqual([]);
	});
	it("a first segment nothing reached is dropped: the next whole one is the video's own file, and the rest its segments", async () => {
		const { deps, sam, video, key2, reached } = await segmented();
		const key3 = segmentKey(video.r2Key!, 3);
		const up3 = await deps.originals.createMultipart(key3, "video/mp4");
		await insertSegment(deps.db, { teamId: deps.team.id, videoId: video.id, n: 3, r2Key: key3, r2UploadId: up3, nowIso: deps.now().toISOString() });
		reached(deps.originals.created.get(key2)!, [1]);
		const res = await sam(`/api/uploads/${video.id}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "x1" }], segment: 3 }));
		expect(await data<{ status: string }>(res)).toEqual({ status: "joining" });
		expect(deps.originals.aborted).toContain(video.r2Key);
		expect(await getVideo(deps.db, deps.team.id, video.id)).toMatchObject({ status: "processing", r2Key: key2, streamUid: null });
		expect((await listSegments(deps.db, deps.team.id, video.id)).map((s) => [s.n, s.r2Key, s.r2UploadId])).toEqual([[3, key3, null]]);
	});
	it("the next whole segment becomes the video's file and stops being a segment in one write, so an End game that died there and is asked again doesn't join that file to itself", async () => {
		const { deps, sam, video, key2 } = await segmented();
		const key3 = segmentKey(video.r2Key!, 3);
		await insertSegment(deps.db, { teamId: deps.team.id, videoId: video.id, n: 3, r2Key: key3, r2UploadId: await deps.originals.createMultipart(key3, "video/mp4"), nowIso: deps.now().toISOString() });
		deps.presigner.parts.set(deps.originals.created.get(key2)!, [{ partNumber: 1, etag: '"e1"', uploaded: "2026-10-14T23:00:00.000Z" }]);
		await deps.db.prepare("CREATE TRIGGER no_segment_delete BEFORE DELETE ON recording_segments BEGIN SELECT RAISE(ABORT, 'team_id: the database stopped'); END").run();
		const end = () => sam(`/api/uploads/${video.id}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "x1" }], segment: 3 }));
		expect((await end()).status).toBe(500);
		expect((await getVideo(deps.db, deps.team.id, video.id))?.r2Key).toBe(video.r2Key);
		await deps.db.prepare("DROP TRIGGER no_segment_delete").run();
		expect(await data<{ status: string }>(await end())).toEqual({ status: "joining" });
		expect((await getVideo(deps.db, deps.team.id, video.id))?.r2Key).toBe(key2);
		expect((await listSegments(deps.db, deps.team.id, video.id)).map((s) => s.r2Key)).toEqual([key3]);
	});
	it("a segment R2 finished on an earlier try (the answer lost, the page asking again) is whole, not dropped", async () => {
		const { deps, sam, video, key2 } = await segmented();
		// The first try completed segment 1 in R2 and died before the video was marked: R2 no longer lists its parts.
		deps.originals.completed.push({ key: video.r2Key!, parts: [{ partNumber: 1, etag: "e1" }] });
		deps.presigner.gone.add(video.r2UploadId!);
		const res = await sam(`/api/uploads/${video.id}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "x1" }], segment: 2 }));
		expect(await data<{ status: string }>(res)).toEqual({ status: "joining" });
		expect(deps.originals.aborted).not.toContain(video.r2Key);
		expect(await getVideo(deps.db, deps.team.id, video.id)).toMatchObject({ status: "processing", r2Key: video.r2Key, streamUid: null });
		expect((await listSegments(deps.db, deps.team.id, video.id)).map((s) => [s.n, s.r2Key, s.r2UploadId])).toEqual([[2, key2, null]]);
	});
	it("Save what was recorded completes every segment the same way", async () => {
		const { deps, sam, gameId, video, up2, reached, later } = await segmented();
		reached(video.r2UploadId!, [1, 2]);
		reached(up2, [1]);
		later(10); // the recording began ten minutes ago, and nothing has come since
		expect(await data<object>(await sam(`/api/live/${gameId}/save`, jsonBody({})))).toEqual({ status: "saved" });
		expect(deps.originals.completed.map((c) => c.key).sort()).toEqual([video.r2Key, segmentKey(video.r2Key!, 2)].sort());
		expect(await getVideo(deps.db, deps.team.id, video.id)).toMatchObject({ status: "processing", streamUid: null });
	});
	it("deleting the recording aborts every segment's upload", async () => {
		const { deps, sam, video, key2 } = await segmented();
		expect((await sam(`/api/uploads/${video.id}/abort`, jsonBody({}))).status).toBe(200);
		expect(deps.originals.aborted).toEqual(expect.arrayContaining([video.r2Key, key2]));
		expect(await listSegments(deps.db, deps.team.id, video.id)).toEqual([]);
	});
	it("the 5-minute job doesn't ask Stream to copy a video whose segments aren't joined", async () => {
		const { deps, sam, video, reached } = await segmented();
		reached(video.r2UploadId!, [1]);
		await sam(`/api/uploads/${video.id}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "x1" }], segment: 2 }));
		await runSync(deps);
		expect(deps.stream.uploads).toHaveLength(0);
	});
});
