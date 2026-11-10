// Steps the browser tests share: tapping like a finger, waiting until something is true, and reading the Go live card.
import { GAME_ID, goLivePage } from "./pages.mjs";

export const SEL = {
	camera: '[data-act="camera"]', live: '[data-act="live"]', pause: '[data-act="pause"]', resume: '[data-act="resume"]',
	stop: '[data-act="stop"]', stopYes: '[data-act="stopyes"]', stopNo: '[data-act="stopno"]', save: '[data-act="save"]', recam: '[data-act="recam"]', continue: '[data-act="continue"]',
	cam: "[data-cam]", status: "[data-status]", msg: "[data-msg]", recoverMsg: "[data-recover-msg]", saving: "[data-saving-text]",
};

export function helpers({ page, harness, bridge, phone, errors }) {
	const t = {
		page, harness, bridge, phone, errors,
		/** Fails the test with `what` unless `ok`. */
		check(ok, what) {
			if (!ok) throw new Error(`expected ${what}`);
		},
		/** Checks every 100 ms until `fn` gives something truthy, and returns it; fails with `what` after `ms`. The waits
		 * are long enough for a busy computer (a release's full run in podman once took more than 10 s for the
		 * iPhone's camera to show a picture): a scenario that passes takes no longer, and one that's broken still fails. */
		async until(fn, what, ms = 20_000) {
			const end = Date.now() + ms;
			while (Date.now() < end) {
				const value = await fn();
				if (value) return value;
				await page.waitForTimeout(100);
			}
			throw new Error(`timed out after ${ms / 1000} s waiting for ${what}`);
		},
		tap: (selector) => page.tap(selector, { timeout: 15_000 }),
		text: async (selector) => ((await page.locator(selector).textContent()) ?? "").trim(),
		visible: (selector) => page.locator(selector).isVisible(),
		/** Opens the Go live page for game 7 (`goLivePage` options: a recording to save, the stream stopped). */
		async openGoLive(options) {
			harness.page("/golive", () => goLivePage(options));
			await page.goto(`${harness.url}/golive`);
		},
		/** Start camera, until the preview has a picture. WebKit's pretend camera (a canvas) can take a while to show one
		 * on a busy computer (over 30 s once, during a release with other work running), so this waits longest. */
		async startCamera() {
			await t.tap(SEL.camera);
			await t.until(() => page.evaluate(() => (document.querySelector("[data-cam] video")?.videoWidth ?? 0) > 0), "the camera preview to have a picture", 45_000);
		},
		/** The preview's picture reads w x h, as a phone's camera does depending on how it's held. */
		picture: (w, h) => page.evaluate(([width, height]) => {
			const v = document.querySelector("[data-cam] video");
			Object.defineProperty(v, "videoWidth", { get: () => width, configurable: true });
			Object.defineProperty(v, "videoHeight", { get: () => height, configurable: true });
			v.dispatchEvent(new Event("resize"));
		}, [w, h]),
		/** The camera fills the screen (the card's own full screen; html.camfull keeps a little scroll for Safari). */
		isFull: () => page.evaluate(() => document.querySelector("[data-cam]").classList.contains("full") && document.documentElement.classList.contains("camfull")),
		/** The element is all on screen, with nothing over its top or bottom edge (the bar that stays at the top of a
		 * phone's page, say). */
		onScreen: (selector) => page.locator(selector).evaluate((el) => {
			const r = el.getBoundingClientRect();
			if (!(r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth)) return false;
			return [r.top + 1, r.bottom - 1].every((y) => el.contains(document.elementFromPoint(r.left + r.width / 2, y)));
		}),
		/** How many times the page asked the site to start the stream. */
		starts: () => harness.calls(`POST /api/live/${GAME_ID}/browser`).length,
		/** The lines the page has sent to the site's logs. */
		logged: () => harness.calls(`POST /api/live/${GAME_ID}/events`).flatMap((c) => c.json.events.map((e) => e.what)),
		/**
		 * The live stream reaches the far end: picture frames, or on the iPhone runs the connection and its sound (WebKit
		 * on Linux can't encode a picture at all, even to itself: checked 23 Oct 2026; a real iPhone sends H.264).
		 */
		arriving: async () => {
			const got = await bridge.received();
			return phone === "iphone" ? got.connected > 0 && got.audio > 20 : got.frames > 10;
		},
		/** Opens Go live, starts the camera (sideways) and goes live, until the live stream reaches the far end. */
		async goLive() {
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(() => t.starts() === 1, "Go live to start the stream");
			await t.until(t.arriving, "the live stream to reach the far end", 20_000);
			await t.until(async () => (await t.text(SEL.status)).startsWith("● LIVE"), "the camera screen to say it's live");
		},
	};
	return t;
}
