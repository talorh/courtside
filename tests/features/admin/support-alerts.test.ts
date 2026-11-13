import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKUP_PREFIX } from "../../../src/jobs/backup-db.ts";
import { SWEEP_RECORD } from "../../../src/jobs/sweep-orphans.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { addMember } from "../../helpers/two-teams.ts";

// Insights' Alerts section: all green when every check is, else what's wrong and how badly, worst first.

afterEach(() => vi.restoreAllMocks());

const NOW = "2026-11-15T00:00:00.000Z";
const KINDS = ["stream_storage", "images", "daily_job", "sync_job", "database", "site_errors", "email", "email_allowance", "budget", "ai_models"];

/** Every alert fine, last night's backup and clean-up done, the team well within its budget: a site with nothing wrong. */
async function healthy(deps: TestDeps) {
	await deps.db.prepare("UPDATE teams SET budget = 5000").run();
	for (const k of KINDS) await deps.db.prepare("INSERT INTO platform_alerts (kind, level, detail, checked_at) VALUES (?, 'ok', 'Fine', ?)").bind(k, NOW).run();
	await deps.originals.put(`${BACKUP_PREFIX}2026-11-14.sql.gz`, "x", "application/gzip", { custom: { rows: "10", tables: "{}" } });
	deps.originals.puts.get(`${BACKUP_PREFIX}2026-11-14.sql.gz`)!.uploaded = "2026-11-14T16:10:00.000Z";
	await deps.originals.put(SWEEP_RECORD, "{}", "application/json", { custom: { at: "2026-11-14T16:30:00.000Z", ok: "yes", found: "0", removed: "0" } });
}

const health = async (deps: TestDeps) => (await makeClient({ ...deps, now: () => new Date(NOW) })("/admin")).text();
const lightOf = (page: string, name: string) => page.match(new RegExp(`<li class="check (\\w+)"><span class="dot" aria-hidden="true"></span><div><h3><a href="[^"]*">${name}</a>`))?.[1];

describe("Insights' Alerts section", () => {
	it("is for site admins only, and its old address (Support's second tab) lands on it", async () => {
		const deps = createTestDeps();
		await addMember(deps.db, deps.team.id, "boss@x.com", "manager");
		expect((await makeClient(deps, { email: "boss@x.com" })("/admin")).status).toBe(404);
		const moved = await makeClient(deps)("/admin/support/alerts");
		expect([moved.status, moved.headers.get("location")]).toEqual([302, "/admin#alerts"]);
		expect(await health(deps)).toContain('<section class="stack alerts" id="alerts" aria-labelledby="alerts-h"><div class="panelhead"><h2 id="alerts-h">Is the site all right?</h2><span class="small"><a href="/admin#alerts">Check again</a></span></div>');
	});

	it("says all green when every check is", async () => {
		const deps = createTestDeps();
		await healthy(deps);
		const page = await health(deps);
		expect(page).toContain("<h2>All green</h2><p>Every check is fine and nothing needs you.");
		expect(page).not.toContain('class="check warn"');
		expect(lightOf(page, "Nightly backup")).toBe("ok");
		expect(lightOf(page, "Video storage \\(Stream\\)")).toBe("ok");
	});

	it("puts an urgent alert first, red, with its ticket, and says so at the top", async () => {
		const deps = createTestDeps();
		await healthy(deps);
		await deps.db.prepare("INSERT INTO support_requests (id, source, alert_kind, title, topic, message, status, created_at) VALUES (7, 'site', 'stream_storage', 'Video storage', 'platform', 'Low', 'open', ?)").bind(NOW).run();
		await deps.db.prepare("UPDATE platform_alerts SET level = 'urgent', detail = '40 minutes left', since = ?, ticket_id = 7 WHERE kind = 'stream_storage'").bind(NOW).run();
		const page = await health(deps);
		expect(page).toContain('<section class="healthbanner urgent" role="alert"><span class="dot" aria-hidden="true"></span><div><h2>1 urgent</h2><p>Something needs you now: it&#39;s first below.');
		expect(page).toMatch(/<ul class="checks"><li class="check urgent">[^]*?Video storage \(Stream\)<\/a><\/h3><p>40 minutes left<\/p><span class="sub"><a href="\/admin\/support\/7">Ticket #7<\/a>, since Sun 15 Nov 2026/);
	});

	it("warns when the nightly backup and clean-up are missing, a video is stuck, or an upload failed", async () => {
		const deps = createTestDeps();
		await healthy(deps);
		const [g1, g2] = [await seedGame(deps, { startsAt: "2026-11-13T10:00" }), await seedGame(deps, { startsAt: "2026-11-14T10:00" })];
		await seedVideo(deps, { gameId: g1, status: "failed", createdAt: "2026-11-13T00:00:00.000Z" });
		// Processing since five hours ago (a live game's video starts with the stream, so 4 hours is the limit).
		await seedVideo(deps, { gameId: g2, status: "processing", createdAt: "2026-11-14T19:00:00.000Z" });
		// A recording the site saved late: Go live ten hours ago, processing only since an hour ago, so not stuck.
		const g3 = await seedGame(deps, { startsAt: "2026-11-14T10:00" });
		const late = await seedVideo(deps, { gameId: g3, status: "processing", createdAt: "2026-11-14T14:00:00.000Z" });
		await deps.db.prepare("UPDATE videos SET processing_at = '2026-11-14T23:00:00.000Z' WHERE team_id = ? AND id = ?").bind(deps.team.id, late).run();
		const page = await health((deps.originals.puts.clear(), deps));
		expect(lightOf(page, "Nightly backup")).toBe("warn");
		expect(page).toContain("1 video processing for over 4 hours");
		expect(page).toContain("1 upload failed in the last 7 days");
		expect(lightOf(page, "Nightly clean-up")).toBe("warn");
		expect(page).toMatch(/<h2>4 warnings<\/h2><p>Worth a look soon: they&#39;re first below\./);
	});

	it("shows what needs an admin besides the checks, and greys out what hasn't been checked yet", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO support_requests (team_id, member_id, topic, message, created_at) SELECT team_id, id, 'other', 'Please', ? FROM members WHERE team_id = ? LIMIT 1").bind(NOW, deps.team.id).run();
		const page = await health({ ...deps, config: { ...deps.config, staging: true } });
		expect(page).toContain("<h2>Needs you</h2>");
		expect(page).toContain("1 support request is waiting for an answer.");
		expect(lightOf(page, "3am job")).toBe("idle");
		expect(page).toContain("Staging: runs only when asked");
		expect(lightOf(page, "Nightly backup")).toBe("idle");
	});

	it("puts how many alerts aren't ok on Insights in the sidebar, and tickets waiting on Support", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO platform_alerts (kind, level, detail, checked_at) VALUES ('email', 'urgent', 'Stuck', ?)").bind(NOW).run();
		const page = await health(deps);
		expect(page).toMatch(/<a href="\/admin" aria-current="page">.*?<span class="count urgent" title="1 urgent alert"/);
		expect(page).not.toContain('class="tabs"');
		const tickets = await (await makeClient(deps)("/admin/support")).text();
		// Support's tabs are its two queues; Alerts is on Insights.
		expect(tickets).not.toContain('href="/admin/support/alerts"');
		expect(tickets).toMatch(/<a href="\/admin">(?:(?!<\/a>).)*<span class="count urgent"/);
	});

	it("checks the team budgets as it opens: a team over its budget is urgent", async () => {
		const deps = createTestDeps();
		await healthy(deps);
		await deps.db.prepare("UPDATE teams SET budget = 5, created_at = '2026-10-01T00:00:00.000Z'").run();
		const page = await health(deps);
		expect(page).toMatch(/<li class="check urgent">[^]*?Team budgets<\/a><\/h3><p>Saints B12\.1: \$\d+\.\d\d so far of its \$5\.00 budget/);
		const ticket = await deps.db.prepare("SELECT title FROM support_requests WHERE alert_kind = 'budget'").first<{ title: string }>();
		expect(ticket?.title).toBe("A team's costs are over budget");
	});
});
