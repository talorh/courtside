import { afterEach, describe, expect, it, vi } from "vitest";
import { setAlert } from "../../src/features/admin/alerts-service.ts";
import { runDaily } from "../../src/jobs/daily.ts";
import { runSync } from "../../src/jobs/sync-videos.ts";
import { createTestDeps, type TestDeps } from "../helpers/fakes.ts";

afterEach(() => vi.restoreAllMocks());

const alerts = async (deps: TestDeps) => Object.fromEntries((await deps.db.prepare("SELECT kind, level, failures FROM platform_alerts").all<{ kind: string; level: string; failures: number }>()).results
	.map((r) => [r.kind, `${r.level}/${r.failures}`]));

describe("the jobs feed the admins' alerts", () => {
	it("the 5-minute job records each run, and checks Stream's minutes, server errors, emails waiting and the month's emails", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		await runSync(deps);
		expect(await alerts(deps)).toEqual({ sync_job: "ok/0", stream_storage: "ok/0", site_errors: "ok/0", email: "ok/0", email_allowance: "ok/0" });
		const db = { prepare: (sql: string) => { if (sql.includes("FROM teams WHERE status IN")) throw new Error("D1 hiccup"); return deps.db.prepare(sql); }, batch: deps.db.batch.bind(deps.db) } as unknown as D1Database;
		await expect(runSync({ ...deps, db })).rejects.toThrow("D1 hiccup");
		expect((await alerts(deps)).sync_job).toBe("ok/1");
	});

	it("an email that won't go never fails the 5-minute job: it's logged and tried each run, and the email alert says so after an hour", async () => {
		let now = new Date("2026-10-15T00:00:00.000Z");
		const deps = { ...createTestDeps(), now: () => now } as TestDeps;
		vi.spyOn(console, "log").mockImplementation(() => {});
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		deps.email.down = true;
		await setAlert(deps, "images", "warn", "81,000 photos stored");
		await runSync(deps);
		expect(await alerts(deps)).toMatchObject({ sync_job: "ok/0", email: "ok/0" });
		expect(logged.mock.calls.map((c) => String(c[0])).filter((line) => line.includes("ticket_email_failed"))).toHaveLength(2);
		now = new Date("2026-10-15T01:01:00.000Z");
		await runSync(deps);
		expect(await alerts(deps)).toMatchObject({ sync_job: "ok/0", email: "urgent/0" });
		deps.email.down = false;
		await runSync(deps);
		expect(deps.email.sent.map((e) => e.subject)).toEqual(["Courtside: Photos are near Images' 100,000 (#1)", "Courtside: Emails aren't going (#2)"]);
		expect(await alerts(deps)).toMatchObject({ sync_job: "ok/0", email: "ok/0" });
	});

	it("the 3am job checks Images' photos, and records how the night went", async () => {
		const deps = createTestDeps(new Date("2026-10-24T16:00:00Z"));
		vi.spyOn(console, "log").mockImplementation(() => {});
		await runDaily(deps);
		expect(await alerts(deps)).toEqual({ images: "ok/0", ai_models: "ok/0", budget: "ok/0", daily_job: "ok/0", joiner: "ok/0" });
		deps.images.down = true;
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(runDaily(deps)).rejects.toThrow();
		expect((await alerts(deps)).daily_job).toBe("urgent/0");
		expect(deps.email.sent.map((e) => e.subject)).toEqual(["Courtside: The 3am job failed (#1)"]);
	});
});
