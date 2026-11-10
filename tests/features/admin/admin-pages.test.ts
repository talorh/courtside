import { describe, expect, it } from "vitest";
import { backupDatabase } from "../../../src/jobs/backup-db.ts";
import type { CloudflareFigures } from "../../../src/platform/cloudflare-insights.ts";
import { runDaily } from "../../../src/jobs/daily.ts";
import { makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

const platform = (deps: TestDeps, now?: string) => makeClient(now ? { ...deps, now: () => new Date(now) } : deps)("/admin/platform").then((r) => r.text());
/** One thing Platform watches: its row, from its heading to the row's end. */
const watchRow = (html: string, label: string) => html.slice(html.indexOf(`<h3>${label}</h3>`), html.indexOf("</li>", html.indexOf(`<h3>${label}</h3>`)));

describe("the changelog, in the admin area", () => {
	it("is at /admin/changelog for admins, a day at a time, newest first", async () => {
		const page = await (await makeClient(createTestDeps())("/admin/changelog")).text();
		expect(page).toContain("<h1>Changelog</h1>");
		expect(page).toContain("<h2>11 Nov 2026</h2>");
		expect(page).toContain('<a href="/admin/changelog" aria-current="page">');
	});

	it("has left the team managers' links: its old address sends an admin there, and isn't found for anyone else", async () => {
		const deps = createTestDeps();
		await addMember(deps.db, deps.team.id, "m@x.com", "manager", "Mia");
		const old = await makeClient(deps)("/changelog");
		expect([old.status, old.headers.get("Location")]).toEqual([302, "/admin/changelog"]);
		expect((await makeClient(deps, "m@x.com")("/changelog")).status).toBe(404);
		const members = await (await makeClient(deps, "m@x.com")("/manage")).text();
		expect(members).not.toContain('href="/changelog"');
		expect(members).toContain('href="/notifications"');
	});
});

describe("the Platform page", () => {
	it("shows the last database backup, and warns when it's missing, old or failed its checks", async () => {
		const deps = createTestDeps(new Date("2026-10-16T17:00:00Z"));
		expect(await platform(deps, "2026-10-16T17:00:00Z")).toContain("No database backup yet.");
		await backupDatabase(deps);
		expect(await platform(deps, "2026-10-16T18:00:00Z")).toMatch(/Database backup: .* rows in \d+ tables\. Kept 14 days\. Checked: every row is in it/);
		expect(await platform(deps, "2026-10-18T18:00:00Z")).toContain("That's more than a day old");
		await deps.db.prepare("DELETE FROM players").run();
		await backupDatabase({ ...deps, now: () => new Date("2026-10-17T17:00:00Z") }).catch(() => undefined);
		expect(await platform(deps, "2026-10-17T18:00:00Z")).toContain("It failed its checks (players went from 10 rows to none)");
	});

	it("shows the last clean-up of videos and photos, and warns when it didn't finish or is more than a day old", async () => {
		const deps = createTestDeps(new Date("2026-10-24T16:00:00Z")); // 3am, Sun 25 Oct in the club's time zone
		const leftBehind = (uid: string) => {
			deps.stream.videos.set(uid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 60 });
			deps.stream.created.set(uid, "2026-10-01T00:00:00.000Z");
		};
		expect(await platform(deps, "2026-10-24T15:00:00Z")).toContain("Video and photo clean-up: not run yet. It runs at 3am, after the backup.");
		leftBehind("old-test");
		await runDaily(deps);
		expect(await platform(deps, "2026-10-24T20:00:00Z")).toContain("Video and photo clean-up: Sun 25 Oct 2026, 3:00am. Removed 1 thing nothing on the site uses.");
		expect(await platform(deps, "2026-10-26T06:00:00Z")).toContain("Video and photo clean-up: Sun 25 Oct 2026, 3:00am. That's more than a day old: check the Worker logs for <b>orphan_sweep</b>.");
		for (let i = 0; i < 8; i++) leftBehind(`unknown-${i}`);
		await runDaily({ ...deps, now: () => new Date("2026-10-25T16:00:00Z") }).catch(() => undefined);
		expect(await platform(deps, "2026-10-25T20:00:00Z")).toMatch(/Video and photo clean-up: Mon 26 Oct 2026, 3:00am\. It didn't finish \(Error: Orphan sweep refused: [^)]*\): check the Worker logs for <b>orphan_sweep<\/b>\./);
	});

	it("counts video storage, photos against Images' 100,000, and people on teams against Access's free 50 (each once)", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		const parent = await addMember(deps.db, deps.team.id, "both@x.com", "watcher");
		await addMember(deps.db, G14_5.id, "both@x.com", "watcher");
		await addMember(deps.db, G14_5.id, "jane@example.com", "manager");
		await deps.db.prepare("INSERT INTO members (team_id, email, role, hidden) VALUES (?, 'other-admin@x.com', 'manager', 1)").bind(G14_5.id).run();
		await deps.db.prepare("INSERT INTO members (team_id, email, role, removed_at) VALUES (?, 'gone@x.com', 'watcher', '2026-10-01T00:00:00.000Z')").bind(deps.team.id).run();
		await deps.db.prepare("INSERT INTO members (team_id, email, role, removed_at) VALUES (?, 'jane@example.com', 'watcher', '2026-10-01T00:00:00.000Z')").bind(deps.team.id).run();
		for (const [id, deleted] of [["a", null], ["b", null], ["c", "2026-10-02T00:00:00.000Z"]]) {
			await deps.db.prepare(`INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at, deleted_at)
				VALUES (?, ?, '2026-10-01T10:00:00', 4, 3, 1, ?, '2027-12-31T13:00:00.000Z', '2026-10-01T00:00:00.000Z', ?)`).bind(deps.team.id, id, parent, deleted).run();
		}
		const page = await platform(deps);
		expect(page).toContain("<b>65</b> of 1,100 minutes");
		expect(page).toContain("<b>2</b> of 100,000");
		expect(page).toContain("<b>3</b> people on teams");
		expect(page).toContain("Each address gets 10 codes an hour and 20 a day, and 15 wrong codes a day; the site sends 200 an hour at most.");
	});

	it("has a row for each thing watched with how its alert stands, since when and its ticket; one not checked yet says when it will be", async () => {
		const deps = createTestDeps();
		const fresh = await platform(deps);
		for (const [label, state, first] of [
			["Video storage (Stream)", "Not checked yet", "Not checked yet: the 5-minute job checks it every hour."],
			["Photos (Images)", "Not checked yet", "Not checked yet: the 3am job checks it every night."], ["Database (D1)", "Not checked yet", "Not checked yet: the 3am job checks it every night."],
			["Server errors", "Not checked yet", "Not checked yet: the 5-minute job checks it every run."], ["Emails", "Not checked yet", "Not checked yet: the 5-minute job checks it every run."],
			["Emails this month", "Not checked yet", "Not checked yet: the 5-minute job checks it every run."],
			["The 3am job", "Not run yet", "Not run yet: it runs at 3am."],
			["The 5-minute job", "Not run yet", "Not run yet: it runs every 5 minutes."],
		]) {
			expect(watchRow(fresh, label), label).toContain(`<span class="t">${state}</span>`);
			expect(watchRow(fresh, label), label).toContain(`<p class="small">${first}</p>`);
		}
		await deps.db.prepare("INSERT INTO support_requests (source, alert_kind, title, topic, message, created_at) VALUES ('site', 'stream_storage', 'Video storage is running low', 'platform', 'x', '2026-10-14T22:10:00.000Z')").run();
		await deps.db.prepare("INSERT INTO platform_alerts (kind, level, detail, since, checked_at, ticket_id) VALUES ('stream_storage', 'warn', '150 minutes left', '2026-10-14T22:10:00.000Z', '2026-10-14T23:55:00.000Z', 1)").run();
		await deps.db.prepare("INSERT INTO platform_alerts (kind, level, detail, checked_at) VALUES ('sync_job', 'ok', 'The last run was fine', '2026-10-14T23:55:00.000Z')").run();
		const page = await platform(deps);
		expect(watchRow(page, "Video storage (Stream)")).toContain('<span class="t warn">Running low</span>');
		expect(watchRow(page, "Video storage (Stream)")).toContain('<p class="small">150 minutes left. Since Thu 15 Oct 2026, 9:10am. <a href="/admin/support/1">Ticket #1</a></p>');
		expect(watchRow(page, "The 5-minute job")).toContain('<span class="t src">Ok</span>');
		expect(watchRow(page, "The 5-minute job")).toContain('<p class="small">The last run was fine.</p>');
	});

	it("shows the database's size against what D1 can hold, or says when it can't be read", async () => {
		// The test database doesn't say its size, as D1 does with every answer.
		expect(watchRow(await platform(createTestDeps()), "Database (D1)")).toContain("Its size couldn't be read just now.");
	});

	describe("Cloudflare's own figures (the read-only token)", () => {
		const FIGURES: CloudflareFigures = {
			workers: { requests: 990, errors: 6, subrequests: 485, cpuP50Ms: 11.772, cpuP99Ms: 37.194 },
			d1: { rowsRead: 44299, rowsWritten: 1338, queries: 10405, sizeBytes: 368640 },
			r2: { bytes: 2868048566, objects: 6 }, streamMinutesWatched: 764, aiNeurons: 67.6, zone: { requests: 6533, threats: 38 },
		};
		const withCloudflare = (figures: () => Promise<CloudflareFigures>) => platform({ ...createTestDeps(), cloudflare: { figures, minutesByVideo: async () => [] } });

		it("shows the last 30 days of the Worker, the database, the originals, Stream, Workers AI and the zone", async () => {
			const html = await withCloudflare(async () => FIGURES);
			for (const text of [
				"<b>Worker requests</b><span>990 of 10,000,000 a month</span>", "Typical page 12 ms of processing, the slowest 1% 37 ms; 6 errors.",
				"<b>Database rows read</b><span>44,299 of 25,000,000,000 a month</span>", "<b>Database rows written</b><span>1,338 of 50,000,000 a month</span>",
				"<b>Uploaded originals (R2)</b><span>2.7 GB in 6 files</span>", "<b>Minutes watched (Stream)</b><span>764</span>", "Free within the plan's allowance, then US$1 for every 1,000; Costs shows what Cloudflare charged.",
				"<b>Workers AI</b><span>2 of 10,000 a day</span>", "<b>Requests to saints.example</b><span>6,533; 38 threats stopped</span>",
			]) expect(html, text).toContain(text.replace(/'/g, "&#39;"));
			// The database's size comes from Cloudflare when the database itself doesn't say.
			expect(watchRow(html, "Database (D1)")).toContain("<b>0.4 MB</b> of 10 GB");
		});

		it("has no Security panel (the dashboard's own list is where Security Center's findings are read)", async () => {
			const html = await withCloudflare(async () => FIGURES);
			expect(html).not.toContain("<h2>Security</h2>");
			expect(html).not.toContain("Decided, and left as they are");
		});

		it("says when the figures can't be read, or the token isn't set up", async () => {
			expect(await withCloudflare(async () => { throw new Error("down"); })).toContain("<p class=\"small\">Cloudflare's figures couldn't be read just now.</p>");
			expect(await platform(createTestDeps())).toContain("<p class=\"small\">Cloudflare's figures need the read-only token (CF_INSIGHTS_TOKEN");
		});
	});
});

describe("the admin Log", () => {
	it("lists what admins and the site did on the days asked for, in words and local time, newest first", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		const add = (i: number, email: string, team: string | null, action: string, detail = "") => deps.db
			.prepare("INSERT INTO admin_log (admin_email, team_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)")
			.bind(email, team, action, detail, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()).run();
		for (let i = 0; i < 200; i++) await add(i, MANAGER, deps.team.id, "team_opened");
		await add(200, MANAGER, G14_5.id, "team_onboarded", "g14.5");
		await add(201, MANAGER, deps.team.id, "view_as", "Watch only");
		await add(202, MANAGER, deps.team.id, "view_as", "stopped");
		await add(203, "site", G14_5.id, "team_deleted", "1 photo deleted");
		const rows = async (query: string) => {
			const page = await (await makeClient(deps)(`/admin/log?show=all&from=2026-10-01&to=2026-10-01${query}`)).text();
			return { page, lines: [...page.matchAll(/<time [^>]*>([^<]+)<\/time><\/td>\s*<td class="l-who"><a [^>]*>([^<]*)<\/a>[^]*?<td class="l-what">([^]*?)<\/td>/g)].map((m) => `${m[1]} | ${m[2]} ${m[3]}`) };
		};
		const first = await rows("");
		expect(first.page).toContain("1 to 100 of 204 lines, Thu 1 Oct 2026");
		expect(first.page).toContain('<tr class="sectionrow lday"><td colspan="6">Thu 1 Oct 2026</td></tr>');
		expect(first.lines.slice(0, 4)).toEqual([
			"1:23pm | The site deleted Saints G14.5: 1 photo deleted",
			`1:22pm | ${MANAGER} stopped viewing Saints B12.1 as another role`,
			`1:21pm | ${MANAGER} viewed Saints B12.1 as Watch only`,
			`1:20pm | ${MANAGER} onboarded Saints G14.5 (2026/27)`,
		]);
		expect((await rows("&page=3")).lines.at(-1)).toBe(`10:00am | ${MANAGER} opened Saints B12.1 for the first time`);
	});
});

describe("the admin Log's support lines", () => {
	it("says an admin took a ticket themselves, gave it to someone, or let it go", async () => {
		const deps = createTestDeps();
		const add = (i: number, detail: string) => deps.db.prepare("INSERT INTO admin_log (admin_email, team_id, action, detail, created_at) VALUES (?, NULL, 'support_assigned', ?, ?)")
			.bind(MANAGER, detail, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()).run();
		await add(0, `#3 to ${MANAGER}`);
		await add(1, "#4 to jo@example.com");
		await add(2, "#5 to nobody");
		const page = await (await makeClient(deps)("/admin/log?show=all&from=2026-10-01&to=2026-10-01")).text();
		const lines = [...page.matchAll(/<td class="l-what">([^]*?)<\/td>/g)].map((m) => m[1]);
		expect(lines).toEqual(["let go of support #5", "gave support #4 to jo@example.com", "took support #3"]);
	});
});

describe("a team's Notifications page", () => {
	it("keeps its activity and what's in progress, without the backup or the clean-up (they're on Platform)", async () => {
		const deps = createTestDeps();
		await backupDatabase(deps);
		const page = await (await makeClient(deps)("/notifications")).text();
		expect(page).toContain("In progress");
		expect(page).not.toContain("Database backup");
		expect(page).not.toContain("clean-up");
	});
});
