import { describe, expect, it } from "vitest";
import { getActiveVideoForGame, getVideo } from "../../../src/features/videos/videos-repository.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { aDayLater } from "../../helpers/purge.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

async function setup() {
	const deps = createTestDeps();
	await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'p@x.com', 'watcher')").bind(deps.team.id).run();
	const gameId = await seedGame(deps);
	const videoId = await seedVideo(deps, { gameId, streamUid: "u1", r2Key: "originals/a.mov", originalName: "IMG_1.MOV" });
	return { deps, gameId, videoId };
}

describe("game page", () => {
	it("plays the video with a signed token, with downloads and full screen", async () => {
		const { deps, gameId, videoId } = await setup();
		const page = await (await makeClient(deps, "p@x.com")(`/games/${gameId}`)).text();
		expect(page).toContain("https://customer-cust.cloudflarestream.com/tok-u1/iframe");
		expect(page).toContain(`title="Game video" data-resume="${videoId}"`);
		expect(page).toContain(`/tok-u1/iframe?poster=${encodeURIComponent("https://customer-cust.cloudflarestream.com/tok-u1/thumbnails/thumbnail.jpg?time=708s&height=360")}`);
		expect(page).not.toContain("original");
		expect(page).toContain("<li><b>HD video (MP4):</b> plays on any computer, phone or TV. Ready about 10 to 15 minutes after the game is ready to watch.</li>");
		expect(page).toContain("Or just watch it here in the browser: no download needed.");
		expect(page).not.toContain("outside the team");
		expect(page).toContain('id="fullscreen"');
		expect(page).toContain('src="/watch.js"');
		expect(page).not.toContain("Kept until");
		expect(page).not.toContain("Delete video");
	});
	it("explains when the video is still processing", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		const videoId = await seedVideo(deps, { gameId, status: "processing", streamUid: "u1" });
		const free = await seedGame(deps, { roundLabel: "10" });
		const client = makeClient(deps);
		const page = await (await client(`/games/${gameId}`)).text();
		// Since the upload finished (here, the video's own time, with nothing else recorded), usually ready 25 minutes on (real timings).
		expect(page).toMatch(/<span class="pstate"><i aria-hidden="true"><\/i>Processing<\/span><p>Processing since 2:00pm\. It&#39;s usually ready by about 2:25pm; this page checks by itself\.<\/p>/);
		expect(page).toContain('<meta http-equiv="refresh" content="60">');
		// Admin can delete it, but moving waits until it's ready.
		expect(page).toContain("Delete video");
		expect(page).not.toContain("Move video");
		expect((await client(`/videos/${videoId}/move`, form({ gameId: String(free) }))).status).toBe(409);
	});
	it("dates Processing from the stop that saved this video, or the upload that finished: never an earlier test stream's", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		const videoId = await seedVideo(deps, { gameId, status: "processing", streamUid: "u1" });
		const since = async () => /Processing since ([0-9:apm]+)\. It&#39;s usually ready by about ([0-9:apm]+)/.exec(await (await makeClient(deps)(`/games/${gameId}`)).text())?.slice(1);
		// A test stream at 1pm, under a minute and thrown away (no recording), then the video uploaded, finishing at 2:10pm.
		await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at, status, end_requested_at) VALUES (?, ?, 'in-1', 1, ?, 'cancelled', ?)")
			.bind(deps.team.id, gameId, "2026-10-14T01:59:00.000Z", "2026-10-14T02:00:00.000Z").run();
		await deps.db.prepare("INSERT INTO activity (team_id, kind, game_id, member_id, created_at) VALUES (?, 'upload_finished', ?, 1, ?)").bind(deps.team.id, gameId, "2026-10-14T03:10:00.000Z").run();
		expect(await since()).toEqual(["2:10pm", "2:35pm"]);
		// A stream whose recording is this video: since it was stopped.
		await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at, status, end_requested_at, recording_video_id) VALUES (?, ?, 'in-2', 1, ?, 'saved', ?, ?)")
			.bind(deps.team.id, gameId, "2026-10-14T03:15:00.000Z", "2026-10-14T03:20:00.000Z", videoId).run();
		expect(await since()).toEqual(["2:20pm", "2:45pm"]);
	});
	it("lets admins move (only to a game without video, any of the team's: sweep 3) and delete", async () => {
		const { deps, gameId, videoId } = await setup();
		const client = makeClient(deps);
		const taken = await seedGame(deps, { roundLabel: "8" });
		await seedVideo(deps, { gameId: taken, streamUid: "u8", r2Key: "originals/t.mov" });
		const free = await seedGame(deps, { roundLabel: "10" });
		const practice = await seedGame(deps, { startsAt: "2026-09-20T10:00", competition: "Practice match", roundLabel: "" });
		const noVideo = await seedGame(deps, { roundLabel: "11" });
		await deps.db.prepare("UPDATE games SET no_video_at = 'x' WHERE id = ?").bind(noVideo).run();
		const page = await (await client(`/games/${gameId}`)).text();
		for (const offered of [free, practice]) expect(page).toContain(`<option value="${offered}">`);
		for (const other of [taken, noVideo]) expect(page).not.toContain(`<option value="${other}">`);
		expect((await client(`/videos/${videoId}/move`, form({ gameId: String(noVideo) }))).status).toBe(409);
		expect((await client(`/videos/${videoId}/move`, form({ gameId: String(taken) }))).status).toBe(409);
		const moved = await client(`/videos/${videoId}/move`, form({ gameId: String(free) }));
		expect(moved.headers.get("Location")).toBe(`/games/${free}?done=moved`);
		await client(`/videos/${videoId}/delete`, form({ confirm: "yes" }));
		expect(await getVideo(deps.db, deps.team.id, videoId)).toBeNull();
		expect(deps.stream.deleted).toEqual([]);
		await aDayLater(deps);
		expect(deps.stream.deleted).toEqual(["u1"]);
		expect((await makeClient(deps, "p@x.com")(`/videos/${videoId}/delete`, form({ confirm: "yes" }))).status).toBe(403);
	});
	it("moves a video onto a game whose upload failed, clearing the failed one out of the way so the game shows the moved one", async () => {
		const { deps, videoId } = await setup();
		const target = await seedGame(deps, { roundLabel: "10" });
		const failed = await seedVideo(deps, { gameId: target, status: "failed", r2Key: "originals/bad.mov" });
		const moved = await makeClient(deps)(`/videos/${videoId}/move`, form({ gameId: String(target) }));
		expect(moved.headers.get("Location")).toBe(`/games/${target}?done=moved`);
		expect(await getActiveVideoForGame(deps.db, deps.team.id, target)).toMatchObject({ id: videoId, status: "ready" });
		expect(await deps.db.prepare("SELECT deleted_reason FROM videos WHERE id = ?").bind(failed).first("deleted_reason")).toBe("replaced");
	});
});
