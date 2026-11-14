import { describe, expect, it } from "vitest";
import { type Member } from "../../../src/features/members/members-repository.ts";
import { findActiveMemberByEmail } from "../../helpers/members.ts";
import { startUpload } from "../../../src/features/videos/upload-service.ts";
import { getActiveVideoForGame, getVideo } from "../../../src/features/videos/videos-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { form, jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

const file = (gameId: number) => ({ gameId, fileName: "game.mov", fileSize: 100 * 1024 * 1024, contentType: "video/quicktime" });

describe("two parents uploading the same game at the same moment", () => {
	it("one upload goes ahead; the other is told it's already being uploaded, and leaves nothing open in R2", async () => {
		const deps = createTestDeps();
		const team = deps.team.id;
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'sam@x.com', 'filmer'), (?, 'alex@x.com', 'filmer')").bind(team, team).run();
		const sam = (await findActiveMemberByEmail(deps.db, team, "sam@x.com")) as Member;
		const alex = (await findActiveMemberByEmail(deps.db, team, "alex@x.com")) as Member;
		const gameId = await seedGame(deps);
		const results = await Promise.allSettled([startUpload(deps, sam, file(gameId)), startUpload(deps, alex, file(gameId))]);
		expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
		const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
		expect(refused.reason).toMatchObject({ status: 409, message: "This game's video is already being uploaded." });
		expect(deps.originals.created.size - deps.originals.aborted.length).toBe(1);
	});
});

describe("Stream not saying how long a video is", () => {
	it("a live recording that's ready but has no length yet is kept (not taken for a test), and clips still work", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		const client = makeClient(deps);
		const { data } = (await (await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }))).json()) as { data: { videoId: number } };
		await client(`/api/uploads/${data.videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }] }));
		const uid = (await getVideo(deps.db, deps.team.id, data.videoId))!.streamUid!;
		deps.stream.videos.set(uid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: -1 });
		await runSync(deps);
		expect(await getActiveVideoForGame(deps.db, deps.team.id, gameId)).toMatchObject({ id: data.videoId, status: "ready", durationSeconds: null });
		expect((await client(`/videos/${data.videoId}/clips`, form({ start: "10:00", end: "10:20" }))).headers.get("Location")).toBe(`/games/${gameId}?done=clip`);
	});
});

describe("downloading a video whose Stream copy has gone", () => {
	it("says so plainly instead of an error page", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		const videoId = await seedVideo(deps, { gameId, streamUid: "gone" });
		deps.stream.videos.delete("gone"); // deleted at Stream by hand, say
		const res = await makeClient(deps)(`/videos/${videoId}/download/hd`);
		expect(res.status).toBe(502);
		expect(await res.text()).toContain("Stream couldn&#39;t prepare the HD copy");
	});
});

describe("Stream refusing the HD copy request as a video or clip becomes ready", () => {
	it("the run doesn't fail, the video is ready, and the next run asks again", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), status: "processing", streamUid: "u1" });
		deps.stream.videos.set("u1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 2400 });
		deps.stream.downloadRequestFails.add("u1");
		const warned: string[] = [];
		const warn = console.warn;
		console.warn = (line: string) => void warned.push(line);
		try {
			expect(await runSync(deps)).toMatchObject({ ready: 1 });
		} finally {
			console.warn = warn;
		}
		expect(await getVideo(deps.db, deps.team.id, id)).toMatchObject({ status: "ready", hdReadyAt: null });
		expect(warned.map((l) => JSON.parse(l))).toContainEqual(expect.objectContaining({ event: "hd_request_failed", videoId: id }));
		expect(deps.stream.downloads.has("u1")).toBe(false);
		deps.stream.downloadRequestFails.clear();
		await runSync(deps);
		expect(deps.stream.downloads.get("u1")).toBe("inprogress");
	});
	it("a clip is ready all the same", async () => {
		const deps = createTestDeps();
		const videoId = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "u1" });
		await makeClient(deps)(`/videos/${videoId}/clips`, form({ start: "1:00", end: "1:20" }));
		deps.stream.videos.set("clip-1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 20 });
		deps.stream.downloadRequestFails.add("clip-1");
		const warn = console.warn;
		console.warn = () => {};
		try {
			expect(await runSync(deps)).toMatchObject({ clipsReady: 1 });
		} finally {
			console.warn = warn;
		}
		expect(await deps.db.prepare("SELECT status FROM clips").first<string>("status")).toBe("ready");
	});
});

describe("a Stream copy that has gone while the 5-minute runs still wait on it", () => {
	const video = (deps: ReturnType<typeof createTestDeps>, id: number) => getVideo(deps.db, deps.team.id, id);
	it("a processing video gets a new copy from its original, and the runs don't fail", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), status: "processing", streamUid: "gone", r2Key: "originals/a.mov" });
		await runSync(deps);
		expect(await video(deps, id)).toMatchObject({ status: "processing", streamUid: null });
		await runSync(deps);
		expect(await video(deps, id)).toMatchObject({ status: "processing", streamUid: "uid-1" });
		expect(deps.stream.uploads[0]?.url).toContain("originals/a.mov");
	});
	it("a ready video still waiting for its HD copy goes back to processing for a new one", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "gone", r2Key: "originals/a.mov" });
		deps.stream.videos.delete("gone");
		await runSync(deps);
		expect(await video(deps, id)).toMatchObject({ status: "processing", streamUid: null });
	});
	it("with no original to copy from, it fails plainly, so the game can be uploaded again", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), status: "processing", streamUid: "gone" });
		await runSync(deps);
		expect(await video(deps, id)).toMatchObject({ status: "failed", failureReason: expect.stringContaining("no longer has this video") });
	});
	it("a clip fails, so it can be made again", async () => {
		const deps = createTestDeps();
		const videoId = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "u1" });
		await makeClient(deps)(`/videos/${videoId}/clips`, form({ start: "1:00", end: "1:20" }));
		deps.stream.videos.delete("clip-1");
		await runSync(deps);
		expect(await deps.db.prepare("SELECT status, failure_reason AS reason FROM clips").first())
			.toEqual({ status: "failed", reason: expect.stringContaining("no longer has this clip") });
	});
});
