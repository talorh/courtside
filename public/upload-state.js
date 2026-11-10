// Uploader state helpers: resume records (per file + game) and progress/time-remaining text.

// localStorage only enables resume after a reload; if it's unavailable the upload still works.
export const keyFor = (file, gameId) => `courtside-upload:${gameId}:${file.name}:${file.size}`;
export const load = (key) => { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } };
export const save = (key, state) => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* resume unavailable */ } };
export const forget = (key) => { try { localStorage.removeItem(key); } catch { /* nothing stored */ } };

export const gb = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

// Time remaining comes from the pieces finished since this page started uploading (resumed pieces don't count).
const session = { start: 0, baseParts: 0 };

export function startSession(state) {
	session.start = Date.now();
	session.baseParts = Object.keys(state.etags).length;
}

function timeLeft(done, total) {
	const sent = done - session.baseParts;
	if (sent < 2 || done >= total) return "";
	const minutes = Math.ceil(((Date.now() - session.start) / sent) * (total - done) / 60000);
	return minutes > 90 ? ` · about ${Math.round(minutes / 60)} hours left` : ` · about ${minutes} min left`;
}

/** e.g. { pct: 42, text: "42% of 3.4 GB · about 18 min left" } */
export function progress(state, size) {
	const done = Object.keys(state.etags).length;
	const pct = Math.floor((done / state.totalParts) * 100);
	return { pct, text: `${pct}% of ${gb(size)}${timeLeft(done, state.totalParts)}` };
}
