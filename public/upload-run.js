// The upload itself: start or resume a multipart upload, send the missing pieces, then complete it.
// `ui` carries the page's hint() and show() so this file has no DOM lookups of its own.
import { api, needsReload, putPart, withRetries } from "./upload-net.js";
import { forget, keyFor, load, progress, save, startSession } from "./upload-state.js";
import { askName } from "./team.js";

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
		// Once a piece fails, the others finish what they're sending and stop, so the retry isn't sending the same pieces
		// alongside them; a piece one of them finished meanwhile is skipped.
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
		await withRetries(() => sendMissingParts(file, key, state, signal, ui), ui.hint, signal);
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
		return `Upload stopped, but the site couldn't tidy it up yet. It clears itself within a day; ask ${askName()} if you need to upload again sooner.`;
	}
}
