import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeIndexedDb } from "../helpers/fake-indexeddb.ts";
// @ts-expect-error plain browser module, no types
import { record } from "../../public/golive-rec.js";

// Go live's recording reaches storage put right: a frame Safari wrote below zero (paused, or stopped as the camera
// stopped) is mended before its part goes, the last piece too, handed over as End game stops the recorder.

const u32 = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, body: number[]) => [...u32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];
const fragment = (durations: number[]) => [
	...box("moof", box("traf", [...box("tfhd", [0, 2, 0, 0, ...u32(2)]), ...box("trun", [0, 0, 3, 1, ...u32(durations.length), ...u32(0), ...durations.flatMap((d) => [...u32(d), ...u32(10)])])])),
	...box("mdat", new Array(durations.length * 10).fill(7)),
];
const HEAD = [...box("ftyp", [105, 115, 111, 109]), ...box("moov", new Array(20).fill(0))];
const below = (ticks: number) => 2 ** 32 - ticks;

// A recorder that hands over its last piece as it stops, then says it has stopped, as a phone's does.
class Phone {
	static made: Phone;
	state = "inactive";
	ondataavailable: ((e: { data: Blob }) => void) | null = null;
	last: number[] = [];
	private stops: Array<() => void> = [];
	constructor() { Phone.made = this; }
	addEventListener(type: string, fn: () => void) { if (type === "stop") this.stops.push(fn); }
	start() { this.state = "recording"; }
	pause() { this.state = "paused"; }
	resume() { this.state = "recording"; }
	requestData() {}
	stop() { this.state = "inactive"; this.hand(this.last); queueMicrotask(() => this.stops.forEach((fn) => fn())); }
	hand(bytes: number[]) { this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: "video/mp4" }) }); }
}

afterEach(() => vi.unstubAllGlobals());

describe("Go live's recording, as it reaches storage", () => {
	it("mends every frame below zero before its part goes, the last piece handed over at End game too", async () => {
		const stored = new Map<string, string>();
		vi.stubGlobal("MediaRecorder", Phone);
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
		vi.stubGlobal("document", { documentElement: { dataset: {} }, visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
		const parts: Record<number, Uint8Array> = {};
		vi.stubGlobal("fetch", async (url: string, init: { body: Blob | string }) => {
			if (url.endsWith("/part-urls")) { const n = JSON.parse(init.body as string).partNumbers[0]; return Response.json({ ok: true, data: { urls: { [n]: `https://r2.test/part/${n}` } } }); }
			if (url.startsWith("https://r2.test/part/")) { parts[Number(url.split("/").pop())] = new Uint8Array(await (init.body as Blob).arrayBuffer()); return new Response(null, { headers: { ETag: '"e"' } }); }
			if (url.endsWith("/complete")) return Response.json({ ok: true, data: {} });
			throw new Error(`unexpected ${url}`);
		});
		const rec = record({}, { videoId: 41, partSize: 100, mime: "video/mp4", gameId: 7 }, { onProgress: () => {}, hint: () => {}, onFatal: (e: unknown) => { throw e; } });
		await new Promise((r) => setTimeout(r, 20));
		const phone = Phone.made;
		const middle = fragment([20, below(6), 20]), last = fragment([20, below(309)]);
		phone.hand([...HEAD, ...middle.slice(0, 30)]); // a fragment split across two pieces
		phone.hand(middle.slice(30));
		rec.pause("camera"); // the camera stops, and End game comes while it's held
		phone.last = last;
		await rec.stop(() => {});
		const sent = [...Object.keys(parts)].sort((a, b) => Number(a) - Number(b)).flatMap((n) => [...parts[Number(n)]!]);
		expect(sent).toEqual([...HEAD, ...fragment([20, 20, 20]), ...fragment([20, 20])]);
		expect(Object.values(parts).slice(0, -1).every((p) => p.length === 100)).toBe(true);
	});

	it("carries on past a piece whose progress report fails, and a test thrown away keeps nothing on the phone", async () => {
		const idb = fakeIndexedDb();
		vi.stubGlobal("MediaRecorder", Phone);
		vi.stubGlobal("indexedDB", idb);
		vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
		vi.stubGlobal("document", { documentElement: { dataset: {} }, visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
		vi.stubGlobal("fetch", async () => new Promise(() => {}));
		let reports = 0;
		const onProgress = () => { if (++reports === 1) throw new Error("the page's progress bar broke"); };
		const rec = record({}, { videoId: 42, partSize: 10_000, mime: "video/mp4", gameId: 8 }, { onProgress, hint: () => {}, onFatal: () => {} });
		await new Promise((r) => setTimeout(r, 20));
		Phone.made.hand([...HEAD, ...fragment([20])]);
		Phone.made.hand(fragment([20]));
		await new Promise((r) => setTimeout(r, 20));
		expect(reports).toBe(2); // the second piece still went in after the first one's report failed
		Phone.made.last = fragment([20]);
		rec.cancel();
		await new Promise((r) => setTimeout(r, 50));
		expect(idb.rows("tail")).toEqual([]);
		expect(idb.rows("parts")).toEqual([]);
	});

	it("reports what an earlier segment still has to send beside its own, after Carry on", async () => {
		vi.stubGlobal("MediaRecorder", Phone);
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
		vi.stubGlobal("document", { documentElement: { dataset: {} }, visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
		vi.stubGlobal("fetch", async () => new Promise(() => {}));
		const reports: Array<{ earlierBytes: number }> = [];
		// A send that's refused counts as nothing left too: it isn't going to send anything more.
		const rec = record({}, { videoId: 44, partSize: 10_000, mime: "video/mp4", gameId: 10, segment: 2 }, { onProgress: (p: { earlierBytes: number }) => reports.push(p), hint: () => {}, onFatal: () => {} });
		let left = 5_000_000, done = () => {};
		rec.before(Object.assign(new Promise<void>((r) => { done = r; }), { left: () => left }));
		// Said at once, before any piece comes (End game may be tapped during a hold), and again once the send settles.
		expect(reports.map((p) => p.earlierBytes)).toEqual([5_000_000]);
		left = 3_000_000;
		done();
		await new Promise((r) => setTimeout(r, 20));
		expect(reports.map((p) => p.earlierBytes)).toEqual([5_000_000, 0]);
	});
});
