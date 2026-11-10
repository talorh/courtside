// Go live from the browser: records the camera on the phone (full quality, whatever the signal) and uploads it to
// storage in equal parts while the game goes on. Parts wait in memory through a dropped signal and go when it's
// back. End game sends the last part and completes the upload, which then becomes the game video like any upload.
// What's uploaded so far is remembered (which segment this is, how many minutes the earlier segments hold), and what
// hasn't reached storage yet is kept on the phone (golive-store.js), so a page closed by mistake loses nothing recorded:
// the next page sends it (golive-kept.js), and saves or carries on (golive-recover.js).
import { keeper } from "./golive-store.js";
import { api, keepTrying, putPart } from "./upload-net.js";
import { forget, save } from "./upload-state.js";
import { upright } from "./golive-upright.js";

export const stateKey = (gameId) => `courtside-live:${gameId}`;

// An 8 MB part that hasn't gone in 5 minutes has stalled (it would need under 0.25 Mbps): try it again.
const PART_TIMEOUT_MS = 5 * 60_000;
// A recorder hands over its last piece and stops within a second or two. One that never does mustn't leave Saving up
// for good: after this long, what it has handed over is saved.
const STOP_WAIT_MS = 10_000;

const sortedParts = (etags) => Object.entries(etags).map(([n, etag]) => ({ partNumber: Number(n), etag })).sort((a, b) => a.partNumber - b.partNumber);

export async function complete(videoId, etags, hint, segment = 1) {
	return keepTrying(() => api(`/api/uploads/${videoId}/complete`, { parts: sortedParts(etags), segment }), hint);
}

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
	const kept = keeper(videoId, segment); // the phone's own copy of what hasn't reached storage
	let buffer = new Blob([], { type: mime });
	let next = 1;
	let waitingBytes = 0;
	let queue = Promise.resolve();
	let failed = null;
	let totalParts = null;
	let recordedBytes = 0, sentBytes = 0, lastChunkAt = Date.now(), first = null, stopping = false, sealed = false;
	// How long it has recorded, pauses left out (End game tells the site, for its under-a-minute test rule).
	let recordedMs = 0, runningSince = Date.now();
	const holds = new Set();
	let beforeComplete = Promise.resolve(); // what an earlier page kept, still going up (golive-recover.js)
	const upload = (n, body) => keepTrying(async () => {
		const { urls } = await api(`/api/uploads/${videoId}/part-urls`, { partNumbers: [n], segment });
		return putPart(urls[n], body, undefined, PART_TIMEOUT_MS);
	}, hint);

	const report = () => onProgress({ uploadedParts: Object.keys(state.etags).length, totalParts, waitingBytes, recordedBytes, sentBytes });
	function send(part) {
		const n = next++;
		if (n === 1) first = part;
		waitingBytes += part.size;
		queue = queue.then(async () => {
			if (failed) return;
			try {
				state.etags[n] = await upload(n, part);
				save(key, state);
				kept.sent(n);
				sentBytes += part.size;
			} catch (err) {
				if (!failed) onFatal((failed = err));
			}
			waitingBytes -= part.size;
			report();
		});
	}
	// Equal parts (storage needs every part but the last the same size); each is kept on the phone until it's up.
	function cut(final) {
		let cuts = 0;
		while (buffer.size >= partSize) {
			kept.part(next, buffer.slice(0, partSize, mime));
			send(buffer.slice(0, partSize, mime));
			buffer = buffer.slice(partSize, buffer.size, mime);
			cuts++;
		}
		if (cuts) kept.cutTail(buffer);
		if (final && buffer.size > 0) send(buffer);
	}

	const recorder = new MediaRecorder(media, { mimeType: mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
	recorder.ondataavailable = (e) => {
		if (sealed) return; // after the last part was cut: a recorder that stopped late
		if (e.data.size === 0) return; // asked for what it has, and it had nothing: still quiet
		lastChunkAt = Date.now();
		recordedBytes += e.data.size;
		buffer = new Blob([buffer, e.data], { type: mime });
		kept.chunk(e.data);
		cut(false);
		report();
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
		recordedSeconds: () => Math.round((recordedMs + (runningSince === null ? 0 : Date.now() - runningSince)) / 1000),
		/** stop() completes the recording only once `sending` is over: an earlier segment's parts must be in storage first. */
		before(sending) { beforeComplete = sending.catch((err) => console.warn(`earlier part: ${err}`)); },
		quietFor: () => Date.now() - lastChunkAt,
		state: () => recorder.state,
		/** A test thrown away by the server: stop recording and uploading, and forget it. */
		cancel() {
			stopping = true;
			clearInterval(nudge);
			failed = new Error("Thrown away as a test");
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
			sealed = true;
			cut(true);
			totalParts = next - 1;
			onRecorded?.(totalParts);
			report();
			await queue;
			if (failed) throw failed;
			if (next === 1) throw new Error("Nothing was recorded.");
			// iPhone labels the video as turned (golive-upright.js): part 1 is fixed and sent again once recording has
			// stopped, so nothing reads the recording while the phone is still making it.
			const fixed = await upright(first);
			if (fixed !== first) state.etags[1] = await upload(1, fixed);
			await beforeComplete;
			await complete(videoId, state.etags, hint, segment);
			forget(key);
			kept.clear();
		},
	};
}
