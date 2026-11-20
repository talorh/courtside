// Go live from the browser: records the camera on the phone (full quality, whatever the signal) and uploads it to
// storage in equal parts while the game goes on (golive-parts.js). Through a dropped signal they wait on the phone and
// go when it's back. End game sends the last part and completes the upload, which then becomes the game video like any upload.
// What's uploaded so far is remembered (which segment this is, how many minutes the earlier segments hold), and what
// hasn't reached storage yet is kept on the phone (golive-store.js), so a page closed by mistake loses nothing recorded:
// the next page sends it (golive-kept.js), and saves or carries on (golive-recover.js).
import { frameFixer } from "./golive-frames.js";
import { partQueue } from "./golive-parts.js";
import { keeper } from "./golive-store.js";
import { api, keepTrying } from "./upload-net.js";
import { forget, save } from "./upload-state.js";
import { upright } from "./golive-upright.js";

export const stateKey = (gameId) => `courtside-live:${gameId}`;

// A recorder hands over its last piece and stops within a second or two. One that never does mustn't leave Saving up
// for good: after this long, what it has handed over is saved.
const STOP_WAIT_MS = 10_000;

const sortedParts = (etags) => Object.entries(etags).map(([n, etag]) => ({ partNumber: Number(n), etag })).sort((a, b) => a.partNumber - b.partNumber);

/**
 * Starts recording `media`. onProgress(p) as parts go; hint(text) for connection trouble; onFatal(err) if the upload is
 * refused; onStopped() if the phone's recorder stops by itself (what it recorded still saves at stop()). Returns
 * { pause(why), resume(why), recordedSeconds(), cancel(), quietFor(), state(), stop(onRecorded) }: it's paused while
 * any `why` holds it (a break, the camera away), and paused time is left out of the video and of recordedSeconds().
 * quietFor(): ms since the phone handed over some recording (an empty piece isn't any) or carried on after a hold;
 * state(): the recorder's own. stop() calls onRecorded(totalParts) as soon as the recording itself has stopped (the
 * camera can close), and resolves once the video is complete.
 */
export function record(media, { videoId, partSize, mime, gameId, segment = 1, minutesBefore = 0 }, { onProgress, hint, onFatal, onStopped }) {
	const state = { videoId, partSize, etags: {}, segment, minutesBefore };
	const key = stateKey(gameId);
	save(key, state);
	// The phone's own copy of what hasn't reached storage; its failures go to the site's log.
	const kept = keeper(videoId, segment, (err) => hint(`recording store: ${err?.message ?? err}`));
	kept.opened.then((keeps) => { if (!stopping) save(key, Object.assign(state, { keeps })); }); // for a reopened page (golive-recover.js)
	let buffer = new Blob([], { type: mime }), next = 1, waitingBytes = 0, totalParts = null;
	let recordedBytes = 0, sentBytes = 0, lastChunkAt = Date.now(), first = null, stopping = false, sealed = false;
	// How long it has recorded, pauses left out (End game tells the site, for its under-a-minute test rule).
	let recordedMs = 0, runningSince = Date.now();
	const holds = new Set();
	let beforeComplete = Promise.resolve(); // what an earlier page kept, still going up (golive-recover.js)
	const recordedSeconds = () => Math.round((recordedMs + (runningSince === null ? 0 : Date.now() - runningSince)) / 1000);
	// This phone's own rate (Safari records well above the 2.5 Mbps asked), once there's a minute of it: what the bytes
	// still on the phone are worth in minutes, here and on the next page (the note).
	const perMinute = () => (recordedSeconds() >= 60 ? Math.round(recordedBytes / (recordedSeconds() / 60)) : undefined);
	let earlierLeft = () => 0; // after Carry on: what earlier segments still have to send (before())
	function report() {
		const bytesPerMinute = perMinute();
		// Noted when it moves by more than a twentieth, not on every piece.
		if (bytesPerMinute && !(Math.abs(bytesPerMinute - (state.bytesPerMinute ?? 0)) <= bytesPerMinute / 20)) save(key, Object.assign(state, { bytesPerMinute }));
		onProgress({ uploadedParts: Object.keys(state.etags).length, totalParts, waitingBytes, recordedBytes, sentBytes, earlierBytes: earlierLeft(), bytesPerMinute });
	}
	const sender = partQueue({ videoId, segment, hint }, {
		onSent(n, etag, size) { state.etags[n] = etag; save(key, state); kept.sent(n); sentBytes += size; },
		onFailed: (err) => onFatal(err),
		onSettled(size) { waitingBytes -= size; report(); },
	});
	function send(part) {
		const n = next++;
		if (n === 1) first = part;
		waitingBytes += part.size;
		sender.send(n, part);
	}
	// Equal parts (storage needs every part but the last the same size), and at End game what's left as the last. Each
	// is kept on the phone as its own numbered part until it's up, so a later page never sends it again as one more.
	function cut(final) {
		const parts = [];
		while (buffer.size >= partSize || (final && buffer.size > 0)) {
			const size = Math.min(partSize, buffer.size);
			parts.push({ n: next + parts.length, blob: buffer.slice(0, size, mime) });
			buffer = buffer.slice(size, buffer.size, mime);
		}
		if (parts.length) kept.cut(parts, buffer);
		for (const p of parts) send(p.blob);
	}

	// Each piece is put right (golive-frames.js) before it's kept or sent, one at a time and in order.
	const fixer = frameFixer(mime);
	let taking = Promise.resolve();
	const take = (piece) => { if (piece.size > 0) { buffer = new Blob([buffer, piece], { type: mime }); kept.chunk(piece); cut(false); report(); } };
	const recorder = new MediaRecorder(media, { mimeType: mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
	recorder.ondataavailable = (e) => {
		if (sealed) return; // after the last part was cut: a recorder that stopped late
		if (e.data.size === 0) return; // asked for what it has, and it had nothing: still quiet
		lastChunkAt = Date.now();
		recordedBytes += e.data.size;
		// A piece that fails here mustn't stop the ones after it.
		taking = taking.then(() => fixer.push(e.data)).then((piece) => { if (!sealed) take(piece); }).catch((err) => console.warn(`recording: ${err}`));
	};
	// The phone can stop its recorder by itself (under pressure, or on an error) while the live picture carries on.
	recorder.addEventListener("error", (e) => hint(`recorder error: ${e.error?.name ?? "unknown"}`));
	recorder.addEventListener("stop", () => { if (!stopping) onStopped?.(); });
	recorder.start(2000);
	// Safari can sit on the recording (it should hand it over every 2 seconds): ask for it, so it still uploads as it goes.
	const nudge = setInterval(() => {
		if (recorder.state === "recording" && Date.now() - lastChunkAt > 4000) recorder.requestData();
	}, 4000);

	return {
		pause: (why) => {
			holds.add(why);
			if (recorder.state === "recording") { recorder.pause(); recordedMs += Date.now() - runningSince; runningSince = null; }
		},
		resume: (why) => {
			holds.delete(why);
			if (holds.size === 0 && recorder.state === "paused") { recorder.resume(); runningSince = lastChunkAt = Date.now(); }
		},
		recordedSeconds,
		/** stop() completes the recording only once `sending` is over: an earlier segment's parts must be in storage first.
		 * Its left() counts in the progress, reported at once and again when it settles (sent, or refused: nothing more). */
		before(sending) {
			earlierLeft = sending.left ?? earlierLeft;
			beforeComplete = sending.catch((err) => console.warn(`earlier part: ${err}`)).finally(() => { earlierLeft = () => 0; report(); });
			report();
		},
		quietFor: () => Date.now() - lastChunkAt,
		state: () => recorder.state,
		/** A test thrown away by the server: stop recording and uploading, and forget it. */
		cancel() {
			stopping = sealed = true;
			clearInterval(nudge);
			sender.halt(new Error("Thrown away as a test"));
			if (recorder.state !== "inactive") recorder.stop();
			forget(key);
			kept.clear();
		},
		async stop(onRecorded) {
			stopping = true;
			clearInterval(nudge);
			if (recorder.state !== "inactive") {
				const stopped = new Promise((resolve) => recorder.addEventListener("stop", () => resolve(true), { once: true }));
				recorder.stop();
				if (!(await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, STOP_WAIT_MS, false))]))) hint("recorder didn't stop: saving what it handed over");
			}
			await taking;
			take(fixer.flush());
			sealed = true;
			cut(true);
			totalParts = next - 1;
			onRecorded?.(totalParts);
			report();
			await sender.idle();
			if (sender.failed()) throw sender.failed();
			if (next === 1) throw new Error("Nothing was recorded.");
			// iPhone labels the video as turned (golive-upright.js): part 1 is fixed and sent again once recording has
			// stopped, so nothing reads the recording while the phone is still making it.
			const fixed = await upright(first);
			if (fixed !== first) state.etags[1] = await sender.upload(1, fixed);
			await beforeComplete;
			await keepTrying(() => api(`/api/uploads/${videoId}/complete`, { parts: sortedParts(state.etags), segment }), hint);
			forget(key);
			kept.clear();
		},
	};
}
