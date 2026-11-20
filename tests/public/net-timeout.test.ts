import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { fetchWithin, timeoutSignal } from "../../public/net-timeout.js";

const realFetch = globalThis.fetch, realTimeout = AbortSignal.timeout, realAny = AbortSignal.any;
afterEach(() => {
	globalThis.fetch = realFetch;
	AbortSignal.timeout = realTimeout;
	AbortSignal.any = realAny;
	vi.useRealTimers();
});

/** A phone with AbortSignal.timeout but not AbortSignal.any (iPhones on iOS 16.4 to 17.3), on the test's clock. */
const noAny = () => {
	vi.useFakeTimers();
	AbortSignal.timeout = (ms: number) => {
		const c = new AbortController();
		setTimeout(() => c.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
		return c.signal;
	};
	(AbortSignal as { any?: unknown }).any = undefined;
};

describe("giving up on a request that takes too long", () => {
	it("a phone without AbortSignal.any still gives up after the time when the request can also be cancelled", async () => {
		noAny();
		const signal = timeoutSignal(30_000, new AbortController().signal);
		await vi.advanceTimersByTimeAsync(29_999);
		expect(signal.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(signal.aborted).toBe(true);
		expect(signal.reason).toMatchObject({ name: "TimeoutError" });
	});

	it("there, a cancel comes through as a cancel, at once, and leaves no timer behind", () => {
		noAny();
		const cancel = new AbortController();
		const signal = timeoutSignal(30_000, cancel.signal);
		cancel.abort();
		expect(signal.aborted).toBe(true);
		expect(signal.reason).toMatchObject({ name: "AbortError" });
		expect(vi.getTimerCount()).toBe(0);
		const already = new AbortController();
		already.abort();
		expect(timeoutSignal(30_000, already.signal).reason).toMatchObject({ name: "AbortError" });
	});

	it("phones too old for a timeout just get the signal they were given", () => {
		const signal = new AbortController().signal;
		(AbortSignal as { timeout?: unknown }).timeout = undefined;
		expect(timeoutSignal(1000, signal)).toBe(signal);
		expect(timeoutSignal(1000)).toBeUndefined();
	});

	it("a browser whose fetch calls any abort an AbortError still reports a timeout as a TimeoutError, so it's tried again", async () => {
		noAny();
		// Rejects with a plain AbortError whatever the signal's reason, as some browsers' fetch does.
		globalThis.fetch = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
			init.signal?.addEventListener("abort", () => reject(new DOMException("Fetch is aborted", "AbortError")));
		})) as typeof fetch;
		const timedOut = fetchWithin(30_000, "/api/x", { method: "POST" }, new AbortController().signal).catch((err: Error) => err);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(await timedOut).toMatchObject({ name: "TimeoutError" });
		const cancel = new AbortController();
		const cancelled = fetchWithin(30_000, "/api/x", { method: "POST" }, cancel.signal).catch((err: Error) => err);
		cancel.abort();
		expect(await cancelled).toMatchObject({ name: "AbortError" });
	});
});
