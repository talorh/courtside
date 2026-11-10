// Go live: Pause and Resume (half-time, say). While paused nothing is recorded, and families watching see a
// Game Break card instead of the camera. Resume carries on in the same video, without the paused bit. The same card
// goes out, and the recording holds, while the camera's away (golive-recam.js), with no Pause or Resume until it's back.
import { pausedCard } from "./golive-slate.js";

/** Wires Pause and Resume for a stream in progress; `show()` redraws the status line (every second while paused). */
export function pauseControls({ btn, cam, live, rec, show }) {
	let card = null, since = 0, tick = null, onBreak = false, shown = true;
	const holds = new Set(); // why the camera's away: golive-recam.js
	const buttons = (visible) => {
		shown = visible;
		btn("pause").hidden = !visible || holds.size > 0 || onBreak;
		btn("resume").hidden = !visible || holds.size > 0 || !onBreak;
	};
	// One Game break card while on a break, the camera away, or both.
	const sync = () => {
		const want = onBreak || holds.size > 0;
		if (want && !card) {
			card = pausedCard();
			live.pause(card.track);
			tick = setInterval(show, 1000);
		} else if (!want && card) {
			live.resume();
			stopCard();
		}
		cam.classList.toggle("paused", want);
		buttons(shown);
		show();
	};
	const set = (on) => {
		if (on === onBreak) return;
		onBreak = on;
		if (on) since = Date.now();
		on ? rec.pause("break") : rec.resume("break");
		sync();
	};
	const stopCard = () => {
		card?.stop();
		card = null;
		clearInterval(tick);
	};
	btn("pause").onclick = () => set(true);
	btn("resume").onclick = () => set(false);
	buttons(true);
	return {
		/** How long it's been paused ("2:13"), or null when it isn't. */
		pausedFor() {
			if (!onBreak) return null;
			const secs = Math.floor((Date.now() - since) / 1000);
			return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
		},
		/** Families see the Game break card (a break, or the camera away). */
		carded: () => card !== null,
		/** The camera's away for reason `why` (true) or back (false): the recording holds and the card goes out meanwhile. */
		hold(why, on) {
			if (on === holds.has(why)) return;
			on ? holds.add(why) : holds.delete(why);
			on ? rec.pause(why) : rec.resume(why);
			sync();
		},
		buttons,
		/** End game: no more pausing. */
		end() {
			holds.clear();
			stopCard();
			cam.classList.remove("paused");
			buttons(false);
		},
	};
}
