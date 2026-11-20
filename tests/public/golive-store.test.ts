import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeIndexedDb } from "../helpers/fake-indexeddb.ts";
// @ts-expect-error plain browser module, no types
import { keeper, leftovers, openStore, recoveryPlan } from "../../public/golive-store.js";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const blob = (size: number) => new Blob([new Uint8Array(size)], { type: "video/mp4" });

describe("what a closed page kept for the next one to send", () => {
	it("sends the parts storage never confirmed, lowest first, then the tail as the part after the highest known", () => {
		const plan = recoveryPlan({ parts: [{ n: 4 }, { n: 3 }], tail: [blob(30), blob(20)] }, { 1: '"e1"', 2: '"e2"' }, "video/mp4", 100);
		expect(plan.parts.map((p: { n: number }) => p.n)).toEqual([3, 4]);
		expect(plan.tail?.n).toBe(5);
		expect(plan.tail?.blob.size).toBe(50);
		expect(plan.bytes).toBe(250);
	});
	it("leaves out a kept part that storage did confirm (its upload finished as the page died)", () => {
		const plan = recoveryPlan({ parts: [{ n: 3 }, { n: 4 }], tail: [] }, { 1: '"e1"', 2: '"e2"', 3: '"e3"' }, "video/mp4", 100);
		expect(plan.parts.map((p: { n: number }) => p.n)).toEqual([4]);
		expect(plan.tail).toBeNull();
		expect(plan.bytes).toBe(100);
	});
	it("a tail alone goes as the next part; nothing kept is nothing to send", () => {
		expect(recoveryPlan({ parts: [], tail: [blob(10)] }, { 1: '"e1"' }, "video/mp4", 100).tail?.n).toBe(2);
		expect(recoveryPlan({ parts: [], tail: [blob(10)] }, {}, "video/mp4", 100).tail?.n).toBe(1);
		expect(recoveryPlan({ parts: [], tail: [] }, { 1: '"e1"' }, "video/mp4", 100)).toEqual({ parts: [], tail: null, bytes: 0 });
	});
	it("without a store (no IndexedDB) there's nothing to send", async () => {
		expect(await leftovers(null, "41/1", { 1: '"e1"' }, "video/mp4", 100)).toEqual({ parts: [], tail: null, bytes: 0 });
	});
	it("reads a store's part numbers and tail into the plan, each part counted at the part size", async () => {
		const store = { listParts: async () => [{ n: 2 }], listTail: async () => [blob(3)] };
		const plan = await leftovers(store, "41/1", { 1: '"e1"' }, "video/mp4", 8);
		expect(plan.parts.map((p: { n: number }) => p.n)).toEqual([2]);
		expect(plan.tail?.n).toBe(3);
		expect(plan.bytes).toBe(11);
	});
	it("lists the kept parts without reading their bytes: each is read on its own when it's sent", async () => {
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		const k = keeper(41, 1);
		k.cut([{ n: 1, blob: blob(5) }, { n: 2, blob: blob(6) }], blob(0));
		await new Promise((resolve) => setTimeout(resolve, 20));
		const store = await openStore();
		const listed = await store.listParts("41/1");
		expect(listed).toEqual([{ n: 1 }, { n: 2 }]);
		expect((await store.getPart("41/1", 2)).size).toBe(6);
		expect(await store.getPart("41/1", 9)).toBeNull();
	});
	it("a store that won't open is an error to the page that asks strictly, not an empty phone", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.stubGlobal("indexedDB", { open: () => { throw new Error("quota"); } });
		expect(await openStore()).toBeNull();
		await expect(openStore({ strict: true })).rejects.toThrow("quota");
		vi.stubGlobal("indexedDB", undefined);
		expect(await openStore({ strict: true })).toBeNull();
	});
});

describe("what the page keeps on the phone as it records", () => {
	const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
	const bytes = (fill: number, size: number) => new Blob([new Uint8Array(size).fill(fill)], { type: "video/mp4" });
	const kept = async (key: string) => {
		const store = await openStore();
		const tail = new Uint8Array(await new Blob(await store.listTail(key)).arrayBuffer());
		const parts = [];
		for (const { n } of await store.listParts(key)) parts.push([n, (await store.getPart(key, n)).size]);
		return { parts, tail: [...tail] };
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
		k.cut([{ n: 1, blob: bytes(9, 5) }], bytes(2, 2));
		await settle();
		expect(await kept("41/1")).toEqual({ parts: [[1, 5]], tail: [2, 2] });
		k.chunk(bytes(3, 2));
		await settle();
		expect((await kept("41/1")).tail).toEqual([2, 2, 3, 3]);
	});
	it("the parts cut and the tail left over are written in one go, so a page that dies between them can't keep a part twice", async () => {
		const idb = fakeIndexedDb();
		vi.stubGlobal("indexedDB", idb);
		const k = keeper(41, 1);
		await settle();
		const before = idb.transactions.length;
		k.cut([{ n: 1, blob: bytes(9, 5) }, { n: 2, blob: bytes(8, 5) }], bytes(2, 2));
		await settle();
		expect(idb.transactions.slice(before)).toEqual([["parts", "tail"]]);
		expect(await kept("41/1")).toEqual({ parts: [[1, 5], [2, 5]], tail: [2, 2] });
	});
	it("a last piece cut at End game leaves no tail behind", async () => {
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		const k = keeper(41, 1);
		k.chunk(bytes(1, 3));
		k.cut([{ n: 1, blob: bytes(1, 3) }], bytes(0, 0));
		await settle();
		expect(await kept("41/1")).toEqual({ parts: [[1, 3]], tail: [] });
	});
	it("a part that reached storage is let go", async () => {
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		const k = keeper(41, 1);
		k.cut([{ n: 1, blob: bytes(9, 5) }], bytes(0, 0));
		k.sent(1);
		await settle();
		expect((await kept("41/1")).parts).toEqual([]);
	});
	it("a store that fails is told once (the page sends it to the site's log), and the recording carries on", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const idb = fakeIndexedDb();
		vi.stubGlobal("indexedDB", idb);
		const problems: string[] = [];
		const k = keeper(41, 1, (err: Error) => problems.push(String(err.message)));
		await settle();
		const broken = new Error("QuotaExceededError");
		vi.spyOn(Blob.prototype, "arrayBuffer").mockRejectedValue(broken);
		await k.cut([{ n: 1, blob: bytes(1, 4) }], bytes(0, 0));
		k.chunk(bytes(2, 2));
		await settle();
		expect(problems).toEqual(["QuotaExceededError"]);
	});
	it("a store that won't open is told too; a browser with none has nothing to tell", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const problems: string[] = [];
		vi.stubGlobal("indexedDB", { open: () => { throw new Error("storage didn't open"); } });
		keeper(41, 1, (err: Error) => problems.push(err.message));
		await settle();
		vi.stubGlobal("indexedDB", undefined);
		keeper(42, 1, (err: Error) => problems.push(err.message));
		await settle();
		expect(problems).toEqual(["storage didn't open"]);
	});
	it("says whether the phone's storage opened, so a later page knows if it could have kept anything", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.stubGlobal("indexedDB", fakeIndexedDb());
		expect(await keeper(41, 1).opened).toBe(true);
		vi.stubGlobal("indexedDB", { open: () => { throw new Error("storage didn't open"); } });
		expect(await keeper(42, 1).opened).toBe(false);
		vi.stubGlobal("indexedDB", undefined);
		expect(await keeper(43, 1).opened).toBe(false);
	});
});
