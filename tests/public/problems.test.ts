import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain browser module, no types
import { progressOf, progressWords, reportProblem } from "../../public/problems.js";

afterEach(() => vi.unstubAllGlobals());

describe("an upload that stopped, as the phone reports it", () => {
	it("says how far it got, how big the video is and how long it had been going", () => {
		expect(progressOf(42, 1_234_000_000, 0, 12.4 * 60_000)).toEqual({ pct: 42, mb: 1234, minutes: 12 });
		expect(progressWords(progressOf(42, 1_234_000_000, 0, 12.4 * 60_000))).toBe("At 42% of 1,234 MB, 12 min in");
		expect(progressWords(progressOf(0, 80_000_000, 0, 20_000))).toBe("At 0% of 80 MB, 0 min in");
	});

	it("sends the progress beside the words, and as a request that outlives the page when asked", async () => {
		const sent: Array<{ body: unknown; keepalive: boolean }> = [];
		vi.stubGlobal("document", { cookie: "" });
		vi.stubGlobal("fetch", async (_p: string, init: { body: string; keepalive: boolean }) => {
			sent.push({ body: JSON.parse(init.body), keepalive: init.keepalive });
			return Response.json({ ok: true, data: {} });
		});
		await reportProblem("upload", { gameId: 7, message: "At 42% of 1,234 MB, 12 min in: the page closed", progress: { pct: 42, mb: 1234, minutes: 12 }, keepalive: true });
		expect(sent).toEqual([{ keepalive: true, body: { what: "upload", gameId: 7, message: "At 42% of 1,234 MB, 12 min in: the page closed", progress: { pct: 42, mb: 1234, minutes: 12 } } }]);
	});
});
