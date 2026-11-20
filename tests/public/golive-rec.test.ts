import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeIndexedDb } from "../helpers/fake-indexeddb.ts";
// @ts-expect-error plain browser module, no types
import { record } from "../../public/golive-rec.js";
// @ts-expect-error plain browser module, no types
import { recoveryPlan } from "../../public/golive-store.js";

// The phone's recorder, as far as the page uses it: the test hands over the pieces itself.
class FakeRecorder {
	static made: FakeRecorder;
	state = "inactive";
	asked = 0;
	ondataavailable: ((e: { data: Blob }) => void) | null = null;
	constructor() { FakeRecorder.made = this; }
	addEventListener() {}
	start() { this.state = "recording"; }
	pause() { this.state = "paused"; }
	resume() { this.state = "recording"; }
	stop() { this.state = "inactive"; }
	requestData() { this.asked++; this.hand(0); }
	hand(bytes: number) { this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) }); }
}

describe("Go live's recording: how long since the phone handed any over", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("MediaRecorder", FakeRecorder);
		vi.stubGlobal("indexedDB", fakeIndexedDb());
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	const start = async () => {
		const rec = record({}, { videoId: 41, partSize: 8_000_000, mime: "video/mp4", gameId: 7 }, { onProgress: () => {}, hint: () => {}, onFatal: () => {} });
		await vi.advanceTimersByTimeAsync(0); // the phone's storage opens
		return { rec, phone: FakeRecorder.made };
	};

	it("starts again with each piece of recording", async () => {
		const { rec, phone } = await start();
		vi.advanceTimersByTime(2000);
		expect(rec.quietFor()).toBe(2000);
		phone.hand(500);
		expect(rec.quietFor()).toBe(0);
	});
	it("an empty piece isn't recording: a recorder that answers with nothing is still quiet", async () => {
		const { rec, phone } = await start();
		vi.advanceTimersByTime(24_000);
		expect(phone.asked).toBeGreaterThan(0); // it was asked for what it has, and handed over nothing each time
		expect(rec.quietFor()).toBe(24_000);
	});
	it("a break isn't quiet: the count starts again when the recording carries on", async () => {
		const { rec, phone } = await start();
		phone.hand(500);
		rec.pause("break");
		vi.advanceTimersByTime(600_000);
		rec.resume("break");
		expect(rec.quietFor()).toBe(0);
		vi.advanceTimersByTime(3000);
		expect(rec.quietFor()).toBe(3000);
	});
	it("still held by something else, it hasn't carried on", async () => {
		const { rec, phone } = await start();
		rec.pause("break");
		rec.pause("away");
		vi.advanceTimersByTime(60_000);
		rec.resume("away");
		expect(phone.state).toBe("paused");
		expect(rec.quietFor()).toBe(60_000);
	});
	it("says what the phone's recorder is doing", async () => {
		const { rec } = await start();
		expect(rec.state()).toBe("recording");
		rec.pause("break");
		expect(rec.state()).toBe("paused");
	});
});

describe("Go live's recording at End game: the last piece is kept as a part of its own", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("once every part has landed, the phone keeps nothing that a later page would send again as one more part", async () => {
		const idb = fakeIndexedDb();
		const stored = new Map<string, string>();
		vi.stubGlobal("MediaRecorder", StoppingRecorder);
		vi.stubGlobal("indexedDB", idb);
		vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
		vi.stubGlobal("document", { documentElement: { dataset: {} }, visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
		const sizes: Record<number, number> = {};
		vi.stubGlobal("fetch", async (url: string, init: { body: Blob | string }) => {
			if (url.endsWith("/part-urls")) { const n = JSON.parse(init.body as string).partNumbers[0]; return Response.json({ ok: true, data: { urls: { [n]: `https://r2.test/part/${n}` } } }); }
			if (url.startsWith("https://r2.test/part/")) { sizes[Number(url.split("/").pop())] = (init.body as Blob).size; return new Response(null, { headers: { ETag: `"e${url.split("/").pop()}"` } }); }
			if (url.endsWith("/complete")) return new Promise(() => {}); // the signal goes: Complete never answers, and the page dies
			throw new Error(`unexpected ${url}`);
		});
		const rec = record({}, { videoId: 41, partSize: 1000, mime: "video/mp4", gameId: 7 }, { onProgress: () => {}, hint: () => {}, onFatal: (e: unknown) => { throw e; } });
		await new Promise((r) => setTimeout(r, 20));
		const phone = StoppingRecorder.made;
		phone.hand(1000); phone.hand(1000); phone.hand(400); // two whole parts and a last piece of 400 bytes
		void rec.stop(() => {});
		await new Promise((r) => setTimeout(r, 200));
		expect(sizes).toEqual({ 1: 1000, 2: 1000, 3: 400 });
		const note = JSON.parse(stored.get("courtside-live:7")!);
		const parts = idb.rows("parts").map((r) => ({ n: r.n as number, blob: new Blob([r.bytes as ArrayBuffer]) }));
		const tail = idb.rows("tail").map((r) => new Blob([r.bytes as ArrayBuffer]));
		expect(Object.keys(note.etags)).toEqual(["1", "2", "3"]);
		expect(recoveryPlan({ parts, tail }, note.etags, "video/mp4", 1000)).toEqual({ parts: [], tail: null, bytes: 0 });
	});
});

describe("Go live's recording: what a page reopened later needs to know", () => {
	afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

	it("counts the recording's own rate, once it has a minute of it, and remembers it for the next page", async () => {
		vi.useFakeTimers();
		vi.stubGlobal("MediaRecorder", FakeRecorder);
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		const notes = new Map<string, string>();
		vi.stubGlobal("localStorage", { getItem: (k: string) => notes.get(k) ?? null, setItem: (k: string, v: string) => notes.set(k, v), removeItem: (k: string) => notes.delete(k) });
		const seen: Array<{ bytesPerMinute?: number }> = [];
		record({}, { videoId: 41, partSize: 8_000_000, mime: "video/mp4", gameId: 7 }, { onProgress: (p: { bytesPerMinute?: number }) => seen.push(p), hint: () => {}, onFatal: () => {} });
		await vi.advanceTimersByTimeAsync(0);
		const phone = FakeRecorder.made;
		await vi.advanceTimersByTimeAsync(30_000);
		phone.hand(1000);
		await vi.advanceTimersByTimeAsync(0);
		expect(seen.at(-1)?.bytesPerMinute).toBeUndefined(); // under a minute: too soon to say
		await vi.advanceTimersByTimeAsync(90_000);
		phone.hand(2000);
		await vi.advanceTimersByTimeAsync(0);
		expect(seen.at(-1)?.bytesPerMinute).toBe(1500); // 3,000 bytes in 2 minutes
		expect(JSON.parse(notes.get("courtside-live:7")!).bytesPerMinute).toBe(1500);
	});
	it("notes whether the phone's storage is keeping the recording, for a page reopened later", async () => {
		vi.stubGlobal("MediaRecorder", FakeRecorder);
		const notes = new Map<string, string>();
		vi.stubGlobal("localStorage", { getItem: (k: string) => notes.get(k) ?? null, setItem: (k: string, v: string) => notes.set(k, v), removeItem: (k: string) => notes.delete(k) });
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		record({}, { videoId: 41, partSize: 8_000_000, mime: "video/mp4", gameId: 7 }, { onProgress: () => {}, hint: () => {}, onFatal: () => {} });
		await new Promise((r) => setTimeout(r, 20));
		expect(JSON.parse(notes.get("courtside-live:7")!).keeps).toBe(true);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.stubGlobal("indexedDB", { open: () => { throw new Error("storage didn't open"); } });
		record({}, { videoId: 42, partSize: 8_000_000, mime: "video/mp4", gameId: 8 }, { onProgress: () => {}, hint: () => {}, onFatal: () => {} });
		await new Promise((r) => setTimeout(r, 20));
		expect(JSON.parse(notes.get("courtside-live:8")!).keeps).toBe(false);
	});
});

// A recorder that stops when asked, and says so a moment later, as a phone's does.
class StoppingRecorder {
	static made: StoppingRecorder;
	state = "inactive";
	ondataavailable: ((e: { data: Blob }) => void) | null = null;
	private stops: Array<() => void> = [];
	constructor() { StoppingRecorder.made = this; }
	addEventListener(type: string, fn: () => void) { if (type === "stop") this.stops.push(fn); }
	start() { this.state = "recording"; }
	pause() {}
	resume() {}
	requestData() {}
	stop() { this.state = "inactive"; queueMicrotask(() => this.stops.forEach((fn) => fn())); }
	hand(bytes: number) { this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: "video/mp4" }) }); }
}
