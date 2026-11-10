import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "../../../src/app/router.ts";
import { checkDatabase, checkEmails, checkImages, checkSiteErrors, checkStreamStorage, recordDailyRun, recordSyncRun } from "../../../src/features/admin/usage-checks.ts";
import { getAlert } from "../../../src/features/admin/alerts-repository.ts";
import { makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

afterEach(() => vi.restoreAllMocks());

function clocked() {
	let now = new Date("2026-10-15T00:00:00.000Z");
	const deps = { ...createTestDeps(), now: () => now } as TestDeps;
	return { deps, later: (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); } };
}
const level = async (deps: TestDeps, kind: string) => deps.db.prepare("SELECT level FROM platform_alerts WHERE kind = ?").bind(kind).first("level");
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("Stream storage, from the 5-minute job at most hourly", () => {
	it("warns under 400 minutes left (about 3 weeks' notice at a few teams), is urgent under 100, and clears only at 450 or more", async () => {
		const { deps, later } = clocked();
		const levels: unknown[] = [];
		for (const left of [401, 399, 100, 99, 0, 440, 449, 450, 430]) {
			deps.live.usage = { usedMinutes: 1100 - left, limitMinutes: 1100 };
			await checkStreamStorage(deps);
			levels.push(await level(deps, "stream_storage"));
			later(61);
		}
		expect(levels).toEqual(["ok", "warn", "warn", "urgent", "urgent", "warn", "warn", "ok", "ok"]);
	});

	it("asks Stream at most once an hour, and leaves the alert as it was when Stream doesn't answer", async () => {
		const { deps, later } = clocked();
		const storage = vi.spyOn(deps.live, "storage");
		deps.live.usage = { usedMinutes: 1000, limitMinutes: 1100 };
		await checkStreamStorage(deps);
		later(30);
		await checkStreamStorage(deps);
		expect(storage).toHaveBeenCalledTimes(1);
		later(31);
		deps.live.down = true;
		quiet();
		await checkStreamStorage(deps);
		expect(await level(deps, "stream_storage")).toBe("warn");
	});
});

describe("photos, from the 3am job", () => {
	it("warns at 80,000 photos, urgent at 95,000, clears under 78,000", async () => {
		const { deps } = clocked();
		const levels: unknown[] = [];
		for (const n of [79_999, 80_000, 95_000, 78_500, 77_999]) {
			await checkImages(deps, n);
			levels.push(await level(deps, "images"));
		}
		expect(levels).toEqual(["ok", "warn", "urgent", "warn", "ok"]);
	});
});

describe("the jobs themselves", () => {
	it("makes the 5-minute job urgent after six failed runs in a row (30 minutes), and a good run clears it", async () => {
		const { deps } = clocked();
		for (let i = 0; i < 5; i++) await recordSyncRun(deps, new Error("D1 hiccup"));
		expect(await level(deps, "sync_job")).toBe("ok");
		await recordSyncRun(deps, new Error("D1 hiccup"));
		expect(await level(deps, "sync_job")).toBe("urgent");
		expect(deps.email.sent.map((e) => e.subject)).toEqual(["Courtside: The 5-minute job keeps failing (#1)"]);
		await recordSyncRun(deps, null);
		expect(await level(deps, "sync_job")).toBe("ok");
		for (let i = 0; i < 5; i++) await recordSyncRun(deps, new Error("again"));
		expect(await level(deps, "sync_job")).toBe("ok");
	});

	it("says one failed run in the singular, then counts the runs", async () => {
		const { deps } = clocked();
		await recordSyncRun(deps, new Error("D1 hiccup"));
		expect((await getAlert(deps.db, "sync_job"))?.detail).toBe("1 run in a row failed: Error: D1 hiccup");
		await recordSyncRun(deps, new Error("D1 hiccup"));
		expect((await getAlert(deps.db, "sync_job"))?.detail).toBe("2 runs in a row failed: Error: D1 hiccup");
	});

	it("makes the 3am job urgent the night it fails, and a good night clears it", async () => {
		const { deps } = clocked();
		await recordDailyRun(deps, [new Error("Backup failed its checks")]);
		expect(await level(deps, "daily_job")).toBe("urgent");
		expect(deps.email.sent[0]!.text).toMatch(/^The 3am job failed: Error: Backup failed its checks\.\n/);
		await recordDailyRun(deps, []);
		expect(await level(deps, "daily_job")).toBe("ok");
	});

	it("never lets a failing alert email fail the job: the alert and its ticket are saved, it's logged, and sent next time", async () => {
		const { deps } = clocked();
		deps.email.failNext = "E_RATE_LIMIT_EXCEEDED";
		const logged = quiet();
		await recordDailyRun(deps, [new Error("x")]);
		expect(await level(deps, "daily_job")).toBe("urgent");
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM support_requests WHERE alert_kind = 'daily_job' AND emailed_at IS NULL").first("n")).toBe(1);
		expect(String(logged.mock.calls[0]?.[0])).toContain("ticket_email_failed");
	});
});

describe("the new checks (basic monitoring)", () => {
	const GB = 1024 ** 3;
	it("the database: warns at 4 GB of the 10 D1 holds, urgent at 9, clears under 3.8; leaves it alone when its size isn't known", async () => {
		const { deps } = clocked();
		const levels: unknown[] = [];
		for (const size of [1 * GB, 4.1 * GB, 9.2 * GB, 3.9 * GB, null, 3.7 * GB]) {
			await checkDatabase(deps, size);
			levels.push(await level(deps, "database"));
		}
		expect(levels).toEqual(["ok", "warn", "urgent", "warn", "warn", "ok"]);
		expect(await deps.db.prepare("SELECT detail FROM platform_alerts WHERE kind = 'database'").first("detail")).toBe("3.7 GB of the 10 GB it can hold");
	});

	it("server errors: the site counts the ones it answers; ten in the last hour or two is urgent, under three clears it", async () => {
		const { deps, later } = clocked();
		const router = new Router();
		router.get("/boom", "watcher", async () => { throw new Error("boom"); });
		quiet();
		for (let i = 0; i < 9; i++) expect((await makeClient(deps, MANAGER, router)("/boom")).status).toBe(500);
		await checkSiteErrors(deps);
		expect(await level(deps, "site_errors")).toBe("ok");
		await makeClient(deps, MANAGER, router)("/boom");
		await checkSiteErrors(deps);
		expect(await level(deps, "site_errors")).toBe("urgent");
		expect(await deps.db.prepare("SELECT detail FROM platform_alerts WHERE kind = 'site_errors'").first("detail")).toBe("10 server errors in the last hour or two");
		later(125);
		await checkSiteErrors(deps);
		expect(await level(deps, "site_errors")).toBe("ok");
	});

	it("emails: any waiting more than an hour is urgent, and none waiting clears it", async () => {
		const { deps, later } = clocked();
		await addTeam(deps.db, G14_5);
		const jane = await addMember(deps.db, G14_5.id, "jane@x.com", "manager", "Jane");
		await deps.db.prepare("INSERT INTO support_requests (team_id, member_id, topic, message, contact, created_at, updated_at) VALUES (?, ?, 'other', 'Help', 'x', ?, ?)")
			.bind(G14_5.id, jane, "2026-10-15T00:00:00.000Z", "2026-10-15T00:00:00.000Z").run();
		await checkEmails(deps);
		expect(await level(deps, "email")).toBe("ok");
		later(61);
		await checkEmails(deps);
		expect(await level(deps, "email")).toBe("urgent");
		await deps.db.prepare("UPDATE support_requests SET emailed_at = '2026-10-15T01:02:00.000Z'").run();
		await checkEmails(deps);
		expect(await level(deps, "email")).toBe("ok");
	});
});
