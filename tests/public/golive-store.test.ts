import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeIndexedDb } from "../helpers/fake-indexeddb.ts";
// @ts-expect-error plain browser module, no types
import { keeper, leftovers, openStore, recoveryPlan } from "../../public/golive-store.js";

afterEach(() => vi.unstubAllGlobals());

const blob = (size: number) => new Blob([new Uint8Array(size)], { type: "video/mp4" });

describe("what a closed page kept for the next one to send", () => {
	it("sends the parts storage never confirmed, lowest first, then the tail as the part after the highest known", () => {
		const plan = recoveryPlan({ parts: [{ n: 4, blob: blob(100) }, { n: 3, blob: blob(100) }], tail: [blob(30), blob(20)] }, { 1: '"e1"', 2: '"e2"' }, "video/mp4");
		expect(plan.parts.map((p: { n: number }) => p.n)).toEqual([4, 3].sort());
		expect(plan.tail?.n).toBe(5);
		expect(plan.tail?.blob.size).toBe(50);
		expect(plan.bytes).toBe(250);
	});
	it("leaves out a kept part that storage did confirm (its upload finished as the page died)", () => {
		const plan = recoveryPlan({ parts: [{ n: 3, blob: blob(100) }, { n: 4, blob: blob(100) }], tail: [] }, { 1: '"e1"', 2: '"e2"', 3: '"e3"' }, "video/mp4");
		expect(plan.parts.map((p: { n: number }) => p.n)).toEqual([4]);
		expect(plan.tail).toBeNull();
		expect(plan.bytes).toBe(100);
	});
	it("a tail alone goes as the next part; nothing kept is nothing to send", () => {
		expect(recoveryPlan({ parts: [], tail: [blob(10)] }, { 1: '"e1"' }, "video/mp4").tail?.n).toBe(2);
		expect(recoveryPlan({ parts: [], tail: [blob(10)] }, {}, "video/mp4").tail?.n).toBe(1);
		expect(recoveryPlan({ parts: [], tail: [] }, { 1: '"e1"' }, "video/mp4")).toEqual({ parts: [], tail: null, bytes: 0 });
	});
	it("without a store (no IndexedDB) there's nothing to send", async () => {
		expect(await leftovers(null, "41/1", { 1: '"e1"' }, "video/mp4")).toEqual({ parts: [], tail: null, bytes: 0 });
	});
	it("reads a store's parts and tail into the plan", async () => {
		const store = { listParts: async () => [{ n: 2, blob: blob(8) }], listTail: async () => [blob(3)] };
		const plan = await leftovers(store, "41/1", { 1: '"e1"' }, "video/mp4");
		expect(plan.parts.map((p: { n: number }) => p.n)).toEqual([2]);
		expect(plan.tail?.n).toBe(3);
		expect(plan.bytes).toBe(11);
	});
});

describe("what the page keeps on the phone as it records", () => {
	const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
	const bytes = (fill: number, size: number) => new Blob([new Uint8Array(size).fill(fill)], { type: "video/mp4" });
	const kept = async (key: string) => {
		const store = await openStore();
		const tail = new Uint8Array(await new Blob(await store.listTail(key)).arrayBuffer());
		return { parts: (await store.listParts(key)).map((p: { n: number; blob: Blob }) => [p.n, p.blob.size]), tail: [...tail] };
	};

	it("keeps each piece of the recording in order, as the tail", async () => {
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		const k = keeper(41, 1);
		k.chunk(bytes(1, 3));
		k.chunk(bytes(2, 2));
		await settle();
		expect(await kept("41/1")).toEqual({ parts: [], tail: [1, 1, 1, 2, 2] });
	});
	it("after a part is cut, the tail is what's left over and nothing more: the piece that filled the part isn't kept twice", async () => {
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		const k = keeper(41, 1);
		k.chunk(bytes(1, 3));
		await settle();
		// The next piece fills the part: the page keeps the piece, cuts the part, and starts the tail again, all at once.
		k.chunk(bytes(2, 4));
		k.part(1, bytes(9, 5));
		k.cutTail(bytes(2, 2));
		await settle();
		expect(await kept("41/1")).toEqual({ parts: [[1, 5]], tail: [2, 2] });
		k.chunk(bytes(3, 2));
		await settle();
		expect((await kept("41/1")).tail).toEqual([2, 2, 3, 3]);
	});
	it("a part that reached storage is let go", async () => {
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		const k = keeper(41, 1);
		k.part(1, bytes(9, 5));
		k.sent(1);
		await settle();
		expect((await kept("41/1")).parts).toEqual([]);
	});
});
