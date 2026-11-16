// The upload itself: start or resume a multipart upload, send the missing pieces, then complete it.
// `ui` carries the page's hint() and show() so this file has no DOM lookups of its own.
import { api, isNetworkTrouble, needsReload, putPart, withRetries } from "./upload-net.js";
import { forget, keyFor, load, progress, save, startSession } from "./upload-state.js";

// Up to 6 pieces in flight fills a good connection. On a weak one (e.g. patchy 5G) every drop fails all pieces in
// flight, so after a failed round we halve it (6 → 3 → 2 → 1) and step back up after each batch that succeeds.
const MAX_CONCURRENCY = 6, URL_BATCH = 24;
let concurrency = MAX_CONCURRENCY;

async function sendMissingParts(file, key, state, signal, ui) {
	const todo = [];
	for (let n = 1; n <= state.totalParts; n++) if (!state.etags[n]) todo.push(n);
	while (todo.length) {
		const batch = todo.splice(0, URL_BATCH);
		const { urls } = await api(`/api/uploads/${state.videoId}/part-urls`, { partNumbers: batch }, signal);
		const queue = [...batch];
		// Once a piece fails, the others take no more. The retry doesn't wait for them (on a dropped signal they may hang):
		// after its own wait it skips any piece they finished meanwhile, and sends again only those still on their way.
		let failed = false;
		try {
			await Promise.all(Array.from({ length: concurrency }, async () => {
				while (queue.length && !failed) {
					const n = queue.shift();
					if (state.etags[n]) continue;
					state.etags[n] = await putPart(urls[n], file.slice((n - 1) * state.partSize, n * state.partSize), signal)
						.catch((err) => { failed = true; throw err; });
					save(key, state);
					ui.show(progress(state, file.size));
				}
			}));
		} catch (err) {
			concurrency = Math.max(1, Math.ceil(concurrency / 2));
			throw err;
		}
		concurrency = Math.min(MAX_CONCURRENCY, concurrency + 1);
	}
}

async function begin(file, gameId, key, signal, ui) {
	const body = { gameId, fileName: file.name, fileSize: file.size, contentType: file.type || "video/mp4" };
	const s = await withRetries(() => api("/api/uploads", body, signal), ui.hint, signal);
	const state = { videoId: s.videoId, partSize: s.partSize, totalParts: s.totalParts, etags: {} };
	save(key, state);
	return state;
}

export async function upload(file, gameId, signal, ui) {
	concurrency = MAX_CONCURRENCY;
	const key = keyFor(file, gameId);
	let state = load(key) ?? (await begin(file, gameId, key, signal, ui));
	const sendAndComplete = async () => {
		startSession(state);
		ui.show(progress(state, file.size));
		// Each piece that gets through starts its tries again: only a signal that sends nothing at all gives up.
		await withRetries(() => sendMissingParts(file, key, state, signal, ui), ui.hint, signal, undefined, () => Object.keys(state.etags).length);
		const parts = Object.entries(state.etags).map(([n, etag]) => ({ partNumber: Number(n), etag }));
		return withRetries(() => api(`/api/uploads/${state.videoId}/complete`, { parts }, signal), ui.hint, signal);
	};
	let result;
	try {
		result = await sendAndComplete();
	} catch (err) {
		// Saved progress from an upload the server no longer has (cancelled, cleaned up, deleted, or finished and then
		// failed): start afresh. With every piece already sent, it's Complete that finds out. Not when the site asks for a
		// reload: the progress is still good after it.
		if (needsReload(err) || (err.status !== 404 && err.status !== 409)) throw err;
		forget(key);
		state = await begin(file, gameId, key, signal, ui);
		result = await sendAndComplete();
	}
	forget(key);
	return result;
}

/** What the page says when an upload stops: the site's own refusal, or, when it gave up on the connection (or storage),
 * that the pieces sent are kept for choosing the same video again (upload-state.js), never the browser's "Load failed". */
export const failedWords = (err) => (err?.code !== "maintenance" && (isNetworkTrouble(err) || /^storage /.test(String(err?.message)))
	? "The connection kept dropping, so the upload has stopped. What's been sent is kept: choose the same video again to carry on from there."
	: String(err.message).replace(/\.?$/, ".")); // the site's messages end in a full stop already

/** Tells the server to delete the partial upload so the game is free again. */
export async function cancelOnServer(file, gameId) {
	const state = load(keyFor(file, gameId));
	forget(keyFor(file, gameId));
	if (!state) return "Upload cancelled.";
	try {
		await api(`/api/uploads/${state.videoId}/abort`, {});
		return "Upload cancelled. You can choose a video again.";
	} catch (err) {
		console.error("Cancel on server failed", err);
		return "Upload stopped, but the site couldn't tidy it up yet. You can choose a video again now: a new upload from you replaces this one.";
	}
}
