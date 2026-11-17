import { afterEach, describe, expect, it, vi } from "vitest";
import { timedRun } from "../../src/jobs/cron-run.ts";

afterEach(() => vi.restoreAllMocks());
const line = (spy: { mock: { calls: unknown[][] } }) => JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;

describe("each cron run's line in the Worker's logs", () => {
	it("says which trigger ran and how long it took", async () => {
		const logged = vi.spyOn(console, "log").mockImplementation(() => {});
		await timedRun("*/5 * * * *", async () => {});
		expect(line(logged)).toEqual({ event: "cron_run", teamId: null, cron: "*/5 * * * *", ok: true, ms: expect.any(Number) });
	});

	it("says a run failed, how many things failed in it, and still fails the run", async () => {
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const failure = new AggregateError([new Error("a"), new Error("b")], "sync_videos: 2 record(s) failed");
		await expect(timedRun("0 16 * * *", async () => { throw failure; })).rejects.toBe(failure);
		expect(line(errors)).toMatchObject({ event: "cron_run", cron: "0 16 * * *", ok: false, errorCount: 2, error: "AggregateError: sync_videos: 2 record(s) failed" });
	});
});
