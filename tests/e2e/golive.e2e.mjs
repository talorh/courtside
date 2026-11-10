// Go live from the phone's browser (public/golive*.js): the ways a game night can go, on each phone. The first one is
// game night, 23 Oct 2026: with the picture upright (Rotation Lock), Go live taps did nothing at all. Scenarios marked
// with a review id (P1 and so on, docs/reviews/2026-10-23-golive-review.md) say what the page must do about a finding.
import { GAME_ID } from "./pages.mjs";
import { VIDEO_ID } from "./harness.mjs";
import { SEL } from "./helpers.mjs";

/** Puts parts ([n, bytes]) and tail pieces (bytes) into the page's recording store for `key`, as a dead page leaves them. */
async function keepOnPhone(t, key, { parts, tail }) {
	await t.page.evaluate(async ([key, parts, tail]) => {
		const { openStore } = await import("/golive-store.js");
		const store = await openStore();
		for (const [n, size] of parts) await store.putPart(key, n, new Blob([new Uint8Array(size)], { type: "video/mp4" }));
		for (const [seq, size] of tail.entries()) await store.putTail(key, seq, new Blob([new Uint8Array(size)], { type: "video/mp4" }));
	}, [key, parts, tail]);
}
/** How many bytes the page's recording store still holds for `key`. */
const keptOnPhone = (t, key) => t.page.evaluate(async (key) => {
	const { openStore } = await import("/golive-store.js");
	const store = await openStore();
	const parts = await store.listParts(key), tail = await store.listTail(key);
	return parts.reduce((sum, p) => sum + p.blob.size, 0) + tail.reduce((sum, b) => sum + b.size, 0);
}, key);

const ALL = ["android", "iphone", "firefox"];
// What an upright picture's advice names on each phone: the setting that keeps it upright (Firefox here is a computer).
const UPRIGHT = { iphone: /Portrait Orientation Lock.*padlock/, android: /Auto-rotate/, firefox: /Turn the phone sideways/ };
const LIVE_ROUTE = `POST /api/live/${GAME_ID}/browser`;
const refuse = (message, status = 409) => ({ status, json: { ok: false, error: { code: "conflict", message } } });
/** The first `times` calls get `first`, the rest the harness's usual answer (`usual`). */
const firstTimes = (times, first, usual) => { let n = 0; return (req) => (n++ < times ? first : usual(req)); };
const usualStart = () => ({ status: 201, json: { ok: true, data: { videoId: VIDEO_ID, partSize: 128 * 1024, whipUrl: `http://127.0.0.1:8799/whip/${GAME_ID}` } } });
const cameraRefused = () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")); };
const homeScreenApp = () => { Object.defineProperty(navigator, "standalone", { get: () => true }); };
/** Every wake lock request, timed, and how many are held now, so a test can tell when the screen is being kept on. */
const wakeLockSpy = () => {
	window.wakeLockAsks = [];
	window.wakeLockHeld = 0;
	const sentinel = () => Object.assign(new EventTarget(), {
		released: false,
		release() { if (!this.released) { this.released = true; window.wakeLockHeld--; } return Promise.resolve(); },
	});
	Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => { window.wakeLockAsks.push(Date.now()); window.wakeLockHeld++; return sentinel(); } } });
};
/**
 * The phone switches the camera off (locked, or another app took it). The browser says so with the track's "ended"
 * (Firefox ignores one made by a page) and, once a locked phone is unlocked, the page coming back into view: both are
 * played here.
 */
/** A finger dragging down `dy` px from near the top of the page, letting go if `lift` (touch events, as a phone sends). */
const pull = (t, dy, lift) => t.page.evaluate(([down, up]) => {
	const at = document.querySelector("h1");
	const fire = (type, y) => {
		const e = new Event(type, { bubbles: true });
		Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : [{ clientX: 180, clientY: y }] });
		at.dispatchEvent(e);
	};
	fire("touchstart", 150);
	for (let y = 150; y <= 150 + down; y += 20) fire("touchmove", y);
	if (up) fire("touchend", 150 + down);
}, [dy, lift]);
const cameraStops = (t) => t.page.evaluate(() => {
	const track = document.querySelector("[data-cam] video").srcObject.getVideoTracks()[0];
	track.stop();
	track.dispatchEvent(new Event("ended"));
	document.dispatchEvent(new Event("visibilitychange"));
});

export const scenarios = [
	{
		name: "one tap is enough: tapped with the picture upright, it says to turn sideways and goes live by itself when it turns",
		phones: ALL,
		async run(t) {
			await t.openGoLive();
			await t.startCamera();
			await t.picture(720, 1280);
			await t.tap(SEL.live);
			await t.until(async () => /goes live as soon as you do/.test(await t.text(SEL.status)), "the camera screen to say it goes live once turned");
			t.check(t.starts() === 0, "no stream started while the picture is upright");
			await t.until(() => t.logged().some((l) => l.startsWith("go live tap 720x1280")), "the tap to be logged");
			await t.picture(1280, 720);
			await t.until(() => t.starts() === 1, "the stream to start by itself once the phone is sideways");
			t.check(await t.isFull(), "the camera to fill the screen");
			await t.until(() => t.logged().some((l) => /going live by itself: 1280x720/.test(l)), "the start logged");
		},
	},
	{
		name: "upright picture (Portrait Orientation Lock, game night 23 Oct): a second tap goes live as it is",
		phones: ALL,
		async run(t) {
			await t.openGoLive();
			await t.startCamera();
			await t.picture(720, 1280);
			await t.tap(SEL.live);
			await t.until(async () => UPRIGHT[t.phone].test(await t.text(SEL.status)), "the camera screen to say how to fix it");
			t.check(t.starts() === 0, "no stream started by the first tap");
			await t.tap(SEL.live);
			await t.until(() => t.starts() === 1, "the second tap to start the stream");
			t.check(await t.isFull(), "the camera to fill the screen");
		},
	},
	{
		name: "sideways: Go live fills the screen, the live stream reaches the far end, the recording uploads as it goes",
		phones: ALL,
		async run(t) {
			await t.goLive();
			t.check(await t.isFull(), "the camera to fill the screen");
			t.check(await t.onScreen(SEL.stop), "End game on screen");
			await t.until(() => t.harness.parts.size >= 2, "recording parts to upload", 20_000);
			const tap = t.logged().find((l) => l.startsWith("go live tap"));
			t.check(/^go live tap 1280x720 /.test(tap ?? ""), `the tap logged with the picture size (got "${tap}")`);
		},
	},
	{
		name: "P14: the full-screen camera covers the whole screen, the top bar included",
		phones: ALL,
		async run(t) {
			await t.goLive();
			const covered = await t.page.evaluate(() => [[innerWidth / 2, 4], [8, innerHeight / 2], [innerWidth - 8, innerHeight - 8]]
				.every(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-cam]")));
			t.check(covered, "the camera on top at the top, side and bottom of the screen");
		},
	},
	{
		name: "a phone whose full screen never answers still goes live",
		phones: ["android"],
		init: () => { Element.prototype.requestFullscreen = () => new Promise(() => {}); },
		async run(t) {
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			const tapped = Date.now();
			await t.tap(SEL.live);
			await t.until(() => t.starts() === 1, "the stream to start despite full screen hanging", 5000);
			t.check(Date.now() - tapped < 4000, "it to start within 4 seconds");
			t.check(await t.isFull(), "the camera to fill the screen anyway");
		},
	},
	{
		name: "a phone that refuses full screen still goes live",
		phones: ["android"],
		init: () => { Element.prototype.requestFullscreen = () => Promise.reject(new TypeError("Permissions check failed")); },
		async run(t) {
			await t.goLive();
			t.check(await t.isFull(), "the camera to fill the screen anyway");
		},
	},
	{
		name: "camera or microphone not allowed, in the browser: says how to allow them",
		phones: ALL,
		init: cameraRefused,
		async run(t) {
			await t.openGoLive();
			await t.tap(SEL.camera);
			await t.until(async () => /allow Camera and Microphone/.test(await t.text(SEL.msg)), "the page to say how to allow the camera");
			t.check(await t.visible(SEL.camera), "Start camera still there to try again");
		},
	},
	{
		name: "the Home Screen app: Go live says to use the browser, with a button to open it there, and no Start camera",
		phones: ["iphone", "android"],
		init: homeScreenApp,
		async run(t) {
			await t.openGoLive();
			const box = await t.text("[data-browser]");
			t.check(t.phone === "iphone" ? /Go live from Safari, not the Home Screen app/.test(box) : /Go live from Chrome, not the Home Screen app/.test(box), `says which browser (${box})`);
			t.check(/locked for a moment/.test(box), "and why");
			const open = await t.page.locator("[data-browser] a").first().getAttribute("href");
			t.check(t.phone === "iphone" ? open === "x-safari-https://127.0.0.1:8799/golive" : /^intent:\/\/127\.0\.0\.1:8799\/golive#Intent;scheme=https;package=com\.android\.chrome/.test(open), `a button to open it there (${open})`);
			t.check(await t.page.locator(SEL.camera).isHidden(), "no Start camera");
		},
	},
	{
		name: "the site refuses Go live: the camera leaves full screen, the page says why, the next tap works",
		phones: ALL,
		async run(t) {
			t.harness.answer(LIVE_ROUTE, firstTimes(1, refuse("This game is already being filmed from another phone or tab."), usualStart));
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(async () => /already being filmed/.test(await t.text(SEL.msg)), "the refusal in plain words");
			t.check(!(await t.isFull()), "the camera back in the card");
			await t.until(() => t.page.locator(SEL.live).isEnabled(), "Go live to be tappable again");
			await t.tap(SEL.live);
			await t.until(() => t.starts() === 2, "the next tap to start the stream");
		},
	},
	{
		name: "P5: a lost signal at Go live says so in plain words, and the next tap works",
		phones: ALL,
		async run(t) {
			t.harness.answer(LIVE_ROUTE, firstTimes(1, "drop", usualStart));
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			const before = await t.text(SEL.msg);
			await t.tap(SEL.live);
			// Firefox sends a request again by itself when its connection breaks, so there it may simply go live.
			await t.until(async () => (await t.text(SEL.msg)) !== before || await t.isFull() && t.starts() === 2, "a message after the failed start");
			if (t.starts() === 2) return;
			const said = await t.text(SEL.msg);
			t.check(/signal/i.test(said), `plain words about the signal (got "${said}")`);
			await t.tap(SEL.live);
			await t.until(() => t.starts() === 2, "the next tap to start the stream");
		},
	},
	{
		name: "P4: a slow start says it's starting straight away",
		phones: ALL,
		async run(t) {
			t.harness.answer(LIVE_ROUTE, () => ({ delayMs: 6000, then: usualStart() }));
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.page.waitForTimeout(700);
			const said = await t.text(SEL.status);
			t.check(/Starting/.test(said), `the camera screen to say it's starting (got "${said}")`);
		},
	},
	{
		name: "P4: after Yes, end game, the camera screen says it's ending the game while the site answers",
		phones: ALL,
		async run(t) {
			t.harness.answer(`POST /api/live/${GAME_ID}/end`, () => ({ delayMs: 3000, then: { status: 200, json: { ok: true, data: { status: "test", seconds: 9 } } } }));
			await t.goLive();
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			// The site holds its answer for 3 seconds: the screen says it's stopping meanwhile.
			await t.until(async () => /Ending the game/.test(await t.text(SEL.status)), "the camera screen to say it's ending the game while the site answers", 3000);
			await t.until(async () => /only 9 seconds/.test(await t.text(SEL.saving)), "the test's words once the site answers");
		},
	},
	{
		name: "P6: a refused Go live goes to the site's logs",
		phones: ["android"],
		async run(t) {
			t.harness.answer(LIVE_ROUTE, () => refuse("This game already has its video."));
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(async () => /already has its video/.test(await t.text(SEL.msg)), "the refusal shown");
			await t.until(() => t.logged().some((l) => /already has its video/.test(l)), "the refusal logged", 5000);
		},
	},
	{
		name: "P6: a refused camera goes to the site's logs",
		phones: ["android"],
		init: cameraRefused,
		async run(t) {
			await t.openGoLive();
			await t.tap(SEL.camera);
			await t.until(async () => /allow Camera and Microphone/.test(await t.text(SEL.msg)), "the refusal shown");
			await t.until(() => t.logged().some((l) => /camera.*NotAllowedError/.test(l)), "the refused camera logged", 5000);
		},
	},
	{
		name: "P1: the camera stops before Go live (a phone that locked during setup): Go live doesn't stream a dead camera",
		phones: ALL,
		async run(t) {
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			await cameraStops(t);
			await t.until(async () => /Start camera/.test(await t.text(SEL.msg)) && await t.visible(SEL.camera), "the page to say the camera stopped and offer Start camera", 5000);
			t.check(!(await t.visible(SEL.live)), "no Go live for a dead camera");
			t.check(t.starts() === 0, "no stream started");
		},
	},
	{
		name: "P1: the screen is kept on from the Start camera tap (setting up on the tripod takes minutes)",
		phones: ALL,
		init: wakeLockSpy,
		async run(t) {
			await t.openGoLive();
			const tapped = await t.page.evaluate(() => Date.now());
			await t.startCamera();
			const asked = await t.page.evaluate((since) => window.wakeLockAsks.filter((at) => at >= since && at - since < 1500).length, tapped);
			t.check(asked > 0, "the screen lock asked for at Start camera");
		},
	},
	{
		name: "P2: the screen is being kept on when Go live is tapped, however long the start takes",
		phones: ALL,
		init: wakeLockSpy,
		async run(t) {
			t.harness.answer(LIVE_ROUTE, () => ({ delayMs: 3000, then: usualStart() }));
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.page.waitForTimeout(300);
			t.check(await t.page.evaluate(() => window.wakeLockHeld > 0), "the screen lock held at the Go live tap");
			await t.until(() => t.starts() === 1, "the stream to start");
			t.check(await t.page.evaluate(() => window.wakeLockHeld > 0), "the screen lock still held once live");
		},
	},
	{
		name: "P2: a phone that won't keep its screen on is told how to set it",
		phones: ["iphone", "android"],
		init: () => { Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: () => Promise.reject(new DOMException("Not allowed", "NotAllowedError")) } }); },
		async run(t) {
			await t.openGoLive();
			await t.startCamera();
			const tip = t.phone === "iphone" ? /Auto-Lock to Never/ : /Screen timeout/;
			await t.until(async () => tip.test(await t.text(SEL.msg)), "the page to say how to keep the screen on");
		},
	},
	{
		name: "P7, P16: an upright picture says how to fix it in the phone's own words, before any tap",
		phones: ALL,
		async run(t) {
			await t.openGoLive();
			await t.startCamera();
			await t.picture(720, 1280);
			const said = await t.text(SEL.status);
			t.check(UPRIGHT[t.phone].test(said), `the camera screen to say how (got "${said}")`);
			t.check(/Portrait Orientation Lock off/.test(await t.text(".weblive .steps")), "the card's steps to say Portrait Orientation Lock off");
		},
	},
	{
		name: "P8: once live, the message line under the card is clear",
		phones: ["android"],
		async run(t) {
			t.harness.answer(LIVE_ROUTE, firstTimes(1, refuse("Stream isn't answering just now."), usualStart));
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(async () => /isn't answering/.test(await t.text(SEL.msg)), "a message under the card");
			await t.until(() => t.page.locator(SEL.live).isEnabled(), "Go live to be tappable again");
			await t.tap(SEL.live);
			await t.until(async () => (await t.text(SEL.status)).startsWith("● LIVE"), "live");
			const said = await t.text(SEL.msg);
			t.check(said === "", `the old message gone (got "${said}")`);
		},
	},
	{
		name: "Pause and Resume for half-time",
		phones: ALL,
		async run(t) {
			await t.goLive();
			await t.tap(SEL.pause);
			await t.until(async () => /PAUSED/.test(await t.text(SEL.status)), "the camera screen to say paused");
			t.check(await t.page.locator(SEL.cam).evaluate((el) => el.classList.contains("paused")), "the yellow paused frame");
			t.check(await t.visible(SEL.resume) && !(await t.visible(SEL.pause)), "Resume instead of Pause");
			await t.tap(SEL.resume);
			await t.until(async () => (await t.text(SEL.status)).startsWith("● LIVE"), "live again after Resume");
		},
	},
	{
		name: "Stop asks first: Keep streaming carries on",
		phones: ALL,
		async run(t) {
			await t.goLive();
			await t.tap(SEL.stop);
			t.check(await t.visible('[data-stopask]') && !(await t.visible(SEL.stop)), "Yes, end game and Keep streaming instead of End game");
			await t.tap(SEL.stopNo);
			t.check(await t.visible(SEL.stop) && !(await t.visible('[data-stopask]')), "End game back");
			t.check(t.harness.calls(`POST /api/live/${GAME_ID}/end`).length === 0, "nothing stopped");
			t.check((await t.text(SEL.status)).startsWith("● LIVE"), "still live");
		},
	},
	{
		name: "Stop under a minute: a test, thrown away and not uploaded",
		phones: ALL,
		async run(t) {
			t.harness.answer(`POST /api/live/${GAME_ID}/end`, () => ({ status: 200, json: { ok: true, data: { status: "test", seconds: 12 } } }));
			await t.goLive();
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			await t.until(async () => /only 12 seconds.*test/.test(await t.text(SEL.saving)), "the page to say it was a test");
			t.check(t.harness.completed === null, "the recording never completed");
			t.check(!(await t.visible(SEL.cam)), "the camera closed");
		},
	},
	{
		name: "End game: the recording finishes uploading, in order, and says Saved",
		phones: ALL,
		async run(t) {
			await t.goLive();
			await t.until(() => t.harness.parts.size >= 2, "some recording uploaded", 20_000);
			// Sideways on the tripod, as at the final buzzer, and the page behind the camera at its top (where a real phone has it).
			await t.page.setViewportSize({ width: 915, height: 412 });
			await t.page.evaluate(() => scrollTo(0, 0));
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			await t.until(async () => /^Saved!/.test(await t.text(SEL.saving)), "Saved", 30_000);
			await t.page.waitForTimeout(2500);
			t.check(/^Saved!/.test(await t.text(SEL.saving)), "Saved still showing 2.5 seconds later (P17: nothing puts Saving back)");
			const seen = await t.page.evaluate((sel) => { const r = document.querySelector(sel).closest("[data-saving]").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, SEL.saving);
			t.check(seen, "Saving is on screen without scrolling (it once needed a scroll to find)");
			const done = t.harness.completed ?? [];
			t.check(done.length >= 2 && done.every((p, i) => p.partNumber === i + 1 && p.etag === `"etag-${i + 1}"`), "every part completed in order with its ETag");
			t.check(done.length === t.harness.parts.size, "nothing left out or extra");
		},
	},
	{
		name: "a recording part that fails twice is sent again, and the video still completes",
		phones: ["android"],
		async run(t) {
			let fails = 0;
			t.harness.answer(`PUT /r2/${VIDEO_ID}/2`, () => (fails++ < 2 ? { status: 503, json: {} } : { status: 200, etag: '"etag-2"' }));
			await t.goLive();
			await t.until(() => fails >= 3, "part 2 tried a third time", 30_000);
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			await t.until(async () => /^Saved!/.test(await t.text(SEL.saving)), "Saved", 30_000);
			t.check(t.harness.completed.some((p) => p.partNumber === 2 && p.etag === '"etag-2"'), "part 2 completed");
		},
	},
	{
		name: "signed out mid-game: the camera screen says the recording has stopped saving",
		phones: ["android"],
		async run(t) {
			await t.goLive();
			t.harness.answer(`POST /api/uploads/${VIDEO_ID}/part-urls`, () => ({ status: 401, json: { ok: false, error: { code: "unauthenticated", message: "Sign in again" } } }));
			await t.until(async () => /recording has stopped saving: signed out/.test(await t.text(SEL.status)), "the camera screen to say so", 30_000);
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			// P15: what to do, in the words for this page (not the upload page's "choose the same video").
			await t.until(async () => /signed out.*sign in.*Save what was recorded/.test(await t.text(SEL.saving)), "Saving to say how to save what reached the site", 15_000);
			t.check(!/choose the same video/.test(await t.text(SEL.saving)), "no upload page wording");
		},
	},
	{
		name: "the live connection is refused twice, then comes back by itself",
		phones: ["android", "firefox"],
		async run(t) {
			let tries = 0;
			t.harness.answer(`POST /whip/${GAME_ID}`, async ({ text }) => (tries++ < 2 ? { status: 503, json: {} } : { status: 201, sdp: await t.bridge.answerWhip(text), location: `http://127.0.0.1:8799/whip/${GAME_ID}/session/9` }));
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(async () => /Reconnecting/.test(await t.text(SEL.status)), "the camera screen to say it's reconnecting");
			await t.until(t.arriving, "the live stream to come back", 30_000);
			await t.until(async () => /Families can watch/.test(await t.text(SEL.status)), "the camera screen to say families can watch", 15_000);
		},
	},
	{
		name: "the camera stops while live (locked, a call, another app): nothing ends, families see Game break, and Resume camera carries on in the same video",
		phones: ALL,
		async run(t) {
			await t.goLive();
			const first = await t.page.evaluate(() => document.querySelector("[data-cam] video").srcObject.getVideoTracks()[0].id);
			await cameraStops(t);
			await t.until(async () => /CAMERA STOPPED/.test(await t.text(SEL.status)) && await t.visible(SEL.recam), "the camera screen to say the camera stopped, with Resume camera", 15_000);
			t.check(t.harness.calls(`POST /api/live/${GAME_ID}/end`).length === 0, "the stream not ended");
			t.check(await t.visible(SEL.stop) && !(await t.visible(SEL.pause)), "End game still there, and no Pause while the camera's gone");
			await t.tap(SEL.recam);
			await t.until(async () => (await t.text(SEL.status)).startsWith("● LIVE"), "live again after Resume camera");
			const now = await t.page.evaluate(() => { const v = document.querySelector("[data-cam] video").srcObject.getVideoTracks()[0]; return { id: v.id, state: v.readyState }; });
			t.check(now.id !== first && now.state === "live", "a new camera in the picture");
			await t.page.waitForTimeout(3000);
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			await t.until(async () => /saved/i.test(await t.text(SEL.saving)) && t.harness.completed, "the game saved", 30_000);
			t.check(t.harness.calls(LIVE_ROUTE).length === 1, "one recording, started once");
			const numbers = t.harness.completed.map((p) => p.partNumber);
			t.check(numbers.every((n, i) => n === i + 1), `its parts in one run from the start (${numbers.join(",")})`);
			const [end] = t.harness.calls(`POST /api/live/${GAME_ID}/end`);
			t.check(end?.json?.cause === "tapped", `End game tapped, not the camera (${end?.json?.cause})`);
		},
	},
	{
		name: "Resume camera while a call still has the camera: it says so, families stay on Game break, and the next tap brings it back",
		phones: ALL,
		async run(t) {
			await t.goLive();
			await cameraStops(t);
			await t.until(() => t.visible(SEL.recam), "Resume camera", 15_000);
			await t.page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Could not start video source", "NotReadableError")); });
			await t.tap(SEL.recam);
			await t.until(async () => /CAMERA STOPPED.*a call or another app may still have it.*Game break/.test(await t.text(SEL.status)), "the camera screen to say a call or another app may still have it");
			t.check(await t.visible(SEL.recam) && await t.visible(SEL.stop), "Resume camera and End game still there");
			await t.page.evaluate(() => { delete navigator.mediaDevices.getUserMedia; });
			await t.tap(SEL.recam);
			await t.until(async () => (await t.text(SEL.status)).startsWith("● LIVE"), "live again on the second tap");
			t.check(t.harness.calls(`POST /api/live/${GAME_ID}/end`).length === 0, "the stream never ended");
		},
	},
	{
		name: "the page hidden a while (locked, another app) with the camera still there: families see Game break, it's left out of the recording, and it carries on by itself",
		phones: ALL,
		async run(t) {
			await t.goLive();
			const liveAt = Date.now();
			await t.page.waitForTimeout(2000);
			const hidden = (on) => t.page.evaluate((on) => {
				Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (on ? "hidden" : "visible") });
				document.dispatchEvent(new Event("visibilitychange"));
			}, on);
			await hidden(true);
			const hiddenAt = Date.now();
			await t.until(() => t.page.evaluate(() => document.querySelector("[data-cam]").classList.contains("paused")), "Game break while the page is hidden");
			await t.page.waitForTimeout(4000);
			await hidden(false);
			const backAt = Date.now();
			await t.until(() => t.page.evaluate(() => !document.querySelector("[data-cam]").classList.contains("paused")), "the camera picture back by itself");
			await t.page.waitForTimeout(4000); // past the 3-second check for a camera still off
			t.check(!(await t.visible(SEL.recam)) && (await t.text(SEL.status)).startsWith("● LIVE"), "no Resume camera needed: live again");
			await t.page.waitForTimeout(1000);
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			await t.until(() => t.harness.calls(`POST /api/live/${GAME_ID}/end`).length > 0, "End game sent");
			const live = (hiddenAt - liveAt + Date.now() - backAt) / 1000;
			const [end] = t.harness.calls(`POST /api/live/${GAME_ID}/end`);
			t.check(end?.json?.recordedSeconds <= Math.ceil(live) + 1, `the hidden stretch left out (sent ${end?.json?.recordedSeconds}, ${live.toFixed(1)} s visible)`);
		},
	},
	{
		name: "End game while Resume camera is still asking for the camera: the camera that turns up late is switched off",
		phones: ALL,
		async run(t) {
			await t.goLive();
			await cameraStops(t);
			await t.until(() => t.visible(SEL.recam), "Resume camera", 15_000);
			await t.page.evaluate(() => {
				const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
				navigator.mediaDevices.getUserMedia = (c) => new Promise((resolve) => { window.giveCamera = async () => { window.lateCamera = await real(c); resolve(window.lateCamera); }; });
			});
			await t.tap(SEL.recam);
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			await t.until(() => t.harness.calls(`POST /api/live/${GAME_ID}/end`).length > 0, "End game sent");
			await t.page.evaluate(() => window.giveCamera());
			await t.until(() => t.page.evaluate(() => window.lateCamera?.getTracks().every((tr) => tr.readyState === "ended")), "the late camera switched off");
			await t.until(async () => /saved/i.test(await t.text(SEL.saving)), "the game saved", 30_000);
		},
	},
	{
		name: "the camera goes quiet with the page still showing (muted, Android's way): Game break, then Resume camera brings it back",
		// Firefox never delivers a mute event a test makes up, so it can't be tried there.
		phones: ["android", "iphone"],
		async run(t) {
			await t.goLive();
			await t.page.evaluate(() => {
				const track = document.querySelector("[data-cam] video").srcObject.getVideoTracks()[0];
				Object.defineProperty(track, "muted", { configurable: true, get: () => true });
				track.dispatchEvent(new Event("mute"));
			});
			await t.until(() => t.page.evaluate(() => document.querySelector("[data-cam]").classList.contains("paused")), "Game break at once");
			await t.until(async () => /CAMERA STOPPED/.test(await t.text(SEL.status)) && await t.visible(SEL.recam), "Resume camera once it's stayed off", 10_000);
			await t.tap(SEL.recam);
			await t.until(async () => (await t.text(SEL.status)).startsWith("● LIVE"), "live again after Resume camera");
			t.check(t.harness.calls(`POST /api/live/${GAME_ID}/end`).length === 0, "the stream never ended");
		},
	},
	{
		name: "the camera stops during a break: once it's back the break carries on, and neither the break nor the gap is in the recording",
		phones: ALL,
		async run(t) {
			await t.goLive();
			const liveAt = Date.now();
			await t.page.waitForTimeout(2000);
			await t.tap(SEL.pause);
			await t.until(async () => /PAUSED/.test(await t.text(SEL.status)), "the camera screen to say paused");
			const before = (Date.now() - liveAt) / 1000;
			await cameraStops(t);
			await t.until(async () => /CAMERA STOPPED/.test(await t.text(SEL.status)), "the camera screen to say the camera stopped", 15_000);
			await t.page.waitForTimeout(3000);
			await t.tap(SEL.recam);
			await t.until(async () => /PAUSED/.test(await t.text(SEL.status)) && await t.visible(SEL.resume), "still on its break once the camera's back, with Resume");
			await t.page.waitForTimeout(3000);
			await t.tap(SEL.resume);
			const resumedAt = Date.now();
			await t.until(async () => (await t.text(SEL.status)).startsWith("● LIVE"), "live after Resume");
			await t.page.waitForTimeout(2000);
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			await t.until(() => t.harness.calls(`POST /api/live/${GAME_ID}/end`).length > 0, "End game sent");
			const after = (Date.now() - resumedAt) / 1000;
			const [end] = t.harness.calls(`POST /api/live/${GAME_ID}/end`);
			t.check(end?.json?.recordedSeconds <= Math.ceil(before + after) + 2, `the break and the gap left out (sent ${end?.json?.recordedSeconds}, ${(before + after).toFixed(1)} s live)`);
		},
	},
	{
		name: "the phone's notes reach the site the moment the page is hidden (a lock), not up to 30 seconds later",
		phones: ALL,
		async run(t) {
			await t.goLive();
			const before = t.harness.calls(`POST /api/live/${GAME_ID}/events`).length;
			await t.page.evaluate(() => {
				Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
				document.dispatchEvent(new Event("visibilitychange"));
			});
			await t.until(() => t.harness.calls(`POST /api/live/${GAME_ID}/events`).slice(before).some((c) => c.json?.events?.some((e) => e.what === "page hidden")),
				"the notes sent as the page hid", 5_000);
		},
	},
	{
		name: "P9: Saving never hangs on a recorder that doesn't stop",
		phones: ["android"],
		init: () => { MediaRecorder.prototype.stop = function stop() {}; },
		async run(t) {
			await t.goLive();
			await t.until(() => t.harness.parts.size >= 1, "some recording uploaded", 20_000);
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			await t.until(async () => /^Saved!|couldn't be saved/.test(await t.text(SEL.saving)), "Saving to finish one way or the other", 30_000);
		},
	},
	{
		name: "a recording this phone made (its page was closed) can be saved",
		phones: ALL,
		init: () => { try { if (location.port === "8799") localStorage.setItem("courtside-live:7", JSON.stringify({ videoId: 41, partSize: 8388608, etags: { 1: '"e1"' } })); } catch { /* about:blank */ } },
		async run(t) {
			await t.openGoLive({ recordingVideoId: VIDEO_ID });
			await t.until(() => t.visible("[data-recover-carry]"), "the page to say it was closed mid-game");
			t.check(!(await t.visible(SEL.camera)), "no Start camera while there's a recording to save");
			await t.tap(SEL.save);
			await t.until(async () => /^Saved\./.test(await t.text(SEL.recoverMsg)), "Saved");
			t.check(t.harness.calls(`POST /api/live/${GAME_ID}/save`).length === 1, "the site asked to save it");
		},
	},
	{
		name: "Save what was recorded waits while the last of the recording is still arriving, then saves by itself",
		phones: ["iphone"],
		init: () => { try { if (location.port === "8799") localStorage.setItem("courtside-live:7", JSON.stringify({ videoId: 41, partSize: 8388608, etags: { 1: '"e1"' } })); } catch { /* about:blank */ } },
		async run(t) {
			const sending = { status: 200, json: { ok: true, data: { status: "sending", retryIn: 1 } } };
			t.harness.answer(`POST /api/live/${GAME_ID}/save`, firstTimes(1, sending, () => ({ status: 200, json: { ok: true, data: { status: "saved" } } })));
			await t.openGoLive({ recordingVideoId: VIDEO_ID });
			await t.until(() => t.visible("[data-recover-carry]"), "the page to say it was closed mid-game");
			await t.tap(SEL.save);
			await t.until(async () => /still arriving/.test(await t.text(SEL.recoverMsg)), "the page to say it's waiting for the last of the recording");
			t.check(await t.page.locator(SEL.save).isDisabled(), "Save what was recorded can't be tapped again while it waits");
			await t.until(async () => /^Saved\./.test(await t.text(SEL.recoverMsg)), "Saved, by itself");
			t.check(t.harness.calls(`POST /api/live/${GAME_ID}/save`).length === 2, `asked again after the wait (${t.harness.calls(`POST /api/live/${GAME_ID}/save`).length} asks)`);
			t.check(!(await t.visible(SEL.save)), "the buttons go once it's saved");
		},
	},
	{
		name: "the filmer's recording from another phone can be deleted here to start again",
		phones: ["android"],
		async run(t) {
			await t.openGoLive({ recordingVideoId: VIDEO_ID, mine: true });
			await t.until(() => t.visible("[data-recover-other]"), "the page to say the recording isn't on this phone");
			await t.tap('[data-act="discard"]');
			await t.until(() => t.harness.calls(`POST /api/uploads/${VIDEO_ID}/abort`).length === 1, "the recording deleted");
		},
	},
	{
		name: "the page closed mid-game: Carry on streaming on the same phone restarts the camera, the live picture and the recording into segment 2",
		phones: ALL,
		init: () => { try { if (location.port === "8799") localStorage.setItem("courtside-live:7", JSON.stringify({ videoId: 41, partSize: 131072, etags: { 1: '"e1"', 2: '"e2"' }, segment: 1 })); } catch { /* about:blank */ } },
		async run(t) {
			t.harness.answer(`POST /api/live/${GAME_ID}/continue`, () => ({ status: 201, json: { ok: true, data: { segment: 2, videoId: VIDEO_ID, partSize: 128 * 1024, whipUrl: `http://127.0.0.1:8799/whip/${GAME_ID}` } } }));
			await t.openGoLive({ recordingVideoId: VIDEO_ID });
			await t.until(() => t.visible(SEL.continue), "Carry on streaming to be offered");
			t.check(!(await t.visible(SEL.camera)), "no Start camera: Carry on starts it");
			t.check((await t.text(SEL.save)) === "End game and save what was recorded", "Save is named as ending the game while Carry on is offered");
			await t.tap(SEL.continue);
			// The camera starts, and the red button is Carry on: that tap makes the sound and streams, as Go live would.
			await t.until(() => t.visible(SEL.live), "the camera preview with the Carry on button");
			t.check((await t.text(SEL.live)).trim() === "Carry on", `the red button saying Carry on (it says "${await t.text(SEL.live)}")`);
			t.check(!(await t.visible(SEL.camera)), "still no Start camera");
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(async () => /LIVE/.test(await t.text(SEL.status)), "the live picture to be going again", 30_000);
			await t.until(() => t.harness.calls(`POST /api/uploads/${VIDEO_ID}/part-urls`).some((c) => c.json?.segment === 2), "parts to go to segment 2", 30_000);
			t.check(t.harness.calls(`POST /api/live/${GAME_ID}/browser`).length === 0, "Go live isn't asked for a new recording");
			const state = await t.page.evaluate(() => JSON.parse(localStorage.getItem("courtside-live:7")));
			t.check(state.segment === 2 && !Object.values(state.etags).includes('"e1"'), `the phone remembers segment 2 afresh, not segment 1's parts (${JSON.stringify(state)})`);
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			await t.until(async () => /^Saved!/.test(await t.text(SEL.saving)), "Saved", 30_000);
			t.check(t.harness.calls(`POST /api/uploads/${VIDEO_ID}/complete`).some((c) => c.json?.segment === 2), "End game completes segment 2");
		},
	},
	{
		name: "the page closed mid-game: the reopened page has Carry on streaming on screen, with nothing to scroll for",
		phones: ALL,
		init: () => { try { if (location.port === "8799") localStorage.setItem("courtside-live:7", JSON.stringify({ videoId: 41, partSize: 131072, etags: { 1: '"e1"' }, segment: 1 })); } catch { /* about:blank */ } },
		async run(t) {
			await t.openGoLive({ recordingVideoId: VIDEO_ID });
			await t.until(() => t.visible(SEL.continue), "Carry on streaming to be offered");
			await t.until(() => t.onScreen(SEL.continue), "Carry on streaming to be on screen", 5000);
			t.check(await t.onScreen("[data-recover-carry]"), "what happened, and what Carry on does, on screen above it");
			// A short screen can't hold it all under the site's bar: the button is what stays on screen.
			await t.page.setViewportSize({ width: 360, height: 480 });
			await t.openGoLive({ recordingVideoId: VIDEO_ID });
			await t.until(() => t.onScreen(SEL.continue), "Carry on streaming to be on screen on a short screen", 5000);
		},
	},
	{
		name: "Carry on waits while the last of the recording is still arriving, then goes",
		phones: ["iphone"],
		init: () => { try { if (location.port === "8799") localStorage.setItem("courtside-live:7", JSON.stringify({ videoId: 41, partSize: 131072, etags: { 1: '"e1"' }, segment: 1 })); } catch { /* about:blank */ } },
		async run(t) {
			const wait = { status: 200, json: { ok: true, data: { status: "sending", retryIn: 2, waitLeft: 65 } } };
			t.harness.answer(`POST /api/live/${GAME_ID}/continue`, firstTimes(1, wait, () => ({ status: 201, json: { ok: true, data: { segment: 2, videoId: VIDEO_ID, partSize: 128 * 1024, whipUrl: `http://127.0.0.1:8799/whip/${GAME_ID}` } } })));
			await t.openGoLive({ recordingVideoId: VIDEO_ID });
			await t.until(() => t.visible(SEL.continue), "Carry on streaming to be offered");
			await t.tap(SEL.continue);
			await t.until(async () => /still arriving/.test(await t.text(SEL.recoverMsg)), "the page to say it's waiting");
			await t.until(async () => /^Carrying on in 1:0\d…$/.test((await t.text(SEL.continue)).trim()), `the button counting the wait down (it says "${await t.text(SEL.continue)}")`);
			await t.until(() => t.visible(SEL.live), "then the camera preview with Carry on", 30_000);
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(async () => /LIVE/.test(await t.text(SEL.status)), "then to go live", 30_000);
			t.check(t.harness.calls(`POST /api/live/${GAME_ID}/continue`).length === 2, "asked again after the wait");
		},
	},
	{
		name: "what the closed page kept on the phone goes up when it carries on: the missing part and the tail, as segment 1's last parts, before End game completes",
		phones: ALL,
		init: () => { try { if (location.port === "8799") localStorage.setItem("courtside-live:7", JSON.stringify({ videoId: 41, partSize: 131072, etags: { 1: '"e1"', 2: '"e2"' }, segment: 1 })); } catch { /* about:blank */ } },
		async run(t) {
			// Segment 2's parts are big, so none of its own lands under 3 or 4 while the kept ones are checked.
			t.harness.answer(`POST /api/live/${GAME_ID}/continue`, () => ({ status: 201, json: { ok: true, data: { segment: 2, videoId: VIDEO_ID, partSize: 8 * 1024 * 1024, whipUrl: `http://127.0.0.1:8799/whip/${GAME_ID}` } } }));
			await t.openGoLive({ recordingVideoId: VIDEO_ID });
			await keepOnPhone(t, "41/1", { parts: [[3, 131072]], tail: [20000, 30000] });
			await t.page.reload();
			await t.until(async () => /still on this phone/.test(await t.text(SEL.recoverMsg)), "the page to say what the closed page kept");
			await t.tap(SEL.continue);
			await t.until(() => t.visible(SEL.live), "the camera preview with the Carry on button");
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(async () => /LIVE/.test(await t.text(SEL.status)), "the live picture to be going again", 30_000);
			await t.until(() => t.harness.parts.has(3) && t.harness.parts.has(4), "the kept part and the tail to reach storage as segment 1's parts 3 and 4", 30_000);
			t.check(t.harness.parts.get(3).length === 131072 && t.harness.parts.get(4).length === 50000, `part 3 whole and part 4 the tail (${t.harness.parts.get(3)?.length}, ${t.harness.parts.get(4)?.length} bytes)`);
			t.check(t.harness.calls(`POST /api/uploads/${VIDEO_ID}/part-urls`).some((c) => c.json?.segment === 1 && c.json.partNumbers[0] === 4), "the tail asked for as segment 1's part 4");
			await t.tap(SEL.stop);
			await t.tap(SEL.stopYes);
			await t.until(async () => /^Saved!/.test(await t.text(SEL.saving)), "Saved", 30_000);
			t.check(await keptOnPhone(t, "41/1") === 0, "nothing of segment 1 left on the phone");
		},
	},
	{
		name: "the page closed again while what the first page kept was still going up: the next page sends it, still as segment 1's parts",
		phones: ALL,
		// Seeded once: the pages after it remember for themselves, as a phone's do.
		init: () => { try { if (location.port === "8799" && !localStorage.getItem("seeded")) { localStorage.setItem("seeded", "1"); localStorage.setItem("courtside-live:7", JSON.stringify({ videoId: 41, partSize: 131072, etags: { 1: '"e1"', 2: '"e2"' }, segment: 1 })); } } catch { /* about:blank */ } },
		async run(t) {
			t.harness.answer(`POST /api/live/${GAME_ID}/continue`, () => ({ status: 201, json: { ok: true, data: { segment: 2, videoId: VIDEO_ID, partSize: 8 * 1024 * 1024, whipUrl: `http://127.0.0.1:8799/whip/${GAME_ID}` } } }));
			// A weak signal: the kept part never gets through on the page that carried on, so it's still on the phone when
			// that page closes too.
			let through = false;
			t.harness.answer("PUT /r2/41/3", () => (through ? { status: 200, etag: '"etag-3"' } : "drop"));
			await t.openGoLive({ recordingVideoId: VIDEO_ID });
			await keepOnPhone(t, "41/1", { parts: [[3, 131072]], tail: [20000, 30000] });
			await t.page.reload();
			await t.until(async () => /still on this phone/.test(await t.text(SEL.recoverMsg)), "the page to say what the closed page kept");
			await t.tap(SEL.continue);
			await t.until(() => t.visible(SEL.live), "the camera preview with the Carry on button");
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(async () => /LIVE/.test(await t.text(SEL.status)), "the live picture to be going again", 30_000);
			await t.until(() => t.harness.calls("PUT /r2/41/3").length > 0, "the kept part to be tried", 30_000);
			t.page.once("dialog", (d) => d.accept());
			await t.page.reload();
			through = true;
			await t.until(async () => /still on this phone/.test(await t.text(SEL.recoverMsg)), "the next page to say what's still on the phone");
			await t.tap(SEL.save);
			await t.until(async () => /^Saved\./.test(await t.text(SEL.recoverMsg)), "Saved", 30_000);
			const third = t.harness.calls("PUT /r2/41/3").at(-1), tail = t.harness.calls("PUT /r2/41/4");
			t.check(third.bytes === 131072 && tail.length === 1 && tail[0].bytes === 50000, `segment 1's kept part and its tail as part 4 reached storage (${third.bytes} bytes, ${tail.map((c) => c.bytes)})`);
			t.check(t.harness.calls(`POST /api/uploads/${VIDEO_ID}/part-urls`).some((c) => c.json?.segment === 1 && c.json.partNumbers[0] === 4), "the tail asked for as segment 1's part 4");
			const saves = t.harness.calls(`POST /api/live/${GAME_ID}/save`);
			t.check(saves.length === 1 && saves[0].at > tail[0].at, "the site asked to save it once segment 1's parts were up");
			t.check(await keptOnPhone(t, "41/1") === 0 && await keptOnPhone(t, "41/2") === 0, "nothing of either segment left on the phone");
		},
	},
	{
		name: "the page closed at the camera's prompt after Carry on streaming, a kept part already up: the tail still goes up after it, not over it",
		phones: ALL,
		init: () => { try { if (location.port === "8799" && !localStorage.getItem("seeded")) { localStorage.setItem("seeded", "1"); localStorage.setItem("courtside-live:7", JSON.stringify({ videoId: 41, partSize: 131072, etags: { 1: '"e1"', 2: '"e2"' }, segment: 1 })); } } catch { /* about:blank */ } },
		async run(t) {
			t.harness.answer(`POST /api/live/${GAME_ID}/continue`, () => ({ status: 201, json: { ok: true, data: { segment: 2, videoId: VIDEO_ID, partSize: 8 * 1024 * 1024, whipUrl: `http://127.0.0.1:8799/whip/${GAME_ID}` } } }));
			// The kept part gets through and the tail doesn't, before the page closes without streaming again.
			let through = false;
			t.harness.answer("PUT /r2/41/4", () => (through ? { status: 200, etag: '"etag-4"' } : "drop"));
			await t.openGoLive({ recordingVideoId: VIDEO_ID });
			await keepOnPhone(t, "41/1", { parts: [[3, 131072]], tail: [20000, 30000] });
			await t.page.reload();
			await t.until(async () => /still on this phone/.test(await t.text(SEL.recoverMsg)), "the page to say what the closed page kept");
			await t.tap(SEL.continue);
			await t.until(() => t.visible(SEL.live), "the camera preview with the Carry on button");
			await t.until(() => t.harness.calls("PUT /r2/41/4").length > 0, "the kept part to be up and the tail tried", 30_000);
			t.page.once("dialog", (d) => d.accept());
			await t.page.reload();
			through = true;
			await t.until(async () => /still on this phone/.test(await t.text(SEL.recoverMsg)), "the next page to say what's still on the phone");
			// Known in the game's own note before anything is sent: a page closed now would still number the tail after it.
			const noted = await t.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("courtside-live:7")).etags).join());
			t.check(noted === "1,2,3", `the game's note knows the part that went up (parts ${noted})`);
			await t.tap(SEL.save);
			await t.until(async () => /^Saved\./.test(await t.text(SEL.recoverMsg)), "Saved", 30_000);
			const third = t.harness.calls("PUT /r2/41/3"), tail = t.harness.calls("PUT /r2/41/4").at(-1);
			t.check(third.every((c) => c.bytes === 131072) && tail.bytes === 50000, `part 3 still the kept part and the tail part 4 (part 3: ${third.map((c) => c.bytes)} bytes, part 4: ${tail.bytes})`);
			t.check(await keptOnPhone(t, "41/1") === 0, "nothing left on the phone");
		},
	},
	{
		name: "Save what was recorded after a closed page sends what the phone kept first, then has the site save it",
		phones: ["iphone", "android"],
		init: () => { try { if (location.port === "8799") localStorage.setItem("courtside-live:7", JSON.stringify({ videoId: 41, partSize: 131072, etags: { 1: '"e1"' }, segment: 1 })); } catch { /* about:blank */ } },
		async run(t) {
			await t.openGoLive({ recordingVideoId: VIDEO_ID, ended: true });
			await keepOnPhone(t, "41/1", { parts: [[2, 131072]], tail: [40000] });
			await t.page.reload();
			await t.until(async () => /still on this phone/.test(await t.text(SEL.recoverMsg)), "the page to say what the closed page kept");
			await t.tap(SEL.save);
			await t.until(async () => /^Saved\./.test(await t.text(SEL.recoverMsg)), "Saved", 30_000);
			t.check(t.harness.parts.get(2)?.length === 131072 && t.harness.parts.get(3)?.length === 40000, "the kept part and the tail reached storage");
			const saves = t.harness.calls(`POST /api/live/${GAME_ID}/save`), puts = t.harness.calls("PUT /r2/41/3");
			t.check(saves.length === 1 && puts.length === 1 && saves[0].at > puts[0].at, "the site asked to save it once the kept parts were up");
			t.check(await keptOnPhone(t, "41/1") === 0, "nothing left on the phone");
		},
	},
	{
		name: "no Carry on for an ended stream: only Save what was recorded",
		phones: ["android"],
		init: () => { try { if (location.port === "8799") localStorage.setItem("courtside-live:7", JSON.stringify({ videoId: 41, partSize: 131072, etags: { 1: '"e1"' }, segment: 1 })); } catch { /* about:blank */ } },
		async run(t) {
			await t.openGoLive({ recordingVideoId: VIDEO_ID, ended: true });
			await t.until(() => t.visible("[data-recover-here]"), "the recover card");
			t.check(!(await t.visible(SEL.continue)), "an ended stream can't carry on");
			t.check(!(await t.visible('[data-act="discard"]')), "nor be deleted");
			t.check((await t.text(SEL.save)) === "Save what was recorded", "Save keeps its plain name");
		},
	},
	{
		name: "no Carry on on another phone of the filmer's: Save what was recorded, or delete it",
		phones: ["android"],
		async run(t) {
			await t.openGoLive({ recordingVideoId: VIDEO_ID, mine: true });
			await t.until(() => t.visible("[data-recover-other]"), "the other-phone card");
			t.check(!(await t.visible(SEL.continue)), "another phone can't carry on");
			t.check(await t.visible('[data-act="discard"]'), "but can delete it and start again");
		},
	},
	{
		name: "Home Screen app: pulling down from the top of a page reloads it",
		phones: ["iphone", "android"],
		init: homeScreenApp,
		async run(t) {
			await t.openGoLive();
			await t.page.evaluate(() => { window.notReloaded = true; });
			await pull(t, 120, false);
			t.check(/Let go to refresh/.test(await t.text(".pullhint")), "the hint to say let go to refresh");
			await Promise.all([t.page.waitForEvent("load"), pull(t, 120, true)]);
			t.check(!(await t.page.evaluate(() => window.notReloaded)), "the page reloaded");
		},
	},
	{
		name: "in Safari or Chrome there's no added pull to refresh (the browser has its own)",
		phones: ["iphone", "android"],
		async run(t) {
			await t.openGoLive();
			t.check((await t.page.locator(".pullhint").count()) === 0, "no pull hint outside the app");
		},
	},
	{
		name: "fits the screen held upright and sideways, before and during the stream",
		phones: ["iphone", "android"],
		async run(t) {
			const fits = () => t.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
			for (const [w, h] of [[390, 844], [844, 390]]) {
				await t.page.setViewportSize({ width: w, height: h });
				await t.openGoLive();
				t.check(await fits(), `no sideways scroll at ${w}x${h} before going live`);
			}
			await t.goLive();
			t.check(await fits(), "no sideways scroll while live (sideways)");
			t.check(await t.onScreen(SEL.stop), "End game on screen sideways");
			await t.page.setViewportSize({ width: 390, height: 844 });
			t.check(await t.onScreen(SEL.stop), "End game on screen upright");
		},
	},
];
