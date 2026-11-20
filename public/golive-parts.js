// Go live: sending the recording's parts to storage, one at a time and in order (golive-rec.js cuts them). On a slow
// signal they queue up here; the phone keeps its own copy of each meanwhile (golive-store.js), for a page reopened
// after this one dies.
import { api, keepTrying, putPart } from "./upload-net.js";

// An 8 MB part that hasn't gone in 5 minutes has stalled (it would need under 0.25 Mbps): try it again.
const PART_TIMEOUT_MS = 5 * 60_000;

/**
 * The queue for one segment's parts. `send(n, part)`: part `n` goes once those before it have. `onSent(n, etag, size)`
 * as each lands; `onFailed(err)` once, if storage refuses one;
 * `onSettled(size)` after each, landed or not. `upload(n, body)`: one part, now. `idle()`: once all have gone.
 * `halt(err)`: nothing more goes (a test thrown away), without telling `onFailed`.
 */
export function partQueue({ videoId, segment, hint }, { onSent, onFailed, onSettled }) {
	let queue = Promise.resolve(), failed = null;
	const upload = (n, body) => keepTrying(async () => {
		const { urls } = await api(`/api/uploads/${videoId}/part-urls`, { partNumbers: [n], segment });
		return putPart(urls[n], body, undefined, PART_TIMEOUT_MS);
	}, hint);
	return {
		upload,
		failed: () => failed,
		halt: (err) => { failed ??= err; },
		idle: () => queue,
		send(n, part) {
			const size = part.size;
			queue = queue.then(async () => {
				if (failed) return;
				try {
					onSent(n, await upload(n, part), size);
				} catch (err) {
					if (!failed) onFailed((failed = err));
				}
				onSettled(size);
			});
		},
	};
}
