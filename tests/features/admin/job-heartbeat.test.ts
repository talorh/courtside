import { afterEach, describe, expect, it, vi } from "vitest";
import { getAlert } from "../../../src/features/admin/alerts-repository.ts";
import { checkJobRan, recordDailyRun, recordSyncRun } from "../../../src/features/admin/usage-checks.ts";
import { createTestDeps, TEST_CONFIG, type TestDeps } from "../../helpers/fakes.ts";

// Each job watches the other: a job that stops running altogether can't raise its own failure
// alert, but each job's alert is saved every run, so one not saved for a while is a job that isn't running.

afterEach(() => vi.restoreAllMocks());

function clocked() {
	let now = new Date("2026-10-15T16:00:00.000Z");
	const deps = { ...createTestDeps(), now: () => now } as TestDeps;
	return { deps, later: (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); } };
}
const tickets = (deps: TestDeps) => deps.db.prepare("SELECT alert_kind, title, status FROM support_requests WHERE source = 'site' ORDER BY id").all().then((r) => r.results);

describe("each job watching the other", () => {
	it("the 3am job not run for over 26 hours is urgent, with when it last ran, and its next good night clears it", async () => {
		const { deps, later } = clocked();
		await recordDailyRun(deps, []);
		later(26 * 60);
		await checkJobRan(deps, "daily_job");
		expect((await getAlert(deps.db, "daily_job"))?.level).toBe("ok");
		later(1);
		await checkJobRan(deps, "daily_job");
		expect(await getAlert(deps.db, "daily_job")).toMatchObject({ level: "urgent", detail: "It hasn't run since Fri 16 Oct 2026, 3:00am" });
		expect(await tickets(deps)).toEqual([{ alert_kind: "daily_job", title: "The 3am job failed", status: "new" }]);
		// Raised once: the next runs leave it be.
		later(5);
		await checkJobRan(deps, "daily_job");
		expect(await tickets(deps)).toHaveLength(1);
		await recordDailyRun(deps, []);
		expect((await getAlert(deps.db, "daily_job"))?.level).toBe("ok");
		expect((await tickets(deps))[0]).toMatchObject({ status: "resolved" });
	});
	it("the 5-minute job not run for over 15 minutes is urgent, and a good run clears it", async () => {
		const { deps, later } = clocked();
		await recordSyncRun(deps, null);
		later(15);
		await checkJobRan(deps, "sync_job");
		expect((await getAlert(deps.db, "sync_job"))?.level).toBe("ok");
		later(1);
		await checkJobRan(deps, "sync_job");
		expect((await getAlert(deps.db, "sync_job"))?.level).toBe("urgent");
		await recordSyncRun(deps, null);
		expect((await getAlert(deps.db, "sync_job"))?.level).toBe("ok");
	});
	it("says nothing before a job's first run, or on staging, where the jobs run only when asked", async () => {
		const { deps, later } = clocked();
		await checkJobRan(deps, "daily_job");
		expect(await getAlert(deps.db, "daily_job")).toBeNull();
		await recordDailyRun(deps, []);
		later(3 * 24 * 60);
		await checkJobRan({ ...deps, config: { ...TEST_CONFIG, staging: true } }, "daily_job");
		expect((await getAlert(deps.db, "daily_job"))?.level).toBe("ok");
	});
});
