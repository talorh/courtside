import { describe, expect, it } from "vitest";
import { type Member } from "../../../src/features/members/members-repository.ts";
import { findActiveMemberByEmail } from "../../helpers/members.ts";
import { completeUpload, partUrls, startUpload } from "../../../src/features/videos/upload-service.ts";
import { abortUpload } from "../../../src/features/videos/upload-abort-service.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { pickerGames, requireGame } from "../../../src/features/games/games-service.ts";
import { moveTargets, moveToGame } from "../../../src/features/videos/watch-service.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

async function setup() {
	const deps = createTestDeps();
	await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'sam@x.com', 'filmer'), (?, 'alex@x.com', 'filmer')")
		.bind(deps.team.id, deps.team.id).run();
	const sam = (await findActiveMemberByEmail(deps.db, deps.team.id, "sam@x.com")) as Member;
	const alex = (await findActiveMemberByEmail(deps.db, deps.team.id, "alex@x.com")) as Member;
	const gameId = await seedGame(deps);
	return { deps, sam, alex, gameId };
}
const file = (gameId: number) => ({ gameId, fileName: "IMG 4821.MOV", fileSize: 200 * 1024 * 1024, contentType: "video/quicktime" });

describe("upload service", () => {
	it("keeps a video until the end of its game's season's year, however late it's uploaded, and not past it", async () => {
		const { deps, sam } = await setup();
		const lastOfSeason = await seedGame(deps, { startsAt: "2027-09-24T18:40", opponent: "Last Game" });
		const late = { ...deps, now: () => new Date("2027-10-20T00:00:00Z") }; // the next season has started
		const { videoId } = await startUpload(late, sam, file(lastOfSeason));
		expect((await getVideo(deps.db, deps.team.id, videoId))?.deleteAfter).toBe("2027-12-31T13:00:00.000Z");
		// In 2028 its season's videos are gone: not offered, and an upload is refused.
		const next = { ...deps, now: () => new Date("2028-02-01T00:00:00Z") };
		const other = await seedGame(deps, { startsAt: "2027-05-07T18:40", opponent: "Old Game" });
		expect((await pickerGames(deps.db, deps.team, next.now())).map((r) => r.game.id)).not.toContain(other);
		await expect(startUpload(next, sam, file(other))).rejects.toThrow("season is over");
	});
	it("starts a multipart upload, signs parts and hands the finished file to Stream", async () => {
		const { deps, sam, gameId } = await setup();
		const started = await startUpload(deps, sam, file(gameId));
		expect(started).toMatchObject({ partSize: 16 * 1024 * 1024, totalParts: 13 });
		const [key] = [...deps.originals.created.keys()];
		expect(key).toMatch(/^originals\/b12.1-2026\/[0-9a-f-]{36}\/IMG_4821\.MOV$/);
		const urls = await partUrls(deps, sam, started.videoId, [1, 2]);
		expect(urls[2]).toContain("partNumber=2");
		expect(await completeUpload(deps, sam, started.videoId, [{ partNumber: 2, etag: '"b"' }, { partNumber: 1, etag: '"a"' }])).toBe("processing");
		expect(deps.originals.completed[0]?.parts).toEqual([{ partNumber: 1, etag: "a" }, { partNumber: 2, etag: "b" }]);
		expect(deps.stream.uploads[0]).toMatchObject({ uid: "uid-1", scheduledDeletion: "2027-12-31T13:00:00.000Z" });
		expect(deps.stream.uploads[0]?.url).toContain(key);
		expect(await getVideo(deps.db, deps.team.id, started.videoId)).toMatchObject({ status: "processing", streamUid: "uid-1", r2UploadId: null });
	});

	it("finishing again after R2 completed but the database didn't is fine (the file is already whole)", async () => {
		const { deps, sam, gameId } = await setup();
		const { videoId } = await startUpload(deps, sam, file(gameId));
		await deps.db.prepare("CREATE TRIGGER no_update BEFORE UPDATE ON videos BEGIN SELECT RAISE(ABORT, 'D1 busy'); END").run();
		await expect(completeUpload(deps, sam, videoId, [{ partNumber: 1, etag: "a" }])).rejects.toThrow("D1 busy");
		await deps.db.prepare("DROP TRIGGER no_update").run();
		expect(await completeUpload(deps, sam, videoId, [{ partNumber: 1, etag: "a" }])).toBe("processing");
		expect(deps.originals.completed).toHaveLength(1);
	});

	it("finishing again after it finished (the answer was lost on a weak signal) says it's saved, not an error", async () => {
		const { deps, sam, alex, gameId } = await setup();
		const { videoId } = await startUpload(deps, sam, file(gameId));
		expect(await completeUpload(deps, sam, videoId, [{ partNumber: 1, etag: "a" }])).toBe("processing");
		expect(await completeUpload(deps, sam, videoId, [{ partNumber: 1, etag: "a" }])).toBe("processing");
		expect(deps.originals.completed).toHaveLength(1);
		expect(deps.stream.uploads).toHaveLength(1);
		await expect(completeUpload(deps, alex, videoId, [{ partNumber: 1, etag: "a" }])).rejects.toMatchObject({ status: 403 });
	});

	it("signs only the parts the declared size needs", async () => {
		const { deps, sam, gameId } = await setup();
		const { videoId, totalParts } = await startUpload(deps, sam, file(gameId));
		expect(Object.keys(await partUrls(deps, sam, videoId, [totalParts]))).toEqual([String(totalParts)]);
		await expect(partUrls(deps, sam, videoId, [totalParts + 1])).rejects.toMatchObject({ status: 400 });
		await expect(completeUpload(deps, sam, videoId, [{ partNumber: totalParts + 1, etag: "x" }])).rejects.toMatchObject({ status: 400 });
	});

	it("queues the Stream copy if Stream is unavailable (the cron retries)", async () => {
		const { deps, sam, gameId } = await setup();
		const { videoId } = await startUpload(deps, sam, file(gameId));
		deps.stream.failNextUpload = true;
		expect(await completeUpload(deps, sam, videoId, [{ partNumber: 1, etag: "a" }])).toBe("queued");
		expect(await getVideo(deps.db, deps.team.id, videoId)).toMatchObject({ status: "processing", streamUid: null });
	});

	it("only lets the uploader (or an admin) continue, and only while uploading", async () => {
		const { deps, sam, alex, gameId } = await setup();
		const { videoId } = await startUpload(deps, sam, file(gameId));
		await expect(partUrls(deps, alex, videoId, [1])).rejects.toMatchObject({ status: 403 });
		await abortUpload(deps, sam, videoId);
		expect(deps.originals.aborted).toHaveLength(1);
		await expect(partUrls(deps, sam, videoId, [1])).rejects.toMatchObject({ status: 404 });
	});

	it("rejects uploads for unknown games", async () => {
		const { deps, sam } = await setup();
		await expect(startUpload(deps, sam, file(999))).rejects.toMatchObject({ status: 404 });
	});

	it("lets you restart your own unfinished upload for a game (replacing it)", async () => {
		const { deps, sam, gameId } = await setup();
		const first = await startUpload(deps, sam, file(gameId));
		const again = await startUpload(deps, sam, file(gameId));
		expect(again.videoId).not.toBe(first.videoId);
		expect(deps.originals.aborted).toHaveLength(1);
		expect(await getVideo(deps.db, deps.team.id, first.videoId)).toBeNull();
	});

	it("allows one video per game, replacing only a failed or abandoned attempt", async () => {
		const { deps, sam, alex, gameId } = await setup();
		const first = await startUpload(deps, sam, file(gameId));
		await expect(startUpload(deps, alex, file(gameId))).rejects.toMatchObject({ status: 409 });
		await deps.db.prepare("UPDATE videos SET created_at = '2026-10-13T00:00:00.000Z' WHERE id = ?").bind(first.videoId).run();
		const second = await startUpload(deps, alex, file(gameId));
		expect(deps.originals.aborted).toHaveLength(1);
		await deps.db.prepare("UPDATE videos SET status = 'failed', stream_uid = 'bad' WHERE id = ?").bind(second.videoId).run();
		const third = await startUpload(deps, sam, file(gameId));
		expect(deps.stream.deleted).toEqual(["bad"]);
		expect(await getVideo(deps.db, deps.team.id, third.videoId)).toMatchObject({ status: "uploading" });
	});
	it("keeps a practice game's video from before the season as long as its team's others", async () => {
		const { deps, sam } = await setup();
		const practice = await seedGame(deps, { startsAt: "2026-09-20T10:00", competition: "Practice match", opponent: "Practice" });
		const { videoId } = await startUpload(deps, sam, file(practice));
		expect((await getVideo(deps.db, deps.team.id, videoId))?.deleteAfter).toBe("2027-12-31T13:00:00.000Z");
	});
	it("moves a video to any of its team's games, a practice match before the season too: its deletion date is the team's", async () => {
		const { deps, gameId } = await setup();
		const videoId = await seedVideo(deps, { gameId, streamUid: "u1", deleteAfter: "2027-12-31T13:00:00.000Z" });
		const practice = await seedGame(deps, { startsAt: "2026-09-20T10:00", competition: "Practice match", opponent: "Practice" });
		expect(await moveTargets(deps.db, deps.team.id, (await requireGame(deps.db, deps.team.id, gameId)))).toContainEqual(expect.objectContaining({ id: practice }));
		await moveToGame(deps, videoId, practice);
		expect(await getVideo(deps.db, deps.team.id, videoId)).toMatchObject({ gameId: practice, deleteAfter: "2027-12-31T13:00:00.000Z" });
	});
});
