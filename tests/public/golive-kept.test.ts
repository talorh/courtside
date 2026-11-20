import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeIndexedDb } from "../helpers/fake-indexeddb.ts";
// @ts-expect-error plain browser module, no types
import { keptOnPhone, minutesOf, sendingWords } from "../../public/golive-kept.js";
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

	const reported: string[] = [];
	const phone = () => {
		const stored = new Map<string, string>();
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
		vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
		vi.stubGlobal("navigator", { onLine: true });
		const sent: number[] = [];
		reported.length = 0;
		vi.stubGlobal("fetch", async (url: string, init: { body: string | Blob }) => {
			if (url.endsWith("/events")) { reported.push(init.body as string); return Response.json({ ok: true, data: {} }); }
			if (url.endsWith("/part-urls")) { const n = JSON.parse(init.body as string).partNumbers[0]; return Response.json({ ok: true, data: { urls: { [n]: `https://r2.test/part/${n}` } } }); }
			sent.push(Number(url.split("/").pop()));
			return new Response(null, { headers: { ETag: '"e"' } });
		});
		return sent;
	};
	const mp4 = (size: number) => new Blob([new Uint8Array(size)], { type: "video/mp4" });

	it("sends each kept part read from the phone on its own, saying which part of how many and how much is to go", async () => {
		const sent = phone();
		const store = await openStore();
		await store.putPart("44/1", 1, mp4(1_000_000));
		await store.putPart("44/1", 2, mp4(1_000_000));
		await store.putTail("44/1", 0, mp4(500_000));
		const kept = await keptOnPhone(9, { videoId: 44, segment: 1, etags: {}, partSize: 1_000_000 }, "video/mp4");
		expect(kept.bytes).toBe(2_500_000);
		const said: Array<[string, unknown]> = [];
		await kept.send((text: string, progress: unknown) => said.push([text, progress]));
		expect(sent).toEqual([1, 2, 3]);
		expect(said[0]).toEqual(["Sending what was still on this phone: part 1 of 3, 3 MB to go. Keep this page open: don't refresh or close it.", { sent: 0, count: 3 }]);
		expect(said[2][1]).toEqual({ sent: 2, count: 3 });
		expect(said.at(-1)).toEqual(["Sent what was on this phone.", { sent: 3, count: 3 }]);
		expect(kept.left()).toBe(0);
	});
	it("a kept part that's gone from the phone (another page sent it) is passed over", async () => {
		const sent = phone();
		const store = await openStore();
		await store.putPart("45/1", 1, mp4(10));
		await store.putPart("45/1", 2, mp4(10));
		const kept = await keptOnPhone(9, { videoId: 45, segment: 1, etags: {}, partSize: 10 }, "video/mp4");
		await store.delPart("45/1", 1);
		await kept.send(() => {});
		expect(sent).toEqual([2]);
		expect(reported.join(" ")).toContain("kept part 1 of segment 1 was gone from the phone");
	});
	it("a phone whose storage won't open is an error, not a phone with nothing kept", async () => {
		phone();
		vi.stubGlobal("indexedDB", { open: () => { throw new Error("storage didn't open"); } });
		await expect(keptOnPhone(9, { videoId: 46, segment: 1, etags: {}, partSize: 10 }, "video/mp4")).rejects.toThrow("storage didn't open");
	});
	it("says how long the rest will take once it has seen a part or two go", () => {
		expect(sendingWords({ i: 1, count: 95, left: 760_000_000 })).toBe("Sending what was still on this phone: part 1 of 95, 760 MB to go. Keep this page open: don't refresh or close it.");
		// 16 MB went in 20 seconds: 760 MB more is about 16 minutes.
		expect(sendingWords({ i: 3, count: 95, left: 760_000_000, sentBytes: 16_000_000, elapsedMs: 20_000 }))
			.toBe("Sending what was still on this phone: part 3 of 95, 760 MB to go, about 16 minutes. Keep this page open: don't refresh or close it.");
		expect(sendingWords({ i: 95, count: 95, left: 8_000_000, sentBytes: 752_000_000, elapsedMs: 900_000 }))
			.toBe("Sending what was still on this phone: part 95 of 95, 8 MB to go, about 1 minute. Keep this page open: don't refresh or close it.");
	});
	it("puts the phone's bytes in minutes at its own rate when the note knows it", () => {
		expect(minutesOf(780_000_000, 34_000_000)).toBe(23);
		expect(minutesOf(780_000_000)).toBe(42);
	});
	it("a part that has landed stays sent even if clearing it from the phone fails: the send carries on, nothing goes twice", async () => {
		const sent = phone();
		const store = await openStore();
		await store.putPart("47/1", 1, mp4(10));
		await store.putTail("47/1", 0, mp4(4));
		const kept = await keptOnPhone(9, { videoId: 47, segment: 1, etags: {}, partSize: 10 }, "video/mp4");
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const idb = (globalThis as unknown as { indexedDB: { failDeletes?: boolean } }).indexedDB;
		idb.failDeletes = true;
		await kept.send(() => {});
		expect(sent).toEqual([1, 2]);
		expect(reported.join(" ")).toContain("couldn't clear");
	});
});
