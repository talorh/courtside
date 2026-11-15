import { afterEach, expect, it, vi } from "vitest";

// Watch games' check for changed cards (public/games-refresh.js), on a stand-in page.
const realFetch = globalThis.fetch, realTimeout = AbortSignal.timeout;
afterEach(() => {
	globalThis.fetch = realFetch;
	AbortSignal.timeout = realTimeout;
	vi.unstubAllGlobals();
	vi.resetModules();
});

it("asks for the page once at a time, and gives up on a stalled one so the next check can run", async () => {
	const ticks: Array<() => Promise<void>> = [];
	vi.stubGlobal("setInterval", (fn: () => Promise<void>) => { ticks.push(fn); return 1; });
	vi.stubGlobal("document", { hidden: false, querySelectorAll: () => [], addEventListener: () => {} });
	vi.stubGlobal("location", { href: "https://example.test/videos", reload: vi.fn() });
	vi.stubGlobal("console", { ...console, warn: () => {} });
	const asked: number[] = [], gaveUp = new AbortController();
	AbortSignal.timeout = (ms: number) => { asked.push(ms); return gaveUp.signal; };
	const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
		init.signal?.addEventListener("abort", () => reject(new DOMException("The operation timed out.", "TimeoutError")));
	}));
	globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
	// @ts-expect-error: a browser script (plain JS), run here with a stand-in page.
	await import("../../public/games-refresh.js");
	const first = ticks[0]!();
	await ticks[0]!();
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(asked).toEqual([20_000]);
	gaveUp.abort();
	await first;
	void ticks[0]!();
	expect(fetch).toHaveBeenCalledTimes(2);
});
