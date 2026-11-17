import { describe, expect, it, vi } from "vitest";
import { getAlert } from "../../src/features/admin/alerts-repository.ts";
import { runDaily } from "../../src/jobs/daily.ts";
import { createTestDeps } from "../helpers/fakes.ts";

const fail = vi.hoisted(() => ({ joiner: false, jobRan: false }));

vi.mock("../../src/features/admin/joiner-checks.ts", () => ({
	checkJoiner: async () => { if (fail.joiner) throw new Error("the joiner's check broke"); },
}));
vi.mock("../../src/features/admin/usage-checks.ts", async (importOriginal) => {
	const real = await importOriginal<typeof import("../../src/features/admin/usage-checks.ts")>();
	return { ...real, checkJobRan: async (...args: Parameters<typeof real.checkJobRan>) => {
		if (fail.jobRan) throw new Error("the 5-minute job's check broke");
		return real.checkJobRan(...args);
	} };
});

describe("the daily job when one of its checks throws", () => {
	it("records the night as failed, with the check's error, and still fails the run", async () => {
		Object.assign(fail, { joiner: true, jobRan: false });
		const deps = createTestDeps(new Date("2026-10-24T16:00:00Z"));
		const err = (await runDaily(deps).catch((e: unknown) => e)) as AggregateError;
		expect(err).toBeInstanceOf(AggregateError);
		expect(err.errors.map(String)).toContain("Error: the joiner's check broke");
		expect(await getAlert(deps.db, "daily_job")).toMatchObject({ level: "urgent", detail: "Error: the joiner's check broke" });
		expect(deps.originals.puts.has("backups/d1/courtside-2026-10-25.sql")).toBe(true);
	});

	it("says in the Worker's logs how the night went, and which step failed", async () => {
		Object.assign(fail, { joiner: true, jobRan: false });
		const logged = vi.spyOn(console, "log").mockImplementation(() => {});
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		await runDaily(createTestDeps(new Date("2026-10-24T16:00:00Z"))).catch(() => {});
		const lines = [...logged.mock.calls, ...errors.mock.calls].map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
		expect(lines.find((l) => l.event === "daily_run")).toMatchObject({ errorCount: 1, failedSteps: ["joiner_check"], ms: expect.any(Number) });
		expect(lines.find((l) => l.event === "job_failed")).toMatchObject({ job: "daily", step: "joiner_check", teamId: null, error: "Error: the joiner's check broke" });
		vi.restoreAllMocks();
	});

	it("fails the run when the 5-minute job's heartbeat can't be checked", async () => {
		Object.assign(fail, { joiner: false, jobRan: true });
		const deps = createTestDeps(new Date("2026-10-24T16:00:00Z"));
		const err = (await runDaily(deps).catch((e: unknown) => e)) as AggregateError;
		expect(err).toBeInstanceOf(AggregateError);
		expect(err.errors.map(String)).toContain("Error: the 5-minute job's check broke");
		expect(await getAlert(deps.db, "daily_job")).toMatchObject({ level: "ok" });
	});
});
