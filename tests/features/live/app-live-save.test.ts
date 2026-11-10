import { describe, expect, it } from "vitest";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import type { LiveRecording } from "../../../src/platform/stream-live-app.ts";
import { form, jsonBody, makeClient } from "../../helpers/app.ts";
import { appGame } from "../../helpers/app-game.ts";
import { gameForm } from "../../helpers/seed.ts";

// An external app's stream (RTMPS) on the game's page, and Stream's recording of it saved as the game video: at once
// after End game, else 20 minutes after the app stops. The clock starts at 11am on game day (helpers/app-game.ts).

async function streaming() {
	const g = await appGame();
	await g.choose();
	const { deps } = g;
	/** What Stream has recorded from the input: each part is a Stream video too. `at`: minutes after the app was chosen. */
	const recorded = (...parts: Array<[uid: string, state: LiveRecording["state"], seconds: number, at?: number]>) => {
		deps.live.recordingsOf.set("live-1", parts.map(([uid, state, durationSeconds, at = 1]) =>
			({ uid, state, durationSeconds, createdAt: new Date(Date.parse("2026-10-15T00:00:00Z") + at * 60_000).toISOString() })));
		for (const [uid, state, seconds] of parts) {
			if (state === "ready") deps.stream.videos.set(uid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: seconds });
		}
	};
	const goLive = async () => {
		deps.live.appConnectedTo.add("live-1");
		await runSync(deps);
	};
	const appStops = () => deps.live.appConnectedTo.clear();
	const stop = (client = g.sam) => client(`/live/${g.gameId}/app-stop`, form({ confirm: "yes" }));
	const videos = async () => (await deps.db.prepare("SELECT id, status, stream_uid, r2_key, uploaded_by, duration_seconds FROM videos WHERE deleted_at IS NULL ORDER BY id")
		.all<{ id: number; status: string; stream_uid: string | null; r2_key: string | null; uploaded_by: number | null; duration_seconds: number | null }>()).results;
	const clips = async () => (await deps.db.prepare("SELECT label, stream_uid, end_seconds FROM clips ORDER BY id").all<{ label: string; stream_uid: string; end_seconds: number }>()).results;
	const kinds = async () => (await deps.db.prepare("SELECT kind FROM activity ORDER BY id").all<{ kind: string }>()).results.map((a) => a.kind);
	const gamePage = async () => (await g.sam(`/games/${g.gameId}`)).text();
	return { ...g, recorded, goLive, appStops, stop, videos, clips, kinds, gamePage };
}

describe("watching an external app's stream", () => {
	it("before it starts, the game's page waits and checks again by itself; no browser-stream player", async () => {
		const { gamePage } = await streaming();
		const page = await gamePage();
		expect(page).toContain("The live stream hasn't started yet (or the camera has lost signal for a moment).");
		expect(page).toContain('<meta http-equiv="refresh" content="30">');
		expect(page).not.toContain("data-whep=");
		expect(page).not.toContain("<iframe");
	});
	it("while the app is sending, it plays in the video player, about half a minute behind, and the page never reloads itself", async () => {
		const { deps, sam, gamePage } = await streaming();
		deps.live.appConnectedTo.add("live-1");
		const page = await gamePage();
		expect(page).toMatch(/<iframe data-live-player src="https:\/\/customer-[a-z0-9]+\.cloudflarestream\.com\/[^/"]+\/iframe" allow="autoplay; fullscreen; picture-in-picture" title="Live stream"><\/iframe>/);
		// It moves on by itself once the stream stops (whep.js), without reloading while it plays.
		expect(page).toContain('<script type="module" src="/whep.js"></script>');
		expect(page).toContain("<b>Live now.</b> About half a minute behind the court.");
		expect(page).not.toContain('http-equiv="refresh"');
		expect(page).not.toContain("data-whep=");
		expect(await (await sam("/")).text()).toContain("LIVE NOW");
		expect(await (await sam("/games")).text()).toContain("LIVE NOW");
	});
	it("a browser's leftover connection never reads as the app being live", async () => {
		const { deps, gamePage } = await streaming();
		deps.live.connected.add("live-1");
		expect(await gamePage()).not.toContain("Live now");
	});
	it("the external app card's check notes the game live once, and says so", async () => {
		const { deps, gameId, sam, row, kinds, page } = await streaming();
		const check = async () => ((await (await sam(`/api/live/${gameId}/app-status`, jsonBody({}))).json()) as { data: unknown }).data;
		expect(await check()).toEqual({ live: false, streamed: false, ended: false });
		deps.live.appConnectedTo.add("live-1");
		expect(await check()).toEqual({ live: true, streamed: true, ended: false });
		expect(await check()).toEqual({ live: true, streamed: true, ended: false });
		expect((await row())!.last_live_at).not.toBeNull();
		expect(await kinds()).toEqual(["live_started"]);
		const html = await page();
		expect(html).toMatch(/<span data-says="live"><svg[^>]*>.*<\/svg> <b>Live\.<\/b>/);
		expect(html).not.toContain("data-app-back");
		deps.live.appConnectedTo.clear();
		expect(await check()).toEqual({ live: false, streamed: true, ended: false });
	});
	it("once it has streamed, the game can't be uploaded to or set to No video", async () => {
		const { deps, gameId, sam, goLive } = await streaming();
		await goLive();
		const upload = await sam("/api/uploads", jsonBody({ gameId, fileName: "a.mp4", fileSize: 5_000_000, contentType: "video/mp4" }));
		expect(upload.status).toBe(409);
		expect(((await upload.json()) as { error: { message: string } }).error.message).toContain("was live streamed");
		const noVideo = await makeClient(deps)(`/fixture/${gameId}`, await gameForm(deps, gameId, { video: "none" }));
		expect(await noVideo.text()).toContain("was live streamed and its video is being saved");
	});
	it("while the app is sending, before the 5-minute run has noted it, the game still can't be set to No video or deleted", async () => {
		const { deps, gameId, row } = await streaming();
		deps.live.appConnectedTo.add("live-1");
		const admin = makeClient(deps);
		const noVideo = await admin(`/fixture/${gameId}`, await gameForm(deps, gameId, { video: "none" }));
		expect(await noVideo.text()).toContain("was live streamed and its video is being saved");
		const deleted = await admin(`/fixture/${gameId}/delete`, form({ confirm: "yes" }));
		expect(deleted.status).toBe(409);
		expect(await row()).toMatchObject({ status: "open", source: "app" });
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(true);
	});
	it("Stream not answering whether the app is sending refuses No video rather than risk the footage", async () => {
		const { deps, gameId, row } = await streaming();
		deps.live.down = true;
		const noVideo = await makeClient(deps)(`/fixture/${gameId}`, await gameForm(deps, gameId, { video: "none" }));
		expect(await noVideo.text()).toContain("was live streamed and its video is being saved");
		expect(await row()).toMatchObject({ status: "open" });
	});
});

describe("stopping and saving an external app's stream", () => {
	it("End game is final and asks first; only who set it up, a coach or a team manager can", async () => {
		const { deps, gameId, sam, goLive, stop, row, gamePage, page } = await streaming();
		await goLive();
		expect((await sam(`/live/${gameId}/app-stop`, form({}))).status).toBe(400);
		expect((await stop(makeClient(deps, "alex@x.com"))).status).toBe(403);
		expect((await row())!.end_requested_at).toBeNull();
		const res = await stop(makeClient(deps, "coach@x.com"));
		expect(res.headers.get("Location")).toBe(`/games/${gameId}`);
		expect((await row())!.end_requested_at).not.toBeNull();
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(false);
		const watching = await gamePage();
		expect(watching).toContain('<span class="over-title">Full time</span><img src="/club-mark.webp" alt=""><b>The live stream has ended</b><span class="over-note">It\'s being saved and will be ready to watch here in about 20 to 25 minutes.</span></div></div>');
		expect(watching).toContain('<meta http-equiv="refresh" content="60">');
		// Go live no longer offers the game.
		expect(await page()).not.toContain(`<option value="${gameId}"`);
		const again = await sam(`/live/${gameId}/app`, form({}));
		expect(await again.text()).toContain("has been ended");
	});
	it("after End game, the recording becomes the game video as soon as Stream has finished it", async () => {
		const { deps, gameId, sam, goLive, appStops, stop, recorded, videos, row, kinds, later } = await streaming();
		await goLive();
		recorded(["rec-1", "live", 0]);
		later(45);
		appStops();
		await stop();
		await runSync(deps);
		expect(await videos()).toEqual([]);
		recorded(["rec-1", "ready", 2400]);
		await runSync(deps);
		const samId = (await deps.db.prepare("SELECT id FROM members WHERE email = 'sam@x.com'").first<number>("id"))!;
		const [video] = await videos();
		expect(video).toMatchObject({ stream_uid: "rec-1", r2_key: null, uploaded_by: samId });
		expect(await row()).toMatchObject({ status: "saved", source: "app", recording_video_id: video!.id });
		// Stream gives a recording only a name: the save puts the team on it, as every video of the site's has.
		expect(deps.stream.labels.get("rec-1")).toEqual({ name: "Saints B12.1 · 2026-10-15 · Round 9 · vs Northside 2", teamId: deps.team.id });
		await runSync(deps);
		expect((await videos())[0]).toMatchObject({ status: "ready", duration_seconds: 2400 });
		expect(await kinds()).toEqual(["live_started", "live_saved", "video_ready"]);
		expect(await (await sam(`/games/${gameId}`)).text()).toContain("/iframe");
		expect(deps.stream.deleted).toEqual([]);
		// In the Log as a phone's stream is: who went live, who ended the game, and its recording saved.
		const log = (await deps.db.prepare("SELECT admin_email, action FROM admin_log ORDER BY id").all<{ admin_email: string; action: string }>()).results;
		expect(log).toEqual([
			{ admin_email: "sam@x.com", action: "live_app_chosen" }, { admin_email: "sam@x.com", action: "live_started" },
			{ admin_email: "sam@x.com", action: "live_app_stopped" }, { admin_email: "sam@x.com", action: "live_saved" },
		]);
		expect((await (await makeClient(deps)("/admin/log?show=videos")).text()).replaceAll("&#39;", "'")).toContain("ended the external app's stream of Saints B12.1's game");
	});
	it("an app stream that was only a quick test is in the Log as thrown away, by the site", async () => {
		const { deps, goLive, appStops, stop, recorded, later } = await streaming();
		await goLive();
		later(5);
		appStops();
		await stop();
		recorded(["rec-1", "ready", 30]);
		await runSync(deps);
		const last = await deps.db.prepare("SELECT admin_email, action, detail FROM admin_log ORDER BY id DESC").first<{ admin_email: string; action: string; detail: string }>();
		expect(last).toEqual({ admin_email: "site", action: "live_test", detail: "Round 9 · vs Northside 2, Thu 15 Oct: 30 seconds, from the external app" });
	});
	it("nobody taps it: the game saves itself 20 minutes after the app was last seen sending", async () => {
		const { deps, goLive, appStops, recorded, videos, row, later } = await streaming();
		await goLive();
		later(45);
		await runSync(deps);
		appStops();
		recorded(["rec-1", "ready", 2700]);
		later(15);
		await runSync(deps);
		expect(await videos()).toEqual([]);
		expect(await row()).toMatchObject({ status: "open" });
		later(10);
		await runSync(deps);
		expect((await videos())[0]).toMatchObject({ stream_uid: "rec-1" });
		expect(await row()).toMatchObject({ status: "saved" });
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(false);
	});
	it("a stream that came and went between checks still saves: the 20 minutes start when its recording is found", async () => {
		const { deps, recorded, videos, row, later, kinds } = await streaming();
		recorded(["rec-1", "ready", 600]);
		await runSync(deps);
		expect(await videos()).toEqual([]);
		expect((await row())!.last_live_at).not.toBeNull();
		expect(await kinds()).toEqual(["live_started"]);
		later(21);
		await runSync(deps);
		expect((await videos())[0]).toMatchObject({ stream_uid: "rec-1" });
	});
	it("a restart after a long gap: the longest part is the game video, the others clips; a part under a minute is deleted", async () => {
		const { deps, goLive, appStops, stop, recorded, videos, clips } = await streaming();
		await goLive();
		appStops();
		recorded(["rec-3", "ready", 20, 560], ["rec-2", "ready", 1500.4, 545], ["rec-1", "ready", 1200, 500]);
		await stop();
		await runSync(deps);
		expect((await videos()).map((v) => v.stream_uid)).toEqual(["rec-2"]);
		expect(await clips()).toEqual([{ label: "Live stream, more from 7:20pm", stream_uid: "rec-1", end_seconds: 1200 }]);
		expect([...deps.stream.labels.keys()].sort()).toEqual(["rec-1", "rec-2"]);
		expect(deps.stream.deleted).toEqual(["rec-3"]);
	});
	it("under a minute is a test: nothing's saved, the recording goes, the pages say why and the game is free again", async () => {
		const { deps, gameId, sam, goLive, appStops, stop, recorded, videos, row, gamePage } = await streaming();
		await goLive();
		appStops();
		recorded(["rec-1", "ready", 30]);
		await stop();
		await runSync(deps);
		expect(await videos()).toEqual([]);
		expect(await row()).toMatchObject({ status: "cancelled", cancel_reason: "The live stream was only 30 seconds, so it was treated as a test and not saved." });
		expect(deps.stream.deleted).toEqual(["rec-1"]);
		expect(await gamePage()).toContain("only 30 seconds");
		const camera = await (await sam(`/live?game=${gameId}`)).text();
		expect(camera).toContain("only 30 seconds");
		expect(camera).toContain('class="appcard weblive"');
		expect(await row()).toMatchObject({ status: "open", source: "camera" });
	});
	it("stopped before the app sent anything: closed, saying so; an app game nobody used closes after a day", async () => {
		const stopped = await streaming();
		await stopped.stop();
		await runSync(stopped.deps);
		expect(await stopped.row()).toMatchObject({ status: "cancelled", cancel_reason: "The game was ended before the external app sent anything, so nothing was saved." });

		const unused = await streaming();
		unused.later(23 * 60);
		await runSync(unused.deps);
		expect(await unused.row()).toMatchObject({ status: "open" });
		unused.later(2 * 60);
		await runSync(unused.deps);
		expect(await unused.row()).toMatchObject({ status: "cancelled", cancel_reason: null });
		expect(unused.deps.live.inputs.get("live-1")!.enabled).toBe(false);
	});
	it("waits while Stream is still finishing a recording, and ignores recordings from before the app was chosen", async () => {
		const { deps, goLive, appStops, stop, recorded, videos, clips, row } = await streaming();
		await goLive();
		appStops();
		await stop();
		recorded(["rec-2", "processing", 0], ["old", "ready", 900, -30]);
		await runSync(deps);
		expect(await row()).toMatchObject({ status: "open" });
		recorded(["rec-2", "ready", 1800], ["old", "ready", 900, -30]);
		await runSync(deps);
		expect((await videos()).map((v) => v.stream_uid)).toEqual(["rec-2"]);
		expect(await clips()).toEqual([]);
		expect(deps.stream.deleted).toEqual([]);
	});
	it("a video uploaded before the app was seen sending stays the game video; the stream's parts become its clips once it's in Stream", async () => {
		const { deps, gameId, stop, recorded, videos, clips, row } = await streaming();
		const uploaded = (await deps.db.prepare(`INSERT INTO videos (team_id, game_id, status, r2_key, r2_upload_id, original_name, original_bytes, delete_after, created_at)
			VALUES (?, ?, 'uploading', 'k', 'u', 'IMG.MOV', 1, '2027-12-31T13:00:00.000Z', '2026-10-15T00:00:00.000Z')`).bind(deps.team.id, gameId).run()).meta.last_row_id;
		recorded(["rec-1", "ready", 900]);
		await stop();
		// Still uploading, so it has no Stream video for clips to hang off yet: nothing is lost, it waits.
		await runSync(deps);
		expect(await row()).toMatchObject({ status: "open" });
		expect(deps.stream.deleted).toEqual([]);
		await deps.db.prepare("UPDATE videos SET status = 'processing', stream_uid = 'up-1', r2_upload_id = NULL WHERE id = ?").bind(uploaded).run();
		deps.stream.videos.set("up-1", { readyToStream: false, state: "inprogress", errorReason: "", durationSeconds: -1 });
		await runSync(deps);
		expect((await videos()).map((v) => v.stream_uid)).toEqual(["up-1"]);
		expect(await clips()).toEqual([{ label: "Live stream, more from 11:01am", stream_uid: "rec-1", end_seconds: 900 }]);
		expect(await row()).toMatchObject({ status: "saved" });
	});
	it("a recording Stream couldn't make is said, not saved", async () => {
		const { deps, goLive, appStops, stop, recorded, row, kinds } = await streaming();
		await goLive();
		appStops();
		await stop();
		recorded(["rec-1", "error", 0]);
		await runSync(deps);
		expect(await row()).toMatchObject({ status: "cancelled", cancel_reason: "The live stream's recording couldn't be saved." });
		expect(await kinds()).toEqual(["live_started", "video_failed"]);
	});
});
