import { describe, expect, it } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { AT_ONCE, oneAtATime, QUICK_MS, sendPhotos, uploadLanes } from "../../public/photo-queue.js";

const STOP = Object.assign(new Error("Signed out."), { status: 401 });
const isStop = (err: { status?: number }) => err.status === 401;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A send the test finishes by hand: each call waits until the test resolves or rejects it. */
function heldSends() {
	const calls: Array<{ file: string; ok: () => void; fail: (err: Error) => void }> = [];
	const send = (file: string) => new Promise<void>((resolve, reject) => { calls.push({ file, ok: resolve, fail: reject }); });
	return { calls, send };
}

describe("sending the chosen photos", () => {
	it("sends the first on its own, then up to three at once, and counts each as it's done", async () => {
		const { calls, send } = heldSends();
		const seen: number[] = [];
		const run = sendPhotos(["a", "b", "c", "d", "e"], send, (done: number) => seen.push(done), isStop);
		await tick();
		expect(calls.map((c) => c.file)).toEqual(["a"]);
		calls[0].ok();
		await tick();
		expect(calls.map((c) => c.file)).toEqual(["a", "b", "c", "d"]);
		expect(AT_ONCE).toBe(3);
		calls[2].ok();
		await tick();
		expect(calls.map((c) => c.file)).toEqual(["a", "b", "c", "d", "e"]);
		for (const c of calls.slice(1)) c.ok();
		expect(await run).toEqual({ added: 5, skipped: [], stopped: null });
		expect(seen).toEqual([1, 2, 3, 4, 5]);
	});

	it("stops at the first photo when the site turns it down for a reason that would turn down the rest", async () => {
		const sent: string[] = [];
		const result = await sendPhotos(["a", "b", "c"], async (file: string) => { sent.push(file); throw STOP; }, () => {}, isStop);
		expect(sent).toEqual(["a"]);
		expect(result).toEqual({ added: 0, skipped: [], stopped: STOP });
	});

	it("starts no more once one is turned down that way later on; the ones already sending finish", async () => {
		const { calls, send } = heldSends();
		const run = sendPhotos(["a", "b", "c", "d", "e"], send, () => {}, isStop);
		await tick();
		calls[0].ok();
		await tick();
		calls[1].fail(STOP);
		await tick();
		calls[2].ok();
		calls[3].ok();
		expect(await run).toEqual({ added: 3, skipped: [], stopped: STOP });
		expect(calls.map((c) => c.file)).toEqual(["a", "b", "c", "d"]);
	});

	it("lists the ones skipped in the order they were chosen, however they finish", async () => {
		const { calls, send } = heldSends();
		const run = sendPhotos(["a", "b", "c", "d"], send, () => {}, isStop);
		await tick();
		calls[0].ok();
		await tick();
		calls[2].fail(new Error("too old"));
		await tick();
		calls[1].fail(new Error("not a photo"));
		calls[3].ok();
		const { added, skipped } = await run;
		expect(added).toBe(2);
		expect(skipped.map((s: { file: string; error: Error }) => [s.file, s.error.message])).toEqual([["b", "not a photo"], ["c", "too old"]]);
	});
});

describe("one at a time", () => {
	it("runs each call after the one before has finished, even when that one failed", async () => {
		const order: string[] = [];
		const step = oneAtATime(async (name: string) => {
			order.push(`start ${name}`);
			await tick();
			order.push(`end ${name}`);
			if (name === "a") throw new Error("a failed");
			return name;
		});
		const results = await Promise.allSettled([step("a"), step("b")]);
		expect(order).toEqual(["start a", "end a", "start b", "end b"]);
		expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
	});
});

describe("how many go up at once", () => {
	/** An upload try the test finishes by hand, noting when it started. */
	function held(started: string[], name: string) {
		let done = () => {};
		const promise = new Promise<void>((resolve) => { done = resolve; });
		return { run: () => { started.push(name); return promise; }, done: () => done() };
	}

	it("one at a time until the first photo has gone up quickly", async () => {
		const lanes = uploadLanes();
		const started: string[] = [];
		const [a, b] = [held(started, "a"), held(started, "b")];
		const runs = [lanes.run(a.run), lanes.run(b.run)];
		await tick();
		expect(started).toEqual(["a"]);
		a.done();
		await runs[0];
		await tick();
		expect(started).toEqual(["a", "b"]);
		b.done();
		await runs[1];
	});

	it("several at once once the first went up within QUICK_MS", async () => {
		const lanes = uploadLanes();
		lanes.sent(QUICK_MS);
		const started: string[] = [];
		const [a, b] = [held(started, "a"), held(started, "b")];
		const runs = [lanes.run(a.run), lanes.run(b.run)];
		await tick();
		expect(started).toEqual(["a", "b"]);
		a.done(); b.done();
		await Promise.all(runs);
	});

	it("stays one at a time when the first was slow: only the first photo's time counts", async () => {
		const lanes = uploadLanes();
		lanes.sent(QUICK_MS + 1);
		lanes.sent(100);
		const started: string[] = [];
		const [a, b] = [held(started, "a"), held(started, "b")];
		const runs = [lanes.run(a.run), lanes.run(b.run)];
		await tick();
		expect(started).toEqual(["a"]);
		a.done(); b.done();
		await Promise.all(runs);
	});

	it("goes back to one at a time for good at the first trouble reaching the site", async () => {
		const lanes = uploadLanes();
		lanes.sent(100);
		lanes.trouble();
		const started: string[] = [];
		const [a, b] = [held(started, "a"), held(started, "b")];
		const runs = [lanes.run(a.run), lanes.run(b.run)];
		await tick();
		expect(started).toEqual(["a"]);
		a.done(); b.done();
		await Promise.all(runs);
	});

	it("a try that fails doesn't hold up the next", async () => {
		const lanes = uploadLanes();
		const results = await Promise.allSettled([lanes.run(async () => { throw new Error("dropped"); }), lanes.run(async () => "in")]);
		expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
	});
});
