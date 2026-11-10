// A page's failure the site can't see for itself (the phone's connection dropped, or a refusal the page showed): a
// problem in the admin Log (/api/problems). Best effort: reporting it never adds to the trouble.
import { api } from "./upload-net.js";

/** `what`: "upload" (with its gameId) or "photos"; `message` what the page showed; `status` the site's answer, if any. */
export function reportProblem(what, { gameId, message, status } = {}) {
	const body = { what, message: String(message || "no reason given").slice(0, 200), ...(gameId ? { gameId } : {}), ...(Number.isInteger(status) ? { status } : {}) };
	return api("/api/problems", body).catch((err) => console.warn(`problem report: ${err.message ?? err}`));
}
