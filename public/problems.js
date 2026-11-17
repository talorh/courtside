// A page's failure the site can't see for itself (the phone's connection dropped, or a refusal the page showed): a
// problem in the admin Log (/api/problems). Best effort: reporting it never adds to the trouble.
import { api } from "./upload-net.js";

/** `what`: "upload" (with its gameId) or "photos"; `message` what the page showed; `status` the site's answer, if any;
 * `progress` how far an upload got (progressOf); `keepalive` for a page that's closing. */
export function reportProblem(what, { gameId, message, status, progress, keepalive = false } = {}) {
	const body = {
		what, message: String(message || "no reason given").slice(0, 200), ...(gameId ? { gameId } : {}), ...(Number.isInteger(status) ? { status } : {}),
		...(progress ? { progress } : {}),
	};
	return api("/api/problems", body, undefined, { keepalive }).catch((err) => console.warn(`problem report: ${err.message ?? err}`));
}

/** How far an upload got when it stopped: its percent, size in MB and minutes going. */
export const progressOf = (pct, bytes, startedMs, nowMs) =>
	({ pct: Math.round(pct), mb: Math.round(bytes / 1e6), minutes: Math.floor((nowMs - startedMs) / 60_000) });

/** progressOf in words, for the admin Log: "At 42% of 1,234 MB, 12 min in". */
export const progressWords = (p) => `At ${p.pct}% of ${p.mb.toLocaleString("en-AU")} MB, ${p.minutes} min in`;
