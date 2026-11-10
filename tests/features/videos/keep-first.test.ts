import { describe, expect, it } from "vitest";
import { insertSegment, listSegments, segmentKey } from "../../../src/features/live/recording-segments-repository.ts";
import { deleteVideo } from "../../../src/features/videos/video-removal-service.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

async function failedJoin() {
	const deps = createTestDeps();
	const gameId = await seedGame(deps, { startsAt: "2026-10-14T18:40" });
	const key = "originals/b12.1-2026/att/live-2026-10-14.mp4";
	const videoId = await seedVideo(deps, { gameId, status: "processing", r2Key: key });
	deps.originals.completed.push({ key, parts: [] }, { key: segmentKey(key, 2), parts: [] });
	await insertSegment(deps.db, { teamId: deps.team.id, videoId, n: 2, r2Key: segmentKey(key, 2), r2UploadId: "up-2", nowIso: "2026-10-14T20:00:00.000Z" });
	await deps.db.prepare("UPDATE recording_segments SET r2_upload_id = NULL, completed_at = 'x' WHERE video_id = ?").bind(videoId).run();
	await deps.db.prepare("UPDATE videos SET join_tries = 6, join_failed_at = '2026-10-15T00:00:00.000Z' WHERE id = ?").bind(videoId).run();
	await deps.db.prepare("INSERT INTO platform_alerts (kind, level, detail, checked_at) VALUES ('joiner', 'urgent', 'x', 'now')").run();
	return { deps, gameId, videoId, key };
}

describe("Keep the first part", () => {
	it("the game page tells the team manager the parts couldn't be joined and offers to keep the first; nobody else sees it", async () => {
		const { deps, gameId } = await failedJoin();
		const page = await (await makeClient(deps)(`/games/${gameId}`)).text();
		expect(page).toContain("couldn't be joined");
		expect(page).toContain("Keep the first part");
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'sam@x.com', 'filmer')").bind(deps.team.id).run();
		expect(await (await makeClient(deps, "sam@x.com")(`/games/${gameId}`)).text()).not.toContain("Keep the first part");
	});
	it("keeps segment 1 as the game video, deletes the rest, asks Stream for the copy, logs it and clears the alert", async () => {
		const { deps, gameId, videoId, key } = await failedJoin();
		const res = await makeClient(deps)(`/videos/${videoId}/keep-first`, form({ confirm: "yes" }));
		expect(res.status).toBe(303);
		expect(res.headers.get("Location")).toBe(`/games/${gameId}?done=kept`);
		expect(await getVideo(deps.db, deps.team.id, videoId)).toMatchObject({ r2Key: key, status: "processing", streamUid: "uid-1", joinFailedAt: null, joinTries: 0 });
		expect(await listSegments(deps.db, deps.team.id, videoId)).toEqual([]);
		expect(deps.originals.removed).toEqual([segmentKey(key, 2)]);
		expect(await deps.db.prepare("SELECT action FROM admin_log WHERE action = 'first_part_kept'").first()).toBeTruthy();
		expect(await deps.db.prepare("SELECT level FROM platform_alerts WHERE kind = 'joiner'").first("level")).toBe("ok");
		expect(await (await makeClient(deps)(`/games/${gameId}?done=kept`)).text()).toContain("The first part was kept");
	});
	it("deleting the video instead deals with it too: the alert is cleared, and a video that joined fine leaves it alone", async () => {
		const { deps, videoId } = await failedJoin();
		const other = await seedVideo(deps, { gameId: await seedGame(deps, { startsAt: "2026-10-16T18:40" }), status: "ready" });
		await deleteVideo(deps, (await getVideo(deps.db, deps.team.id, other))!, "admin");
		expect(await deps.db.prepare("SELECT level FROM platform_alerts WHERE kind = 'joiner'").first("level")).toBe("urgent");
		await deleteVideo(deps, (await getVideo(deps.db, deps.team.id, videoId))!, "admin");
		expect(await deps.db.prepare("SELECT level, detail FROM platform_alerts WHERE kind = 'joiner'").first()).toMatchObject({ level: "ok", detail: expect.stringContaining("deleted") });
	});
	it("refuses while the join hasn't given up", async () => {
		const { deps, videoId } = await failedJoin();
		await deps.db.prepare("UPDATE videos SET join_failed_at = NULL WHERE id = ?").bind(videoId).run();
		expect((await makeClient(deps)(`/videos/${videoId}/keep-first`, form({ confirm: "yes" }))).status).toBe(409);
	});
});
