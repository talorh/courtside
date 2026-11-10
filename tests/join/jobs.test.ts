import { describe, expect, it, vi } from "vitest";
// @ts-expect-error plain Node, no types: the container runs it as it is
import { createJobs, jobId } from "../../join/jobs.mjs";

const ask = (output: string, start = true) => ({ segments: ["https://r2/a?sig=1", "https://r2/b?sig=2"], output, container: "mp4", start });
const OUT = "https://r2/bucket/originals/t/x/live.joined.mp4?sig=3";
/** A run the test ends by hand: `end(answer)` or `fail(error)`. */
function held() {
	const calls: Array<{ req: { output: string }; signal: AbortSignal; end: (a: unknown) => void; fail: (e: unknown) => void }> = [];
	const run = (req: { output: string }, signal: AbortSignal) => new Promise((end, fail) => { calls.push({ req, signal, end, fail }); });
	return { calls, run };
}

describe("the joiner's jobs", () => {
	it("knows a join by where its file goes, whatever the link's signature", () => {
		expect(jobId("https://r2/bucket/originals/t/x/live.joined.mp4?sig=3")).toBe("/bucket/originals/t/x/live.joined.mp4");
		expect(jobId("https://r2/bucket/originals/t/x/live.joined.mp4?sig=4")).toBe(jobId(OUT));
	});
	it("begins a join on the first ask, says it's running while it is, then tells how it went once", async () => {
		const { calls, run } = held();
		const jobs = createJobs(run, { log: () => {} });
		expect(jobs.ask(ask(OUT))).toEqual({ ok: true, state: "running", started: true });
		await Promise.resolve();
		expect(calls).toHaveLength(1);
		expect(jobs.ask(ask("https://r2/bucket/originals/t/x/live.joined.mp4?sig=9"))).toEqual({ ok: true, state: "running" });
		calls[0]!.end({ ok: true, bytes: 1234, seconds: 9, took: { read: 4, join: 1, store: 4 } });
		await jobs.idle();
		expect(jobs.ask(ask(OUT, false))).toEqual({ ok: true, state: "done", bytes: 1234, seconds: 9, took: { read: 4, join: 1, store: 4 } });
		expect(jobs.ask(ask(OUT, false))).toEqual({ ok: true, state: "none" });
		expect(calls).toHaveLength(1);
	});
	it("an ask that may not start one begins nothing", async () => {
		const { calls, run } = held();
		const jobs = createJobs(run, { log: () => {} });
		expect(jobs.ask(ask(OUT, false))).toEqual({ ok: true, state: "none" });
		await jobs.idle();
		expect(calls).toHaveLength(0);
	});
	it("a join that failed, or threw, is told once; the next ask begins it again", async () => {
		const { calls, run } = held();
		const jobs = createJobs(run, { log: () => {} });
		jobs.ask(ask(OUT));
		await Promise.resolve();
		calls[0]!.end({ ok: false, reason: "ffmpeg: moov atom not found" });
		await jobs.idle();
		expect(jobs.ask(ask(OUT))).toEqual({ ok: false, state: "failed", reason: "ffmpeg: moov atom not found" });
		expect(jobs.ask(ask(OUT))).toEqual({ ok: true, state: "running", started: true });
		await Promise.resolve();
		calls[1]!.fail(new Error("a segment can't be read (HTTP 403)"));
		await jobs.idle();
		expect(jobs.ask(ask(OUT, false))).toEqual({ ok: false, state: "failed", reason: "a segment can't be read (HTTP 403)" });
	});
	it("runs one join at a time: a second waits its turn, and is running to whoever asks", async () => {
		const { calls, run } = held();
		const jobs = createJobs(run, { log: () => {} });
		const other = "https://r2/bucket/originals/t/y/live.joined.mp4?sig=1";
		jobs.ask(ask(OUT));
		expect(jobs.ask(ask(other))).toEqual({ ok: true, state: "running", started: true });
		await Promise.resolve();
		expect(calls.map((c) => c.req.output)).toEqual([OUT]);
		expect(jobs.ask(ask(other))).toEqual({ ok: true, state: "running" });
		calls[0]!.end({ ok: true, bytes: 1, seconds: 1 });
		await vi.waitFor(() => expect(calls).toHaveLength(2));
		expect(calls[1]!.req.output).toBe(other);
		calls[1]!.end({ ok: true, bytes: 2, seconds: 1 });
		await jobs.idle();
		expect(jobs.ask(ask(other, false))).toMatchObject({ state: "done", bytes: 2 });
	});
	it("stops a join that runs past its limit, and says so", async () => {
		const jobs = createJobs((_req: unknown, signal: AbortSignal) => new Promise((_, fail) => { signal.addEventListener("abort", () => fail(new Error("AbortError"))); }), { limitMs: 30, log: () => {} });
		jobs.ask(ask(OUT));
		await jobs.idle();
		expect(jobs.ask(ask(OUT, false))).toEqual({ ok: false, state: "failed", reason: "the join took over 0 minutes and was stopped" });
	});
	it("writes a line for each join that ends: how it went and how long each step took", async () => {
		const lines: Array<Record<string, unknown>> = [];
		const jobs = createJobs(async () => ({ ok: true, bytes: 5, seconds: 2, took: { read: 1, join: 0, store: 1 } }), { log: (line: Record<string, unknown>) => lines.push(line) });
		jobs.ask(ask(OUT));
		await jobs.idle();
		expect(lines).toEqual([{ event: "join_done", job: "/bucket/originals/t/x/live.joined.mp4", bytes: 5, seconds: 2, took: { read: 1, join: 0, store: 1 } }]);
	});
});
