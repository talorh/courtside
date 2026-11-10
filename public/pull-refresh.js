// The site as a Home Screen app: pull down from the top of a page to reload it, as Safari and Chrome do (the app
// has no reload button of its own). Never while a job a reload would cut short is running
// (Go live's camera, an upload: awake.js marks the page busy) or while the camera fills the screen.
import { inWebApp } from "./webapp.js";

// How far the finger travels down before letting go reloads.
const PULL = 80;

/** What a drag from the top of the page means so far: nothing (too short, or sideways), "pull", or "release" (reload). */
export const pullState = (dy, dx) => (dy < 12 || Math.abs(dx) > dy ? "none" : dy < PULL ? "pull" : "release");

if (inWebApp()) setup();

function setup() {
	const hint = Object.assign(document.createElement("div"), { className: "pullhint", hidden: true });
	hint.setAttribute("role", "status");
	document.body.append(hint);
	const busy = () => document.documentElement.matches(".busy, .camfull");
	// Typing, picking, or a dialog: a drag there isn't a pull.
	const skip = (target) => Boolean(target.closest?.("input, textarea, select, [contenteditable], .scrim"));
	let start = null, state = "none";
	const show = () => {
		hint.hidden = state === "none";
		hint.classList.toggle("ready", state === "release");
		hint.textContent = state === "release" ? "↻ Let go to refresh" : "↓ Pull down to refresh";
	};
	const reset = () => { start = null; state = "none"; show(); };
	document.addEventListener("touchstart", (e) => {
		const t = e.touches[0];
		start = e.touches.length === 1 && window.scrollY <= 0 && !busy() && !skip(e.target) ? { x: t.clientX, y: t.clientY } : null;
		state = "none";
	}, { passive: true });
	document.addEventListener("touchmove", (e) => {
		if (!start || busy()) return reset();
		state = pullState(e.touches[0].clientY - start.y, e.touches[0].clientX - start.x);
		show();
	}, { passive: true });
	document.addEventListener("touchend", () => {
		if (!start || state !== "release" || busy()) return reset();
		hint.textContent = "Refreshing…";
		location.reload();
	}, { passive: true });
	document.addEventListener("touchcancel", reset, { passive: true });
}
