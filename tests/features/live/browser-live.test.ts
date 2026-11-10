import { describe, expect, it } from "vitest";
import { LIVE_PART_SIZE } from "../../../src/features/live/browser-live-service.ts";
import { getActiveVideoForGame } from "../../../src/features/videos/videos-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { addMember } from "../../helpers/two-teams.ts";

const json = async (res: Response): Promise<any> => res.json();

const ANDROID = { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/130 Mobile" } };

// Test clock is 2026-10-15T00:00Z = 11am Thursday 15 Oct in the club's time zone; the game is tonight.
async function filming() {
	let now = new Date("2026-10-15T00:00:00Z");
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	const later = (seconds: number) => { now = new Date(now.getTime() + seconds * 1000); };
	const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40", opponent: "Northside 2" });
	const client = makeClient(deps);
	await client("/live", ANDROID);
	const res = await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4;codecs=avc1,mp4a.40.2" }));
	const start = (await json(res)).data as { videoId: number; partSize: number; whipUrl: string };
	const row = () => deps.db.prepare("SELECT status, recording_video_id, last_live_at FROM live_streams").first<{ status: string; recording_video_id: number | null; last_live_at: string | null }>();
	return { deps, gameId, client, res, start, row, later };
}

describe("Go live from the browser", () => {
	it("a practice game before the season starts keeps its video as long as its team's others", async () => {
		const deps = createTestDeps(new Date("2026-09-20T00:00:00Z"));
		const gameId = await seedGame(deps, { startsAt: "2026-09-20T18:40", competition: "Practice match", opponent: "Practice" });
		const res = await makeClient(deps)(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }));
		expect(res.status).toBe(201);
		expect((await getActiveVideoForGame(deps.db, deps.team.id, gameId))?.deleteAfter).toBe("2027-12-31T13:00:00.000Z");
	});

	it("starts the live stream and a recording upload that will be the game video", async () => {
		const { deps, gameId, res, start, row } = await filming();
		expect(res.status).toBe(201);
		expect(start).toEqual({ videoId: start.videoId, partSize: LIVE_PART_SIZE, whipUrl: "https://customer-dev.cloudflarestream.com/whip-live-1/webRTC/publish" });
		expect(await getActiveVideoForGame(deps.db, deps.team.id, gameId)).toMatchObject({ id: start.videoId, status: "uploading", originalName: "Live 2026-10-15.mp4" });
		expect([...deps.originals.created.keys()][0]).toMatch(/^originals\/.+\/live-2026-10-15\.mp4$/);
		expect(await row()).toMatchObject({ status: "open", recording_video_id: start.videoId });
	});

	it("a database hiccup as Go live starts leaves nothing half done: no recording, its R2 upload closed, the next tap works", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		const client = makeClient(deps);
		const db = deps.db;
		// Linking the recording to the stream fails (D1 lost the connection part way through).
		const fail = async () => { throw new Error("D1_ERROR: Network connection lost."); };
		const linkFails = {
			prepare: (sql: string) => (/UPDATE live_streams SET recording_video_id/.test(sql) ? { bind: () => ({ run: fail, first: fail, all: fail }) } : db.prepare(sql)),
			batch: (statements: D1PreparedStatement[]) => db.batch(statements),
		} as unknown as D1Database;
		(deps as { db: D1Database }).db = linkFails;
		expect((await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }))).status).toBe(500);
		(deps as { db: D1Database }).db = db;
		expect(await getActiveVideoForGame(db, deps.team.id, gameId)).toBeNull();
		expect(deps.originals.aborted).toHaveLength(1);
		const again = await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }));
		expect(again.status).toBe(201);
		const { videoId } = (await json(again)).data;
		expect(await db.prepare("SELECT recording_video_id FROM live_streams WHERE status = 'open'").first("recording_video_id")).toBe(videoId);
	});

	it("one phone at a time: a second start is refused", async () => {
		const { gameId, client } = await filming();
		const again = await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/webm" }));
		expect(again.status).toBe(409);
		expect((await json(again)).error.message).toBe("This game is already being filmed from another phone or tab.");
	});

	it("a game whose video is already being uploaded can't go live, and no R2 upload is left open", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		await seedVideo(deps, { gameId, status: "uploading", r2Key: "originals/up.mov", r2UploadId: "up-x" });
		const res = await makeClient(deps)(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }));
		expect(res.status).toBe(409);
		expect(deps.originals.created.size).toBe(0);
	});

	it("a game whose only video failed can go live: the failed one is cleared out of the way, as an upload does", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		const failed = await seedVideo(deps, { gameId, status: "failed", r2Key: "originals/bad.mov" });
		const client = makeClient(deps);
		expect(await (await client("/live", ANDROID)).text()).toContain(`<option value="${gameId}" selected>`);
		const res = await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }));
		expect(res.status).toBe(201);
		expect(await getActiveVideoForGame(deps.db, deps.team.id, gameId)).toMatchObject({ id: (await json(res)).data.videoId, status: "uploading" });
		expect(await deps.db.prepare("SELECT deleted_reason FROM videos WHERE id = ?").bind(failed).first("deleted_reason")).toBe("replaced");
	});

	it("reloading Go live keeps the game (with its recording to save) and offers no other End game form", async () => {
		const { deps, gameId, client, start } = await filming();
		deps.live.connected.add("live-1");
		const page = await (await client("/live", ANDROID)).text();
		expect(page).toContain(`<option value="${gameId}" selected>`);
		expect(page).toContain(`data-recording="${start.videoId}"`);
		expect(page).not.toContain(`action="/live/${gameId}/end"`);
	});

	it("the game page plays it over WebRTC with a signed token, and offers no other End game form", async () => {
		const { deps, gameId, client } = await filming();
		deps.live.connected.add("live-1");
		const res = await client(`/games/${gameId}`);
		const page = await res.text();
		expect(page).toContain('<video data-live-player data-whep="https://customer-cust.cloudflarestream.com/tok-live-1/webRTC/play"');
		expect(page).not.toContain("whep-live-1");
		expect(page).toContain('<script type="module" src="/whep.js"></script>');
		expect(page).toContain("About a second behind the court.");
		expect(page).toContain("data-unmute hidden>Turn the sound on</button>");
		expect(page).not.toContain("<iframe");
		expect(page).not.toContain(`action="/live/${gameId}/end"`);
		expect(res.headers.get("Content-Security-Policy")).toContain("connect-src 'self' https://acct.r2.cloudflarestorage.com https://customer-cust.cloudflarestream.com");
		expect(res.headers.get("Permissions-Policy")).toContain("camera=(self), microphone=(self)");
	});

	it("families watching live aren't cut off: the live page never reloads itself, but once End game is tapped it does", async () => {
		const { deps, gameId, client, later } = await filming();
		deps.live.connected.add("live-1");
		const live = await (await client(`/games/${gameId}`)).text();
		expect(live).toContain("data-whep=");
		expect(live).not.toContain('http-equiv="refresh"');
		later(40 * 60);
		await client(`/api/live/${gameId}/end`, jsonBody({}));
		const ended = await (await client(`/games/${gameId}`)).text();
		expect(ended).not.toContain("data-whep=");
		expect(ended).toContain('<meta http-equiv="refresh" content="60">');
		// The Full time card, in the Game break card's look: court lines, the Saints head, then the words.
		expect(ended).toMatch(/<div class="player"><div class="live-over" role="status"><svg class="court"[^]*?<\/svg><span class="over-title">Full time<\/span><img src="\/club-mark.webp" alt=""><b>The live stream has ended<\/b><span class="over-note">It's being saved and will be ready to watch here in about 20 to 25 minutes.<\/span><\/div><\/div>/);
	});

	it("the cron notes it's live", async () => {
		const { deps, row } = await filming();
		deps.live.connected.add("live-1");
		await runSync(deps);
		expect((await row())?.last_live_at).not.toBeNull();
		expect((await row())?.status).toBe("open");
	});

	it("credits the parent streaming, not whoever first opened Go live for the game (29 Oct test: Dion streamed, it said Sam went live)", async () => {
		const deps = createTestDeps(new Date("2026-10-15T00:00:00Z"));
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		// Sam opens Go live first (which sets up the game's stream), then Dion films it from their phone.
		await makeClient(deps)("/live", ANDROID);
		const dion = await addMember(deps.db, deps.team.id, "dion@x.com", "filmer", "Dion");
		const client = makeClient(deps, "dion@x.com");
		await client("/live", ANDROID);
		const start = (await json(await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" })))).data as { videoId: number };
		deps.live.connected.add("live-1");
		await runSync(deps);
		await client(`/api/uploads/${start.videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }] }));
		const { results } = await deps.db.prepare("SELECT kind, member_id FROM activity ORDER BY id").all<{ kind: string; member_id: number }>();
		expect(results).toEqual([{ kind: "live_started", member_id: dion }, { kind: "upload_finished", member_id: dion }, { kind: "live_saved", member_id: dion }]);
		expect(await deps.db.prepare("SELECT started_by FROM live_streams").first("started_by")).toBe(dion);
	});

	it("End game completes the upload: the game video is on its way and the live stream closes as saved", async () => {
		const { deps, gameId, client, start, row } = await filming();
		const done = await client(`/api/uploads/${start.videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }, { partNumber: 2, etag: "b" }] }));
		expect((await json(done)).data).toEqual({ status: "processing" });
		expect(await getActiveVideoForGame(deps.db, deps.team.id, gameId)).toMatchObject({ id: start.videoId, status: "processing" });
		expect(await row()).toMatchObject({ status: "saved" });
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(false);
	});

	it("Delete it and start again: the recording goes, and a new one can start straight away", async () => {
		const { gameId, client, start, row } = await filming();
		await client(`/api/uploads/${start.videoId}/abort`, jsonBody({}));
		const again = await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/webm" }));
		expect(again.status).toBe(201);
		expect((await row())?.recording_video_id).toBe((await json(again)).data.videoId);
		// Left deleted and never restarted, the cron closes it.
		const other = await filming();
		await other.client(`/api/uploads/${other.start.videoId}/abort`, jsonBody({}));
		await runSync(other.deps);
		expect(await other.row()).toMatchObject({ status: "cancelled" });
	});

	it("after it was live and its recording was deleted to start again, Go live is ready to start afresh", async () => {
		const { deps, gameId, client, start } = await filming();
		deps.live.connected.add("live-1");
		await runSync(deps);
		deps.live.connected.delete("live-1");
		await client(`/api/uploads/${start.videoId}/abort`, jsonBody({}));
		const page = await (await client("/live", ANDROID)).text();
		expect(page).toContain(`data-game="${gameId}" data-recording=""`);
	});

	it("only the parent streaming, a coach or a team manager can end it", async () => {
		const { deps, gameId, later } = await filming();
		later(40 * 60);
		for (const [email, role] of [["f2@x.com", "filmer"], ["c@x.com", "coach"]]) {
			await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, ?, ?)").bind(deps.team.id, email, role).run();
		}
		expect((await makeClient(deps, "f2@x.com")(`/api/live/${gameId}/end`, jsonBody({}))).status).toBe(403);
		expect((await json(await makeClient(deps, "c@x.com")(`/api/live/${gameId}/end`, jsonBody({})))).data).toEqual({ status: "ended" });
	});

	it("End game is final: nothing can stream to the game again, but the recording can still be saved", async () => {
		const { deps, gameId, client, start, later } = await filming();
		later(40 * 60);
		expect((await json(await client(`/api/live/${gameId}/end`, jsonBody({})))).data).toEqual({ status: "ended" });
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(false);
		const again = await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/webm" }));
		expect(again.status).toBe(409);
		expect((await json(again)).error.message).toBe("This game has been ended. It's being saved as the game video.");
		// Reloading Go live still shows the game, to finish saving, marked ended (no Delete and start again).
		const page = await (await client("/live", ANDROID)).text();
		expect(page).toContain(`data-recording="${start.videoId}" data-ended="1"`);
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(false);
		await client(`/api/uploads/${start.videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }] }));
		expect(await (await client("/live", ANDROID)).text()).not.toContain(`<option value="${gameId}"`);
	});

	it("End game under a minute after Go live: a test, thrown away before it's uploaded or processed", async () => {
		const { deps, gameId, client, row, later } = await filming();
		later(20);
		expect((await json(await client(`/api/live/${gameId}/end`, jsonBody({})))).data).toEqual({ status: "test", seconds: 20 });
		expect(await getActiveVideoForGame(deps.db, deps.team.id, gameId)).toBeNull();
		expect(deps.originals.aborted).toEqual([...deps.originals.created.keys()]);
		expect(deps.stream.uploads).toEqual([]);
		expect(await row()).toMatchObject({ status: "cancelled" });
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(false);
		// No notification for a test; the game page and Go live say why, and the game streams again straight away.
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM activity").first<{ n: number }>()).toEqual({ n: 0 });
		expect(await (await client(`/games/${gameId}`)).text()).toContain("The live stream was only 20 seconds, so it was treated as a test and not saved.");
		expect(await (await client("/live", ANDROID)).text()).toContain("You&#39;re all set to go live again");
		expect((await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/webm" }))).status).toBe(201);
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(true);
	});

	it("a recording under a minute that slipped past End game is dropped after processing, and the game can be streamed again", async () => {
		const { deps, gameId, client, start, row } = await filming();
		await client(`/api/uploads/${start.videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }] }));
		const uid = (await getActiveVideoForGame(deps.db, deps.team.id, gameId))!.streamUid!;
		deps.stream.videos.set(uid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 20 });
		await runSync(deps);
		expect(await getActiveVideoForGame(deps.db, deps.team.id, gameId)).toBeNull();
		expect(deps.stream.deleted).toContain(uid);
		expect(await row()).toMatchObject({ status: "cancelled" });
		const game = await (await client(`/games/${gameId}`)).text();
		expect(game).toContain("The live stream was only 20 seconds, so it was treated as a test and not saved.");
		expect((await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/webm" }))).status).toBe(201);
	});

	it("a real game (a minute or more) is kept as the game video", async () => {
		const { deps, gameId, client, start } = await filming();
		await client(`/api/uploads/${start.videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }] }));
		const uid = (await getActiveVideoForGame(deps.db, deps.team.id, gameId))!.streamUid!;
		deps.stream.videos.set(uid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 3600 });
		await runSync(deps);
		expect(await getActiveVideoForGame(deps.db, deps.team.id, gameId)).toMatchObject({ status: "ready", durationSeconds: 3600 });
	});

	it("the page's notes go to the logs; anything malformed is refused", async () => {
		const { gameId, client } = await filming();
		const logged: string[] = [];
		const log = console.log;
		console.log = (line: string) => logged.push(line);
		try {
			const res = await client(`/api/live/${gameId}/events`, jsonBody({ events: [{ s: 31, what: "sound stopped" }] }));
			expect((await json(res)).data).toEqual({ logged: 1 });
		} finally {
			console.log = log;
		}
		expect(JSON.parse(logged[0]!)).toMatchObject({ event: "golive_events", gameId, events: [{ s: 31, what: "sound stopped" }] });
		expect((await client(`/api/live/${gameId}/events`, jsonBody({ events: [] }))).status).toBe(400);
	});
});
