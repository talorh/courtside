import { describe, expect, it } from "vitest";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { form, jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { gameForm, seedGame, seedVideo } from "../../helpers/seed.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile";

// Test clock is 2026-10-15T00:00Z = 11am Thursday 15 Oct in the club's time zone; the game is tonight.
async function goLive(userAgent = IPHONE) {
	let now = new Date("2026-10-15T00:00:00Z");
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40", opponent: "Northside 2" });
	const page = await (await makeClient(deps)("/live", { headers: { "User-Agent": userAgent } })).text();
	const later = (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); };
	/** Go live on the page: the recording upload starts and the phone streams to the input. */
	const startStreaming = async () => {
		await makeClient(deps)(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }));
		deps.live.connected.add("live-1");
	};
	return { deps, gameId, page, later, startStreaming };
}

const status = (deps: TestDeps) => deps.db.prepare("SELECT status FROM live_streams").first<string>("status");

describe("Go live page", () => {
	it("any phone: today's game and streaming from the page", async () => {
		for (const ua of [IPHONE, ANDROID]) {
			const { deps, gameId, page } = await goLive(ua);
			expect(page).toContain(`<option value="${gameId}" selected>`);
			expect(page).toContain(`class="appcard weblive" aria-labelledby="web-title" data-game="${gameId}" data-recording=""`);
			expect(page).toContain('<script type="module" src="/golive.js"></script>');
			expect(page).toContain("Tap <b>Start camera</b>, then <b>Allow</b> the camera and the microphone.");
			// One clear red End game button, which asks before it stops (no double tap), and no app-era wording.
			expect(page).toContain('data-act="stop" hidden><svg class="stopicon"');
			expect(page).toContain("<b>End the game?</b>\nOnly at the final buzzer: the stream can't be started again.");
			expect(page).toMatch(/data-act="stopyes">.*Yes, end game<\/button>/);
			expect(page).toContain('data-act="stopno">Keep streaming</button>');
			// Pause and Resume for half-time.
			expect(page).toMatch(/data-act="pause" hidden>.*Pause<\/button>/);
			expect(page).toMatch(/data-act="resume" hidden>.*Resume<\/button>/);
			// Started in the warm-up, paused for what isn't filmed, stopped only at the end; the rest is in Help.
			expect(page).toContain("Tap <b>Go live</b> during the warm-up. Phone still upright? It waits until you turn it sideways.");
			expect(page).toContain("Not filming a part, like the warm-up or half-time? Tap <b>Pause</b>, then <b>Resume</b> before play starts.");
			expect(page).toContain("<b>Keep the phone unlocked and on this page</b>, with Do Not Disturb on. Camera stopped anyway? Tap <b>Resume camera</b>.");
			// The power bank is said once, under Start camera.
			expect(page.match(/power bank/g)).toHaveLength(1);
			expect(page).toContain("<li>Only after the final buzzer, tap <b>End game</b>, then <b>Yes, end game</b>: once ended, it can't start again.");
			expect(page).toContain("<b>Then wait for it to finish saving</b>: keep the page open while it says <b>Saving</b>, until it says <b>Saved</b>.");
			expect(page).toContain('<p class="small">More help: <a href="/help#live-game">Live streaming a game</a> in Help.</p>');
			expect(page).not.toContain("Before tip-off");
			expect(page).not.toContain("After the final buzzer</summary>");
			expect(page).not.toMatch(/nothing to install|twice|End stream/i);
			expect(page).not.toMatch(/moblin|apps\.apple\.com|play\.google\.com/i);
			expect(page).not.toContain("QR");
			expect(deps.live.inputs.get("live-1")).toMatchObject({ enabled: true });
		}
	});
	it("reuses the game's live input, however often the page is opened", async () => {
		const { deps } = await goLive();
		await makeClient(deps)("/live");
		await makeClient(deps)("/live");
		expect(deps.live.inputs.size).toBe(1);
	});
	it("streaming again after a try that wasn't saved reuses its input while Stream still has it", async () => {
		const { deps } = await goLive();
		await deps.db.prepare("UPDATE live_streams SET status = 'cancelled', finished_at = '2026-10-14T00:00:00.000Z'").run();
		deps.live.inputs.get("live-1")!.enabled = false;
		expect((await makeClient(deps)("/live")).status).toBe(200);
		expect([...deps.live.inputs]).toEqual([["live-1", expect.objectContaining({ enabled: true })]]);
		expect(await status(deps)).toBe("open");
	});
	it("once the nightly clean-up has taken a closed stream's input (Go live opened early, never used), a new one is made, with nothing logged as an error", async () => {
		const { deps } = await goLive();
		await deps.db.prepare("UPDATE live_streams SET status = 'cancelled', finished_at = '2026-10-14T00:00:00.000Z'").run();
		deps.live.inputs.delete("live-1");
		const errors: string[] = [];
		const error = console.error;
		console.error = (line: string) => void errors.push(line);
		try {
			expect((await makeClient(deps)("/live")).status).toBe(200);
		} finally {
			console.error = error;
		}
		expect([...deps.live.inputs.keys()]).toEqual(["live-2"]);
		expect(await deps.db.prepare("SELECT live_input_uid AS uid FROM live_streams WHERE status = 'open'").first<string>("uid")).toBe("live-2");
		expect(errors).toEqual([]);
	});
	it("two phones opening Go live for the game at the same moment share one stream", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		const create = deps.live.createInput.bind(deps.live);
		let first = true;
		deps.live.createInput = async (name, teamId) => {
			if (first) { // the other phone gets there while this one is still setting up
				first = false;
				const theirs = await create(name, teamId);
				await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at) VALUES (?, ?, ?, 1, ?)")
					.bind(deps.team.id, gameId, theirs.uid, new Date().toISOString()).run();
			}
			return create(name, teamId);
		};
		expect((await makeClient(deps)("/live")).status).toBe(200);
		expect([...deps.live.inputs.keys()]).toEqual(["live-1"]);
		expect(deps.live.deletedInputs).toEqual(["live-2"]);
	});
	it("a page opened while the game streams doesn't say this phone is live: its camera hasn't started", async () => {
		const { deps, startStreaming } = await goLive();
		await startStreaming();
		const page = await (await makeClient(deps)("/live")).text();
		expect(page).toMatch(/data-recording="\d+"/);
		expect(page).not.toContain("You're live!");
	});
	it("is for filmers and up, and skips games that have their video", async () => {
		const { deps, gameId } = await goLive();
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'p@x.com', 'watcher')").bind(deps.team.id).run();
		expect((await makeClient(deps, "p@x.com")("/live")).status).toBe(403);
		expect((await makeClient(deps, "p@x.com")(`/api/live/${gameId}/end`, jsonBody({}))).status).toBe(403);
		const other = await seedGame(deps, { startsAt: "2026-10-08T18:40" });
		await seedVideo(deps, { gameId: other, streamUid: "u" });
		const page = await (await makeClient(deps)("/live")).text();
		expect(page).not.toContain(`<option value="${other}"`);
	});
	it("the old app-stream End game form is gone", async () => {
		const { deps, gameId } = await goLive();
		expect((await makeClient(deps)(`/live/${gameId}/end`, form({}))).status).toBe(404);
	});
});

describe("live streams (cron)", () => {
	it("notes when a game goes live, and doesn't save or close it while streaming, however long", async () => {
		const { deps, later, startStreaming } = await goLive();
		await startStreaming();
		for (let i = 0; i < 20; i++) {
			later(5);
			await runSync(deps);
		}
		expect(await status(deps)).toBe("open");
		const kinds = await deps.db.prepare("SELECT kind FROM activity ORDER BY id").all<{ kind: string }>();
		expect(kinds.results.map((r) => r.kind)).toEqual(["live_started"]);
	});
	it("closes an input nobody used after a day", async () => {
		const { deps, later } = await goLive();
		later(60 * 25);
		await runSync(deps);
		expect(await status(deps)).toBe("cancelled");
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(false);
	});
	it("if Stream no longer has the old input (deleted, or moved accounts), Go live sets up a new one", async () => {
		const { deps, later } = await goLive();
		later(60 * 10); // 9pm, still game day (a played game isn't offered for Go live)
		await runSync(deps);
		deps.live.inputs.delete("live-1");
		expect((await makeClient(deps)("/live")).status).toBe(200);
		expect(deps.live.inputs.get("live-2")!.enabled).toBe(true);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM live_streams WHERE status = 'open'").first<{ n: number }>()).toEqual({ n: 1 });
	});
	it("a stream that went live but has no recording, whose input Stream no longer has, gets a new one (22 Oct)", async () => {
		const { deps } = await goLive();
		deps.live.connected.add("live-1");
		await runSync(deps); // noted as live
		deps.live.inputs.delete("live-1");
		const page = await makeClient(deps)("/live");
		expect(page.status).toBe(200);
		expect(await page.text()).toContain("data-game=");
		expect(deps.live.inputs.get("live-2")!.enabled).toBe(true);
		await runSync(deps);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM live_streams WHERE status = 'open'").first<{ n: number }>()).toEqual({ n: 1 });
	});
	it("a recording still uploading keeps its stream if Stream loses the input: End game and the cron still work", async () => {
		const { deps, gameId, later, startStreaming } = await goLive();
		await startStreaming();
		deps.live.inputs.delete("live-1");
		await runSync(deps);
		// The Go live page shows the recording (to save it) without needing the input.
		const page = await makeClient(deps)("/live");
		expect(page.status).toBe(200);
		expect(await page.text()).toMatch(/data-recording="\d+"/);
		later(5);
		expect((await makeClient(deps)(`/api/live/${gameId}/end`, jsonBody({}))).status).toBe(200);
		expect(await deps.db.prepare("SELECT status, end_requested_at IS NOT NULL AS ended FROM live_streams").first()).toEqual({ status: "open", ended: 1 });
		expect(deps.live.inputs.size).toBe(0);
	});
});

describe("watching live", () => {
	it("shows LIVE NOW on Home and Watch games, and the game page plays it", async () => {
		const { deps, gameId, startStreaming } = await goLive();
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'p@x.com', 'watcher')").bind(deps.team.id).run();
		const watcher = makeClient(deps, "p@x.com");
		expect(await (await watcher("/")).text()).not.toContain("LIVE NOW");
		await startStreaming();
		expect(await (await watcher("/")).text()).toContain(`<a class="livecard" href="/games/${gameId}">`);
		const games = await (await watcher("/games")).text();
		expect(games).toContain("LIVE NOW");
		expect(games).toContain(`<a class="game s-live" href="/games/${gameId}">`);
		expect(await (await makeClient(deps)("/fixture")).text()).toContain('<span class="role">Live stream</span>');
		// Notifications list it once, as the live stream (its recording isn't listed as an upload too).
		const notes = await (await makeClient(deps)("/notifications")).text();
		expect(notes).toContain("Live stream: streaming now");
		expect(notes).not.toContain("Uploading from a parent");
		const game = await (await watcher(`/games/${gameId}`)).text();
		expect(game).toContain('<video data-live-player data-whep="https://customer-cust.cloudflarestream.com/tok-live-1/webRTC/play"');
		expect(game).toContain("Live now.");
		expect(game).not.toMatch(/End game|Waiting up to 10 minutes|<iframe/);
	});
	it("a Stream outage never breaks the pages", async () => {
		const { deps, gameId } = await goLive();
		deps.live.down = true;
		expect((await makeClient(deps)("/")).status).toBe(200);
		expect((await makeClient(deps)(`/games/${gameId}`)).status).toBe(200);
	});
	it("deleting a game whose stream was only set up closes it", async () => {
		const { deps, gameId } = await goLive();
		await makeClient(deps)(`/fixture/${gameId}/delete`, form({ confirm: "yes" }));
		expect(await status(deps)).toBe("cancelled");
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(false);
	});
	it("End game with nothing recorded (the camera never started) cancels the stream, so the game can go live again", async () => {
		const { deps, gameId } = await goLive();
		const res = await makeClient(deps)(`/api/live/${gameId}/end`, jsonBody({ recordedSeconds: 0, cause: "tapped" }));
		expect((await res.json() as { data: unknown }).data).toEqual({ status: "test", seconds: 0 });
		expect(await status(deps)).toBe("cancelled");
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(false);
		// Opening Go live again reopens it for the game, and streaming works.
		await makeClient(deps)("/live");
		expect(await status(deps)).toBe("open");
		expect((await makeClient(deps)(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }))).status).toBe(201);
	});
	it("a game with a video and a stream only set up refuses the delete and leaves the stream as it was", async () => {
		const { deps, gameId } = await goLive();
		await seedVideo(deps, { gameId, streamUid: "u1" });
		expect((await makeClient(deps)(`/fixture/${gameId}/delete`, form({ confirm: "yes" }))).status).toBe(409);
		expect(await status(deps)).toBe("open");
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(true);
	});
	it("a game being streamed can't be marked No video or deleted (its video is on the way), except by admin with footage", async () => {
		const { deps, gameId, startStreaming } = await goLive();
		await startStreaming();
		expect((await makeClient(deps)(`/fixture/${gameId}`, await gameForm(deps, gameId, { video: "none" }))).status).toBe(409);
		expect((await makeClient(deps)(`/fixture/${gameId}/delete`, form({ confirm: "yes" }))).status).toBe(409);
		expect(await status(deps)).toBe("open");
		await makeClient(deps)(`/fixture/${gameId}/delete-all`, form({ confirm: "yes" }));
		expect(await status(deps)).toBe("cancelled");
	});
});

describe("a stream that was only set up (Go live opened, nothing sent)", () => {
	it("doesn't count as live anywhere, and No video closes it", async () => {
		let now = new Date("2026-10-15T00:00:00Z");
		const deps = createTestDeps();
		(deps as { now: () => Date }).now = () => now;
		// A past game nobody uploaded, and next week's game: Go live picks next week's, not the old one.
		await seedGame(deps, { startsAt: "2026-06-12T18:40", opponent: "Old Game" });
		const next = await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Next Week" });
		expect(await (await makeClient(deps)("/live")).text()).toContain(`<option value="${next}" selected>`);
		expect(await status(deps)).toBe("open");
		expect(await (await makeClient(deps)("/fixture")).text()).toContain('<span class="role">Upcoming</span>');
		expect(await (await makeClient(deps)("/notifications")).text()).not.toContain("Live stream open");
		const game = await (await makeClient(deps)(`/games/${next}`)).text();
		expect(game).not.toContain('title="Live stream"');
		expect(game).toContain("Upcoming. It&#39;ll be live streamed here, then saved here after the game.");
		// Stream still saying "connected" after a test's Stop (22 Oct): no recording, so not live, and nothing logged.
		deps.live.connected.add("live-1");
		expect(await (await makeClient(deps)(`/games/${next}`)).text()).not.toContain('title="Live stream"');
		expect(await (await makeClient(deps)("/")).text()).not.toContain("LIVE NOW");
		await runSync(deps);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM activity").first<number>("n")).toBe(0);
		deps.live.connected.delete("live-1");
		// On game day the page is ready to play it as soon as the filmer goes live.
		now = new Date("2026-10-23T07:00:00Z");
		expect(await (await makeClient(deps)(`/games/${next}`)).text()).toContain('title="Live stream"');
		await makeClient(deps)(`/fixture/${next}`, await gameForm(deps, next, { video: "none" }));
		expect(await status(deps)).toBe("cancelled");
	});
});

describe("Go live and played games", () => {
	it("lists today's or the next game first (picked), then the later ones in date order", async () => {
		const deps = createTestDeps();
		const later = await seedGame(deps, { startsAt: "2026-10-30T18:40", opponent: "Later" });
		const next = await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Next" });
		const last = await seedGame(deps, { startsAt: "2026-11-06T18:40", opponent: "Last" });
		const page = await (await makeClient(deps)("/live")).text();
		expect(page).toContain(`<option value="${next}" selected>`);
		expect([...page.matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([next, later, last]);
	});
	it("offers only today's and upcoming games, and won't start a stream for a played one (Upload still takes it)", async () => {
		const deps = createTestDeps();
		const played = await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "Played Last Week" });
		const next = await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Next Week" });
		const page = await (await makeClient(deps)("/live")).text();
		expect(page).toContain(`<option value="${next}" selected>`);
		expect(page).not.toContain("Played Last Week");
		const res = await makeClient(deps)(`/api/live/${played}/browser`, jsonBody({ mimeType: "video/mp4" }));
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("Upload its video instead");
		expect(await (await makeClient(deps)("/upload")).text()).toContain("Played Last Week");
	});
});
