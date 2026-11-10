// Network helpers for the uploader (and Photos): JSON API calls, form posts, part PUTs to R2, and retrying through
// dropped connections.
const MAX_ROUNDS = 40;
// A small request that hangs (a weak signal can stall one for minutes) is given up and tried again instead.
const API_TIMEOUT_MS = 30_000;
// A photo (a few MB) takes longer on a weak signal at the stadium.
const FORM_TIMEOUT_MS = 120_000;

/** `signal`, plus giving up after `ms`, where the browser can do that (older phones: just `signal`). Gives "TimeoutError". */
export function timeoutSignal(ms, signal) {
	if (!AbortSignal.timeout) return signal;
	const timeout = AbortSignal.timeout(ms);
	if (!signal) return timeout;
	return AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal;
}

/** A random id (UUID v4) for a request that may be sent again, on phones too old for crypto.randomUUID too. */
export const newId = () => (crypto.randomUUID ? crypto.randomUUID()
	: "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));

/** A refusal from the site (or storage): its message, HTTP status and, from the site, its error code. */
export class HttpError extends Error {
	constructor(message, status, code = null) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

/** The site asks for a reload: the page is from before an update, or for a team you've left. Trying again
 * can't help, and saved progress is kept for after the reload. */
export const needsReload = (err) => err?.code === "site_updated" || err?.code === "team_changed" || err?.code === "choose_team";

// Network failures, timeouts, server errors, throttling and expired part links (403) are worth retrying; other 4xx are
// not. A cancelled upload (AbortError) is never retried.
const isRetryable = (err) =>
	err?.name !== "AbortError" && (!(err instanceof HttpError) || err.status >= 500 || err.status === 429 || err.status === 403);

/** For a photo (photos.js): only trouble reaching the site is tried again; a refusal (any 4xx but 429) isn't. */
export const isNetworkTrouble = (err) => err?.name !== "AbortError" && (!(err instanceof HttpError) || err.status >= 500 || err.status === 429);

/** The API's answer: its data, or an HttpError with the site's message. `signedOut`: what to say when the sign-in ran out. */
async function answer(res, signedOut) {
	// An expired sign-in answers with a redirect to the sign-in page.
	if (res.type === "opaqueredirect") throw new HttpError(signedOut, 401);
	const json = await res.json().catch(() => null);
	if (!res.ok || !json?.ok) throw new HttpError(json?.error?.message ?? `Upload failed (HTTP ${res.status})`, res.status, json?.error?.code ?? null);
	return json.data;
}

/**
 * The team this page was for (`<html data-team>`), sent with every write so the site refuses one made after switching
 * team in another window, rather than saving it to the wrong team. Nothing when the page names no team.
 */
export function teamHeaders() {
	const team = globalThis.document?.documentElement?.dataset?.team;
	return team ? { "X-Courtside-Team": team } : {};
}

export async function api(path, body, signal, { keepalive = false } = {}) {
	// keepalive: the request outlives the page (a page that's hiding or closing sends its last words with it).
	const res = await fetch(path, {
		method: "POST", headers: { "Content-Type": "application/json", ...teamHeaders() }, body: JSON.stringify(body), redirect: "manual",
		signal: timeoutSignal(API_TIMEOUT_MS, signal), keepalive,
	});
	return answer(res, "You've been signed out. Reload the page and sign in, then choose the same video");
}

/** Posts a form (a photo and its fields) to the API, answered as api() is. */
export async function apiForm(path, form, signal) {
	const res = await fetch(path, { method: "POST", headers: teamHeaders(), body: form, redirect: "manual", signal: timeoutSignal(FORM_TIMEOUT_MS, signal) });
	return answer(res, "You've been signed out. Reload the page and sign in, then choose the photos again");
}

/** `timeoutMs`: give up on a part that takes longer (the live recording's parts; a file's parts can take a while). */
export async function putPart(url, blob, signal, timeoutMs) {
	const res = await fetch(url, { method: "PUT", body: blob, signal: timeoutMs ? timeoutSignal(timeoutMs, signal) : signal });
	if (!res.ok) throw new HttpError(`storage returned HTTP ${res.status}`, res.status);
	const etag = res.headers.get("ETag");
	if (!etag) throw new HttpError("storage didn't return an ETag", 500);
	return etag;
}

// Waits until the phone is back online, the page is visible again (phone unlocked), the upload is cancelled,
// or a backoff delay passes.
function waitToRetry(round, signal) {
	const delay = Math.min(30000, 2000 * round);
	return new Promise((resolve) => {
		const onVisible = () => { if (document.visibilityState === "visible") done(); };
		const done = () => {
			clearTimeout(timer);
			window.removeEventListener("online", done);
			document.removeEventListener("visibilitychange", onVisible);
			signal?.removeEventListener("abort", done);
			resolve();
		};
		const timer = setTimeout(done, delay);
		window.addEventListener("online", done);
		document.addEventListener("visibilitychange", onVisible);
		signal?.addEventListener("abort", done);
	});
}

/**
 * Runs step until it succeeds, pausing through connection problems. Errors `retryable` turns down (by default: not a
 * network failure, server error, throttling or expired part link) are rethrown at once.
 */
export async function withRetries(step, hint, signal, retryable = isRetryable) {
	for (let round = 1; ; round++) {
		try {
			return await step();
		} catch (err) {
			if (signal?.aborted || !retryable(err) || round >= MAX_ROUNDS) throw err;
			// The maintenance page answers the site's API with when it'll be back (docs/runbooks/maintenance.md).
			hint(err?.code === "maintenance" ? `${String(err.message).replace(/\.?$/, ".")} It carries on by itself after that: keep this page open.`
				: navigator.onLine === false
				? "Connection lost. The upload will carry on by itself when you're back online. Keep this page open."
				: "Having trouble reaching the server. Trying again in a moment… (Weak mobile signal? Home Wi-Fi is much faster.)");
			await waitToRetry(round, signal);
			if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
			hint("Carrying on…");
		}
	}
}

/** A live game can't give up on a part: keeps going through any outage. Only a refusal (signed out, upload gone) stops it. */
export async function keepTrying(step, hint) {
	for (;;) {
		try {
			return await withRetries(step, hint);
		} catch (err) {
			const refused = err instanceof HttpError && err.status < 500 && err.status !== 429 && err.status !== 403;
			const network = err instanceof HttpError || err instanceof TypeError || err?.name === "TimeoutError";
			if (refused || !network) throw err;
		}
	}
}
