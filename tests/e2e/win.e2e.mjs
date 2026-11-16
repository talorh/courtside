// The win pop-up on a game's page (src/features/scores/views/win-pop.ts, public/win.js): about a second over
// the page, confetti on its canvases, nothing to tap, then gone by itself, under the site's own Content-Security-Policy.
import { CLIP_ID, gamePageWithClip } from "./pages.mjs";

// Watches the pop-up from before the page's own scripts run: how solid it got, what was drawn, and when it left.
const watchPopUp = () => {
	window.win = { there: false, peak: 0, taps: "", frames: 0, pieces: 0, gone: false };
	const ctx = CanvasRenderingContext2D.prototype, { clearRect, fillRect, arc } = ctx;
	ctx.clearRect = function (...a) { window.win.frames++; return clearRect.apply(this, a); };
	ctx.fillRect = function (...a) { window.win.pieces++; return fillRect.apply(this, a); };
	ctx.arc = function (...a) { window.win.pieces++; return arc.apply(this, a); };
	const look = () => {
		const pop = document.querySelector(".winpop");
		if (pop) {
			const style = getComputedStyle(pop);
			window.win.there = true;
			window.win.peak = Math.max(window.win.peak, Number(style.opacity));
			window.win.taps = style.pointerEvents;
		} else if (window.win.there) window.win.gone = true;
		requestAnimationFrame(look);
	};
	requestAnimationFrame(look);
};

async function openWonGame(t) {
	t.harness.page("/game", () => gamePageWithClip(41, { win: true }));
	await t.page.goto(`${t.harness.url}/game`);
	await t.until(() => t.page.evaluate(() => window.win.gone), "the pop-up to go by itself");
	return t.page.evaluate(() => window.win);
}

export const scenarios = [
	{
		name: "the win pop-up: shows over the game page with confetti, lets taps through, and goes by itself",
		phones: ["android", "iphone", "firefox"],
		init: [watchPopUp],
		async run(t) {
			const win = await openWonGame(t);
			t.check(win.peak > 0.9, `the pop-up to show fully (its opacity reached ${win.peak})`);
			t.check(win.taps === "none", `taps to pass through the pop-up (pointer-events: ${win.taps})`);
			t.check(win.frames > 10 && win.pieces > 1000, `confetti drawn frame after frame (${win.frames} layer frames, ${win.pieces} pieces)`);
			t.check(await t.page.evaluate(() => document.querySelector(".winpop") === null), "the pop-up taken off the page");
			t.check(await t.visible(`[data-save-clip="${CLIP_ID}"]`), "the game page there to use underneath");
		},
	},
	{
		name: "the win pop-up with reduced motion: one still frame of confetti, then gone",
		phones: ["android", "iphone", "firefox"],
		context: { reducedMotion: "reduce" },
		init: [watchPopUp],
		async run(t) {
			const win = await openWonGame(t);
			t.check(win.peak > 0.9, `the pop-up to show fully (its opacity reached ${win.peak})`);
			t.check(win.frames === 2 && win.pieces > 100, `one still frame on each layer (${win.frames} layer frames, ${win.pieces} pieces)`);
		},
	},
];
