// Keeps the phone's screen on (uploading, Go live): a locked phone pauses the page.
// Phones refuse or drop the lock at times: iPhone grants it only straight after a tap (checked in WebKit),
// and every phone drops it when the page is hidden. So it's taken again on return to the page, on any tap, and every
// 15 seconds. `onChange(held)` lets the page say when the screen can't be kept on.

// While any job keeps the screen on, the page is marked busy: a pull to refresh (pull-refresh.js) mustn't cut it short.
let holding = 0;
const marked = () => document.documentElement.classList.toggle("busy", holding > 0);

export function keepAwake(onChange = () => {}) {
	holding++;
	marked();
	let lock = null;
	let on = true;
	let held = null;
	let asking = false;
	const report = (now) => { if (on && now !== held) { held = now; onChange(now); } };
	// One ask at a time: a tap while the phone is answering would otherwise leave a second lock that's never let go.
	const take = async () => {
		if (!on || asking || (lock && !lock.released) || document.visibilityState !== "visible") return;
		if (!navigator.wakeLock) return report(false);
		asking = true;
		try {
			const got = await navigator.wakeLock.request("screen");
			// Released while the phone was answering: this lock goes straight back.
			if (!on) return void got.release().catch((err) => console.warn(`wake lock: ${err}`));
			lock = got;
			lock.addEventListener("release", () => { report(false); take(); });
			report(true);
		} catch (err) {
			console.warn(`wake lock: ${err}`);
			report(false);
		} finally {
			asking = false;
		}
	};
	const onVisible = () => { if (document.visibilityState === "visible") take(); };
	document.addEventListener("visibilitychange", onVisible);
	document.addEventListener("pointerdown", take, { capture: true, passive: true });
	const timer = setInterval(take, 15_000);
	take();
	return {
		release() {
			if (on) { holding--; marked(); }
			on = false;
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
			document.removeEventListener("pointerdown", take, { capture: true });
			lock?.release().catch((err) => console.warn(`wake lock: ${err}`));
		},
	};
}
