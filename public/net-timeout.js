// Giving up on a request that hangs (a weak signal can stall one for minutes), so it's tried again instead, on the
// phones that can: alongside the request's own cancel, where it has one.

/** `signal`, plus giving up after `ms`, where the browser can do that (older phones: just `signal`). Gives "TimeoutError".
 * A phone with AbortSignal.timeout but not AbortSignal.any (iOS 16.4 to 17.3) has the two joined by hand. */
export function timeoutSignal(ms, signal) {
	if (!AbortSignal.timeout) return signal;
	if (!signal) return AbortSignal.timeout(ms);
	if (AbortSignal.any) return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
	const both = new AbortController();
	const end = (reason) => {
		clearTimeout(timer);
		signal.removeEventListener("abort", cancelled);
		both.abort(reason);
	};
	const cancelled = () => end(signal.reason);
	const timer = setTimeout(() => end(new DOMException("The operation timed out.", "TimeoutError")), ms);
	if (signal.aborted) cancelled();
	else signal.addEventListener("abort", cancelled);
	return both.signal;
}

/** fetch(url, init), given up after `ms` as well as on `signal`. A browser whose fetch calls any abort an AbortError still
 * gives a TimeoutError for a timeout, so it's tried again rather than taken for a cancel. */
export async function fetchWithin(ms, url, init, signal) {
	const both = timeoutSignal(ms, signal);
	try {
		return await fetch(url, { ...init, signal: both });
	} catch (err) {
		throw both?.reason?.name === "TimeoutError" && !signal?.aborted ? both.reason : err;
	}
}
