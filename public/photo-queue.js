// Sending the chosen photos. The first goes on its own: a refusal that would turn down the rest too (signed out, no
// longer allowed, the site asks for a reload) stops there, before any more are sent. Then up to AT_ONCE are drawn and
// readied together, and go up as uploadLanes allows.
export const AT_ONCE = 3;
/** The first photo has to be in within this for several to go up at once. */
export const QUICK_MS = 5000;

/** Sends every file with `send`; `onDone(n)` after each finishes. Skipped ones come back in the order they were chosen. */
export async function sendPhotos(files, send, onDone, isStop) {
	const failed = new Map();
	let added = 0, finished = 0, next = 0, stopped = null;
	async function one(index) {
		try {
			await send(files[index]);
			added++;
		} catch (err) {
			if (isStop(err)) stopped ??= err;
			else failed.set(index, err);
		}
		onDone(++finished);
	}
	async function worker() {
		while (next < files.length && !stopped) await one(next++);
	}
	if (files.length) await one(next++);
	await Promise.all(Array.from({ length: AT_ONCE }, worker));
	const skipped = [...failed.keys()].sort((a, b) => a - b).map((i) => ({ file: files[i], error: failed.get(i) }));
	return { added, skipped, stopped };
}

/** `fn`, but each call waits for the one before to finish: a phone has room to draw only so many photos at once. */
export function oneAtATime(fn) {
	let turn = Promise.resolve();
	return (...args) => {
		const run = turn.then(() => fn(...args));
		turn = run.catch(() => {});
		return run;
	};
}

/**
 * How many photos go up at once: one, unless the first went up within QUICK_MS (Wi-Fi, a strong signal), and one again
 * for the rest at the first trouble reaching the site. On a weak signal several at once share it and none may be in
 * before it drops, to start again from nothing; one at a time, each that's in stays in.
 */
export function uploadLanes() {
	let measured = false, wide = false;
	const single = oneAtATime((fn) => fn());
	return {
		/** A photo went up in `ms`: the first one's time decides. */
		sent(ms) {
			if (!measured) wide = ms <= QUICK_MS;
			measured = true;
		},
		trouble() {
			measured = true;
			wide = false;
		},
		/** One try at sending a photo: now when several may go at once, else after the one before. */
		run(fn) {
			return wide ? fn() : single(fn);
		},
	};
}
