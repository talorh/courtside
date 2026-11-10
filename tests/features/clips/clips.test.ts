import { describe, expect, it } from "vitest";
import { getClip, listClipsForVideo } from "../../../src/features/clips/clips-repository.ts";
import { parseClock } from "../../../src/features/clips/clips-service.ts";
import { deleteVideo } from "../../../src/features/videos/video-removal-service.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { aDayLater } from "../../helpers/purge.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

async function setup() {
	const deps = createTestDeps();
	for (const [email, role] of [["coach@x.com", "coach"], ["p@x.com", "watcher"]]) {
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)").bind(deps.team.id, email, role, role).run();
	}
	const gameId = await seedGame(deps);
	const videoId = await seedVideo(deps, { gameId, streamUid: "u1", r2Key: "originals/a.mov" });
	return { deps, gameId, videoId, coach: makeClient(deps, "coach@x.com"), watcher: makeClient(deps, "p@x.com") };
}

describe("parseClock", () => {
	it("reads m:ss, h:mm:ss and plain seconds", () => {
		expect(parseClock("12:34", "Start")).toBe(754);
		expect(parseClock("1:02:03", "Start")).toBe(3723);
		expect(parseClock(" 75 ", "Start")).toBe(75);
	});
	it("rejects junk", () => {
		for (const bad of ["", "1:2:3:4", "ab", "1:75", "1:60:00", "-5"]) expect(() => parseClock(bad, "Start")).toThrow();
	});
});

describe("highlight clips", () => {
	it("a coach makes a clip; Stream gets the range and the video's deletion date", async () => {
		const { deps, gameId, videoId, coach } = await setup();
		const res = await coach(`/videos/${videoId}/clips`, form({ start: "10:00", end: "10:15", label: "Q4 Saints put the game out of reach" }));
		expect(res.status).toBe(303);
		expect(res.headers.get("Location")).toBe(`/games/${gameId}?done=clip`);
		expect(deps.clipper.requests).toEqual([{ sourceUid: "u1", startSeconds: 600, endSeconds: 615, name: "Q4 Saints put the game out of reach", teamId: deps.team.id, scheduledDeletion: "2028-10-14T00:00:00.000Z" }]);
		expect(await listClipsForVideo(deps.db, deps.team.id, videoId)).toMatchObject([{ status: "processing", streamUid: "clip-1", startSeconds: 600, endSeconds: 615 }]);
	});
	it("says how to save a clip to Photos only once there's a clip (the note read oddly above \"No clips yet\")", async () => {
		const { gameId, videoId, coach, watcher } = await setup();
		const before = await (await watcher(`/games/${gameId}`)).text();
		expect(before).toContain("No clips yet.");
		expect(before).not.toContain("data-save-clip-hint");
		await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:25", label: "Fast break" }));
		expect(await (await watcher(`/games/${gameId}`)).text()).toContain('<p class="small" data-save-clip-hint hidden></p>');
	});
	it("names an unlabelled clip by its start time", async () => {
		const { deps, videoId, coach } = await setup();
		await coach(`/videos/${videoId}/clips`, form({ start: "1:05", end: "1:20", label: " " }));
		expect(deps.clipper.requests[0]?.name).toBe("Highlight at 1:05");
	});
	it("checks the times", async () => {
		const { videoId, coach } = await setup();
		const post = (start: string, end: string) => coach(`/videos/${videoId}/clips`, form({ start, end, label: "" }));
		expect((await post("1:00", "0:50")).status).toBe(400);
		expect((await post("1:00", "1:02")).status).toBe(400);
		expect((await post("1:00", "6:01")).status).toBe(400);
		expect((await post("47:00", "47:20")).status).toBe(400); // video is 47:10 long
	});
	it("parents can't delete someone else's clip, but can download ready ones", async () => {
		const { deps, videoId, coach, watcher } = await setup();
		await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20", label: "Steal" }));
		expect((await watcher("/clips/1/delete", form({ confirm: "yes" }))).status).toBe(403);
		expect((await watcher("/clips/1/download")).status).toBe(409);
		deps.stream.videos.set("clip-1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 10 });
		expect(await runSync(deps)).toMatchObject({ clipsReady: 1 });
		expect(deps.stream.downloads.get("clip-1")).toBe("inprogress");
		expect((await watcher("/clips/1/download")).status).toBe(409);
		deps.stream.downloads.set("clip-1", "ready");
		const dl = await watcher("/clips/1/download");
		expect(dl.status).toBe(302);
		expect(dl.headers.get("Location")).toBe(
			"https://customer-cust.cloudflarestream.com/tok-clip-1-dl/downloads/default.mp4?filename=saints-b12-1-2026-10-11-round-9-vs-lakeside-rockets-clip-steal.mp4");
		// The same link as JSON, for an iPhone's Save; and what a phone is told while it's being made.
		expect(await (await watcher("/api/clips/1/download")).json()).toEqual({ ok: true, data: {
			url: "https://customer-cust.cloudflarestream.com/tok-clip-1-dl/downloads/default.mp4?filename=saints-b12-1-2026-10-11-round-9-vs-lakeside-rockets-clip-steal.mp4",
			name: "saints-b12-1-2026-10-11-round-9-vs-lakeside-rockets-clip-steal.mp4",
		} });
		deps.stream.downloads.set("clip-1", "inprogress");
		expect(await (await watcher("/api/clips/1/download")).json()).toMatchObject({ ok: false, error: { code: "conflict" } });
	});
	it("says so when Stream can't make the clip, and saves nothing", async () => {
		const { deps, videoId, coach } = await setup();
		deps.clipper.failNext = "stream unavailable";
		const res = await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20" }));
		expect(res.status).toBe(502);
		expect(await res.text()).toContain("Couldn&#39;t make the clip.");
		expect(await listClipsForVideo(deps.db, deps.team.id, videoId)).toEqual([]);
	});
	it("explains when Stream storage is full", async () => {
		const { deps, videoId, coach } = await setup();
		deps.clipper.failNext = "Stream clip failed (400): Storage capacity exceeded: You have exceeded your allocated storage quota.";
		const res = await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20" }));
		expect(res.status).toBe(503);
		expect(await res.text()).toContain("Video storage is full, so clips can&#39;t be made right now.");
	});
	it("marks a clip failed when Stream errors", async () => {
		const { deps, videoId, coach } = await setup();
		await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20" }));
		deps.stream.videos.set("clip-1", { readyToStream: false, state: "error", errorReason: "bad", durationSeconds: -1 });
		expect(await runSync(deps)).toMatchObject({ clipsFailed: 1 });
		expect((await getClip(deps.db, deps.team.id, 1))?.status).toBe("failed");
	});
	it("only a team manager deletes a clip (Stream copy too): not even the coach who made it", async () => {
		const { deps, gameId, videoId, coach } = await setup();
		await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20" }));
		expect((await coach("/clips/1/delete", form({ confirm: "yes" }))).status).toBe(403);
		const res = await makeClient(deps)("/clips/1/delete", form({ confirm: "yes" }));
		expect(res.headers.get("Location")).toBe(`/games/${gameId}?done=clipdeleted`);
		expect(deps.stream.deleted).toEqual(["clip-1"]);
		expect(await getClip(deps.db, deps.team.id, 1)).toBeNull();
	});
	it("deleting the video deletes its clips", async () => {
		const { deps, videoId, coach } = await setup();
		await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20" }));
		await deleteVideo(deps, (await getVideo(deps.db, deps.team.id, videoId))!, "admin");
		expect(deps.stream.deleted).toEqual([]);
		await aDayLater(deps);
		expect(deps.stream.deleted).toEqual(["clip-1", "u1"]);
		expect(await listClipsForVideo(deps.db, deps.team.id, videoId)).toEqual([]);
	});
	it("a deleted video's clips can't be watched or downloaded during the day its files are kept", async () => {
		const { deps, gameId, videoId, coach, watcher } = await setup();
		await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20" }));
		deps.stream.videos.set("clip-1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 10 });
		await runSync(deps);
		deps.stream.downloads.set("clip-1", "ready");
		expect((await watcher("/clips/1/download")).status).toBe(302);
		await deleteVideo(deps, (await getVideo(deps.db, deps.team.id, videoId))!, "admin");
		expect((await watcher("/clips/1/download")).status).toBe(404);
		expect((await watcher(`/games/${gameId}?clip=1`)).status).toBe(200);
		expect(await (await watcher(`/games/${gameId}?clip=1`)).text()).not.toContain("tok-clip-1");
	});
	it("if saving the clip fails, the clip Stream made is deleted too", async () => {
		const { deps, videoId, coach } = await setup();
		await deps.db.prepare("CREATE TRIGGER no_clips BEFORE INSERT ON clips BEGIN SELECT RAISE(ABORT, 'disk full'); END").run();
		expect((await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20" }))).status).toBe(500);
		expect(deps.stream.deleted).toEqual(["clip-1"]);
	});
});

describe("clips on the game page", () => {
	it("everyone sees every clip and the clip maker; only a team manager gets Delete, everyone else Ask to remove", async () => {
		const { deps, gameId, videoId, coach, watcher } = await setup();
		await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:25", label: "Fast break" }));
		await coach(`/videos/${videoId}/clips`, form({ start: "5:00", end: "5:10", label: "Block" }));
		deps.stream.videos.set("clip-1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 15 });
		await runSync(deps);
		const page = await (await watcher(`/games/${gameId}`)).text();
		expect(page).toContain("<b>Fast break</b><span class=\"small\">0:10 · 0:15 long</span>");
		expect(page).toContain(`href="/games/${gameId}?clip=1">Watch</a>`);
		expect(page).toContain('href="/clips/1/download" data-save-clip="1">Download <span>MP4</span></a>');
		expect(page).toContain('<p class="small" data-save-clip-hint hidden></p>');
		// The whole game's HD video: marked for an iPhone's Save, which explains where it goes.
		expect(page).toContain('<a class="btn primary" href="/videos/1/download/hd" data-save-game="1">Download HD video <span>MP4</span></a>');
		expect(page).toContain('<p class="small" data-save-game-hint hidden></p>');
		expect(page).toContain('<script type="module" src="/video-save.js"></script>');
		expect(page).toContain('<img src="https://customer-cust.cloudflarestream.com/tok-clip-1/thumbnails/thumbnail.jpg?time=1s&amp;height=360"');
		// Still being made: shows the game frame where it starts.
		expect(page).toContain("<b>Block</b>");
		expect(page).toContain("/tok-u1/thumbnails/thumbnail.jpg?time=301s");
		expect(page).toContain("Getting ready…");
		expect(page).toContain("Make a highlight clip");
		expect(page).not.toContain("/clips/1/delete");
		expect(page).toContain('action="/clips/1/removal-requests"');
		const coachPage = await (await coach(`/games/${gameId}`)).text();
		expect(coachPage).toContain("Make a highlight clip");
		expect(coachPage).toContain(`action="/videos/${videoId}/clips"`);
		expect(coachPage).toContain('data-mark="clip-start" hidden>Mark start</button>');
		// The coach made it: they can change who's in it and ask for it to go, but not delete it.
		expect(coachPage).toContain('action="/clips/1/players"');
		expect(coachPage).not.toContain('action="/clips/1/delete"');
		expect(coachPage).toContain('action="/clips/1/removal-requests"');
		const adminPage = await (await makeClient(deps)(`/games/${gameId}`)).text();
		expect(adminPage).toContain('action="/clips/1/delete"');
		expect(adminPage).not.toContain('action="/clips/1/removal-requests"');
	});
	it("plays a ready clip in the main player with a way back", async () => {
		const { deps, gameId, videoId, coach, watcher } = await setup();
		await coach(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:25", label: "Fast break" }));
		deps.stream.videos.set("clip-1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 15 });
		await runSync(deps);
		const page = await (await watcher(`/games/${gameId}?clip=1`)).text();
		expect(page).toContain('src="https://customer-cust.cloudflarestream.com/tok-clip-1/iframe?poster=');
		expect(page).toContain("<h1>Fast break</h1>");
		expect(page).not.toContain("data-resume");
		expect(page).toContain(`<a class="btn" href="/games/${gameId}">← Back to full game</a>`);
		expect(page).toContain('<li class="clip" aria-current="true">');
		const ignored = await (await watcher(`/games/${gameId}?clip=99`)).text();
		expect(ignored).toContain("/tok-u1/iframe");
	});
});
