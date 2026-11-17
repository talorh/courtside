import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain browser module, no types
import { watchReporter } from "../../public/watch-report.js";

describe("a family's player trouble, sent to the Worker's logs", () => {
	let posted: Array<{ body: { gameId: number; kind: string; events: Array<{ s: number; what: string }> }; keepalive: boolean }>;
	const listeners: Record<string, () => void> = {};
	beforeEach(() => {
		vi.useFakeTimers();
		posted = [];
		vi.stubGlobal("location", { pathname: "/games/38" });
		vi.stubGlobal("document", { hidden: false, addEventListener: (type: string, fn: () => void) => { listeners[type] = fn; } });
		vi.stubGlobal("addEventListener", (type: string, fn: () => void) => { listeners[type] = fn; });
		vi.stubGlobal("fetch", async (_path: string, init: { body: string; keepalive: boolean }) => {
			posted.push({ body: JSON.parse(init.body), keepalive: init.keepalive });
			return new Response('{"ok":true,"data":{}}', { headers: { "Content-Type": "application/json" } });
		});
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("sends nothing while all's well", async () => {
		const report = watchReporter("live");
		report.fine();
		await vi.advanceTimersByTimeAsync(180_000);
		expect(posted).toEqual([]);
	});

	it("sends the trouble a minute at a time, with the game, and when the picture came back", async () => {
		const report = watchReporter("live");
		report.fine();
		await vi.advanceTimersByTimeAsync(5_000);
		report.trouble("live player: HTTP 502");
		await vi.advanceTimersByTimeAsync(10_000);
		report.trouble("connection failed");
		await vi.advanceTimersByTimeAsync(10_000);
		report.fine();
		report.fine();
		await vi.advanceTimersByTimeAsync(40_000);
		expect(posted).toEqual([{ keepalive: false, body: { gameId: 38, kind: "live", events: [
			{ s: 5, what: "live player: HTTP 502" }, { s: 15, what: "connection failed" }, { s: 25, what: "picture back after 20s" }] } }]);
	});

	it("before the page's first picture it's waiting, not trouble: a page opened long before tip-off sends one waiting line, then the first picture", async () => {
		const report = watchReporter("live");
		for (let i = 0; i < 100; i++) { report.trouble("live player: HTTP 409"); await vi.advanceTimersByTimeAsync(8_000); }
		report.fine();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(posted.flatMap((p) => p.body.events.map((e) => e.what))).toEqual(["waiting: live player: HTTP 409", "first picture after 800s"]);
	});

	it("notes the same trouble again only once it's changed", async () => {
		const report = watchReporter("live");
		report.fine();
		for (let i = 0; i < 10; i++) { report.trouble("connection failed"); await vi.advanceTimersByTimeAsync(8_000); }
		await vi.advanceTimersByTimeAsync(60_000);
		expect(posted.flatMap((p) => p.body.events.map((e) => e.what))).toEqual(["connection failed"]);
	});

	it("a batch that couldn't be sent (the venue's signal dropped) is sent with the next", async () => {
		const report = watchReporter("live");
		report.fine();
		let down = true;
		const send = globalThis.fetch;
		vi.stubGlobal("fetch", async (path: string, init: { body: string; keepalive: boolean }) => { if (down) throw new TypeError("Failed to fetch"); return send(path, init); });
		report.trouble("connection failed");
		await vi.advanceTimersByTimeAsync(60_000);
		down = false;
		report.trouble("picture stopped");
		await vi.advanceTimersByTimeAsync(60_000);
		expect(posted.flatMap((p) => p.body.events.map((e) => e.what))).toEqual(["connection failed", "picture stopped"]);
	});

	it("sends what's waiting as the page hides or closes, as a request that outlives it", async () => {
		const report = watchReporter("video");
		report.fine();
		report.trouble("player error");
		listeners.pagehide!();
		expect(posted).toEqual([{ keepalive: true, body: { gameId: 38, kind: "video", events: [{ s: 0, what: "player error" }] } }]);
	});

	it("isn't on a game's page (no game): sends nothing", async () => {
		vi.stubGlobal("location", { pathname: "/live" });
		const report = watchReporter("live");
		report.trouble("connection failed");
		await vi.advanceTimersByTimeAsync(60_000);
		expect(posted).toEqual([]);
	});
});
