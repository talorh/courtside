import { describe, expect, it } from "vitest";
import { logDownload, purgeDownloadsBefore } from "../../../src/features/videos/downloads-repository.ts";
import {
	insertUploadVideo, markFailed, markReady, markUploaded, moveVideo, setStreamUid, softDeleteVideo,
} from "../../../src/features/videos/video-writes-repository.ts";
import { getActiveVideoForGame, getVideo, listExpiredVideos, listVideosByStatus } from "../../../src/features/videos/videos-repository.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

const upload = (teamId: string, gameId: number, key = "originals/t/a/game.mov") => ({
	teamId, gameId, r2Key: key, r2UploadId: "up-1", originalName: "game.mov", originalBytes: 10, uploadedBy: 1, deleteAfter: "2028-01-01T00:00:00.000Z", createdAt: "2026-10-15T00:00:00.000Z",
});

describe("videos repository", () => {
	it("walks an upload through its lifecycle", async () => {
		const deps = createTestDeps();
		const { db } = deps, teamId = deps.team.id;
		const gameId = await seedGame(deps);
		const id = await insertUploadVideo(db, upload(teamId, gameId));
		expect(await getVideo(db, teamId, id)).toMatchObject({ status: "uploading", r2UploadId: "up-1" });
		await markUploaded(db, teamId, id, "2026-10-15T00:00:00.000Z");
		await setStreamUid(db, teamId, id, "uid-1");
		expect((await listVideosByStatus(db, teamId, "processing")).map((v) => v.id)).toEqual([id]);
		await markReady(db, teamId, id, 2830);
		expect(await getActiveVideoForGame(db, teamId, gameId)).toMatchObject({ id, status: "ready", durationSeconds: 2830, r2UploadId: null });
		await expect(markUploaded(db, teamId, id, "2026-10-15T00:00:00.000Z")).rejects.toThrow(/video/);
	});

	it("allows one video per game; failed and deleted ones don't count", async () => {
		const deps = createTestDeps();
		const { db } = deps, teamId = deps.team.id;
		const gameId = await seedGame(deps);
		const first = await insertUploadVideo(db, upload(teamId, gameId));
		await expect(insertUploadVideo(db, upload(teamId, gameId, "originals/t/b/game.mov"))).rejects.toThrow(/UNIQUE/);
		await markFailed(db, teamId, first, "corrupt");
		expect((await getVideo(db, teamId, first))?.failureReason).toBe("corrupt");
		const second = await insertUploadVideo(db, upload(teamId, gameId, "originals/t/b/game.mov"));
		expect((await getActiveVideoForGame(db, teamId, gameId))?.id).toBe(second);
	});

	it("moves, expires and soft-deletes", async () => {
		const deps = createTestDeps();
		const { db } = deps, teamId = deps.team.id;
		const g1 = await seedGame(deps);
		const g2 = await seedGame(deps, { roundLabel: "10" });
		const id = await seedVideo(deps, { gameId: g1, streamUid: "u", deleteAfter: "2026-10-01T00:00:00.000Z" });
		await moveVideo(db, teamId, id, g2);
		expect((await getVideo(db, teamId, id))?.gameId).toBe(g2);
		expect((await listExpiredVideos(db, teamId, "2026-10-15T00:00:00.000Z")).map((v) => v.id)).toEqual([id]);
		await softDeleteVideo(db, teamId, id, "2026-10-15T00:00:00.000Z", "retention");
		expect(await getVideo(db, teamId, id)).toBeNull();
		expect(await getActiveVideoForGame(db, teamId, g2)).toBeNull();
	});

	it("logs and purges downloads", async () => {
		const deps = createTestDeps();
		const videoId = await seedVideo(deps, { gameId: await seedGame(deps) });
		const { db } = deps, teamId = deps.team.id;
		await logDownload(db, { teamId, videoId, memberId: 1, kind: "hd", nowIso: "2024-01-01T00:00:00.000Z" });
		await logDownload(db, { teamId, videoId, memberId: 1, kind: "hd", nowIso: "2026-10-01T00:00:00.000Z" });
		expect(await purgeDownloadsBefore(db, teamId, "2025-01-01T00:00:00.000Z")).toBe(1);
	});
});
