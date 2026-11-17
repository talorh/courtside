// Game page: a family's player trouble (the live picture's connection failing, the picture stopping, the player's own
// error), sent to the Worker's logs as a watch_events line (/api/watch-events), so "we can't watch" on a game night can
// be told apart: the filming phone, Stream, or this phone's own connection. Only trouble is sent, and when the picture
// came back, a batch a minute at most, and what's left as the page goes. Before the page's first picture it's waiting
// (a page opened before tip-off), marked as such. Best effort: it never adds to the trouble.
import { api } from "./upload-net.js";

const BATCH = 20, MAX_BATCHES = 30, EVERY_MS = 60_000;

/** `kind`: "live" or "video". trouble(why) notes something wrong; fine() that the picture is arriving (noted only after
 * trouble: "picture back after Ns", or "first picture after Ns"). Nothing at all off a game's page. */
export function watchReporter(kind) {
	const gameId = Number(/^\/games\/(\d+)/.exec(location.pathname)?.[1]);
	const started = Date.now(), waiting = [];
	let troubleAt = null, lastWhy = null, pictured = false, batches = 0;
	const at = () => Math.round((Date.now() - started) / 1000);
	const send = (keepalive) => {
		if (!waiting.length || !gameId || batches >= MAX_BATCHES) return;
		batches++;
		const batch = waiting.splice(0, BATCH);
		// Not sent (no signal, the likeliest time): back in the queue for the next, as far as there's room.
		api("/api/watch-events", { gameId, kind, events: batch }, undefined, { keepalive }).catch((err) => {
			waiting.unshift(...batch.slice(0, BATCH - waiting.length));
			console.warn(`watch log: ${err.message ?? err}`);
		});
	};
	setInterval(() => send(false), EVERY_MS);
	document.addEventListener("visibilitychange", () => { if (document.hidden) send(true); });
	addEventListener("pagehide", () => send(true));
	const note = (what) => { if (waiting.length < BATCH) waiting.push({ s: at(), what: String(what).slice(0, 160) }); };
	return {
		// The same trouble again (a stream not started, retried every few seconds) is noted once, until it changes.
		trouble(why) {
			troubleAt ??= Date.now();
			if (why !== lastWhy) note(pictured ? why : `waiting: ${why}`);
			lastWhy = why;
		},
		fine() {
			if (troubleAt !== null) note(`${pictured ? "picture back" : "first picture"} after ${Math.round((Date.now() - troubleAt) / 1000)}s`);
			troubleAt = lastWhy = null;
			pictured = true;
		},
	};
}
