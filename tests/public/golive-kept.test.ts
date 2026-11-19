import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeIndexedDb } from "../helpers/fake-indexeddb.ts";
// @ts-expect-error plain browser module, no types
import { keptOnPhone } from "../../public/golive-kept.js";
// @ts-expect-error plain browser module, no types
import { openStore } from "../../public/golive-store.js";

// What a closed page left on the phone goes up with a fresh upload link each try: a page reopened the next morning
// finds its old links run out (403), and must ask for new ones rather than try the dead one for ever.

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Go live: sending what a closed page left on the phone", () => {
	it("asks for a fresh upload link when storage refuses a part's link as run out", async () => {
		const stored = new Map<string, string>();
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
		vi.stubGlobal("document", { documentElement: { dataset: {} }, visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
		vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
		vi.stubGlobal("navigator", { onLine: true });
		const store = await openStore();
		await store.putTail("41/1", 0, new Blob([new Uint8Array(300)], { type: "video/mp4" }));
		let links = 0, puts = 0;
		vi.stubGlobal("fetch", async (url: string) => {
			if (url.endsWith("/part-urls")) { links++; return Response.json({ ok: true, data: { urls: { 1: `https://r2.test/part/1?try=${links}` } } }); }
			if (url.startsWith("https://r2.test/part/1")) {
				puts++;
				return url.endsWith("try=1") ? new Response("expired", { status: 403 }) : new Response(null, { headers: { ETag: '"e1"' } });
			}
			throw new Error(`unexpected ${url}`);
		});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const kept = await keptOnPhone(7, { videoId: 41, segment: 1, etags: {} }, "video/mp4");
		const sending = kept.send(() => {});
		await vi.runAllTimersAsync();
		await sending;
		expect(links).toBe(2);
		expect(puts).toBe(2);
	});

	it("says how much an earlier segment still has to send, falling as its parts land", async () => {
		const stored = new Map<string, string>();
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
		vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
		vi.stubGlobal("navigator", { onLine: true });
		const store = await openStore();
		await store.putTail("43/1", 0, new Blob([new Uint8Array(300)], { type: "video/mp4" }));
		vi.stubGlobal("fetch", async (url: string) => (url.endsWith("/part-urls")
			? Response.json({ ok: true, data: { urls: { 1: "https://r2.test/part/1" } } }) : new Response(null, { headers: { ETag: '"e1"' } })));
		const kept = await keptOnPhone(9, { videoId: 43, segment: 1, etags: {} }, "video/mp4");
		expect(kept.left()).toBe(300);
		await kept.send(() => {});
		expect(kept.left()).toBe(0);
	});
});
