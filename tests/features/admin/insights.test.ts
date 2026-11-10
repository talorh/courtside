import { describe, expect, it } from "vitest";
import { makeClient } from "../../helpers/app.ts";
import { B12_1, createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

// Today in the tests: Thu 15 Oct 2026, 11am in the club's time zone (00:00 UTC), so this week starts Mon 12 Oct.
const run = (deps: TestDeps, sql: string, ...args: unknown[]) => deps.db.prepare(sql).bind(...args).run();

/** B12.1 with a played game and its video (watched three times, one download, and a photo downloaded), a game still waiting for its video, a clip,
 * a photo (and one deleted), a saved live stream, a removal request, a support request and four questions; G14.5 with two
 * people who've never opened the site. */
async function site() {
	const deps = createTestDeps();
	const b = B12_1.id;
	const sam = await addMember(deps.db, b, "sam@x.com", "filmer", "Sam");
	const kim = await addMember(deps.db, b, "kim@x.com", "watcher", "Kim");
	await run(deps, "UPDATE members SET last_seen_at = '2026-10-14T10:00:00.000Z' WHERE id = ?", sam);
	await run(deps, "UPDATE members SET last_seen_at = '2026-08-01T10:00:00.000Z' WHERE id = ?", kim);
	const game = (await run(deps, "INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, '2026-10-10T18:40', 'VJBL', '9', 'Lakeside')", b)).meta.last_row_id;
	await run(deps, "INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, '2026-10-13T18:40', 'VJBL', '10', 'Oakridge')", b);
	await run(deps, "INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, '2026-10-20T18:40', 'VJBL', '11', 'Westside')", b);
	const video = (await run(deps, `INSERT INTO videos (team_id, game_id, status, stream_uid, duration_seconds, delete_after, created_at)
		VALUES (?, ?, 'ready', 'v1', 3000, '2027-12-31T13:00:00.000Z', '2026-10-11T01:00:00.000Z')`, b, game)).meta.last_row_id;
	// the club's weeks: Sun 11 Oct 11pm is last week; Mon 12 Oct 1:30am and Wed 14 Oct 8pm are this week.
	for (const [member, at] of [[sam, "2026-10-11T12:00:00.000Z"], [kim, "2026-10-11T14:30:00.000Z"], [1, "2026-10-14T09:00:00.000Z"]] as const) {
		await run(deps, "INSERT INTO video_views (team_id, video_id, member_id, opened_at) VALUES (?, ?, ?, ?)", b, video, member, at);
	}
	await run(deps, "INSERT INTO downloads (team_id, video_id, member_id, kind, created_at) VALUES (?, ?, ?, 'hd', '2026-10-12T00:00:00.000Z')", b, video, sam);
	// A photo downloaded too: a download is a download, whatever it is.
	await run(deps, "INSERT INTO media_downloads (team_id, member_id, kind, item_id, name, created_at) VALUES (?, ?, 'photo', 1, 'p.jpg', '2026-10-12T01:00:00.000Z')", b, sam);
	await run(deps, "INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, created_at) VALUES (?, ?, 'Henry scores', 10, 20, 'ready', '2026-10-12T02:00:00.000Z')", b, video);
	for (const [id, deleted] of [["img-1", null], ["img-2", "2026-10-13T00:00:00.000Z"]] as const) {
		await run(deps, `INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at, deleted_at)
			VALUES (?, ?, '2026-10-10T18:00:00', 800, 600, 1000, ?, '2027-12-31T13:00:00.000Z', '2026-10-13T00:00:00.000Z', ?)`, b, id, sam, deleted);
	}
	await run(deps, "INSERT INTO live_streams (team_id, game_id, live_input_uid, status, created_at, recording_video_id) VALUES (?, ?, 'in-1', 'saved', '2026-10-10T07:40:00.000Z', ?)", b, game, video);
	await run(deps, "INSERT INTO removal_requests (team_id, video_id, member_id, reason, created_at) VALUES (?, ?, ?, 'Please', '2026-10-14T00:00:00.000Z')", b, video, kim);
	await run(deps, "INSERT INTO support_requests (team_id, member_id, topic, message, contact, created_at) VALUES (?, 1, 'other', 'Help', 'me', '2026-10-14T00:00:00.000Z')", b);
	await run(deps, "INSERT INTO ask_counts (team_id, member_id, day, n) VALUES (?, ?, '2026-10-14', 4)", b, sam);
	await addTeam(deps.db, G14_5);
	await addMember(deps.db, G14_5.id, "jane@x.com", "manager", "Jane");
	await addMember(deps.db, G14_5.id, "lee@x.com", "watcher", "Lee");
	return deps;
}

const page = async (deps: TestDeps) => (await makeClient(deps)("/admin")).text();
/** A table row's words, tags left out (`<th scope="row">` starts each team's row). */
const rowText = (html: string, label: string) => {
	const at = html.indexOf(`<th scope="row">${label}`);
	return at < 0 ? "" : html.slice(at, html.indexOf("</tr>", at)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
};
const alert = (deps: TestDeps, kind: string, level: string, detail: string) =>
	run(deps, "INSERT INTO platform_alerts (kind, level, detail, checked_at) VALUES (?, ?, ?, '2026-10-15T00:00:00.000Z')", kind, level, detail);

describe("Insights, the admin area's landing page (graphical, what needs attention first)", () => {
	it("starts with what needs an admin, worst first, each with where it's dealt with", async () => {
		const deps = await site();
		await alert(deps, "images", "warn", "81,000 photos stored");
		await alert(deps, "daily_job", "urgent", "The backup failed");
		await alert(deps, "stream_storage", "ok", "900 minutes left");
		await addTeam(deps.db, { ...G14_5, id: "b16.1-2026", code: "b16.1", name: "Saints U16 Boys 16.1" });
		const html = await page(deps);
		const items = [...html.matchAll(/<li class="att (\w+)"><p>(.*?)<\/p><a class="btn" href="([^"]+)">([^<]+)<\/a><\/li>/g)].map((m) => m.slice(1).join(" | "));
		// The alerts are the checks (lights, worst first); the list holds what else needs an admin.
		expect(items).toEqual([
			"warn | 1 support request is waiting for an answer. | /admin/support | Open Support",
			"warn | Saints B12.1: 1 removal request waiting for the team manager. | /admin/log?team=b12.1-2026 | See the Log",
			"info | Saints B16.1 has no team manager. | /admin/teams | Open Teams",
		]);
		expect(html).toMatch(/<ul class="checks"><li class="check urgent">[^]*?3am job<\/a><\/h3><p>The backup failed<\/p>/);
		expect(html).toMatch(/<section class="healthbanner urgent" role="alert">[^]*?<h2>1 urgent, \d+ warnings<\/h2>/);
		expect(html.indexOf('<section class="healthbanner')).toBeLessThan(html.indexOf('<ul class="attention"'));
		expect(html.indexOf('<ul class="attention"')).toBeLessThan(html.indexOf('<section class="scoreboard"'));
	});

	it("needs no list when nothing needs an admin: the banner says what the checks found", async () => {
		const html = await page(createTestDeps());
		expect(html).not.toContain('<ul class="attention"');
		expect(html).not.toContain("<h2>Needs you</h2>");
		expect(html).toMatch(/<section class="healthbanner (ok|warn)"/);
	});

	it("puts the whole site on three boards, with each number's last 12 weeks where it has them", async () => {
		const html = await page(await site());
		expect(html).toContain("<title>Admin: Insights · Courtside</title>");
		expect(html.match(/<section class="scoreboard" aria-label="([^"]+)"><h2 class="sbhead">/g)?.length).toBe(3);
		for (const title of ["Teams and people", "Footage", "Watching and asking"]) expect(html).toContain(`<h2 class="sbhead">${title}</h2>`);
		// The teams side by side, then what stands out under them.
		expect(html).toMatch(/<div class="insightpair"><section class="stack"><div class="panelhead"><h2>The teams side by side<\/h2>[^]*?<section class="panel stack"><h2>What stands out<\/h2>/);
		for (const [value, label] of [["2", "teams running"], ["5", "people on teams"], ["1", "opened the site this week"], ["3", "first views, 30 days"],
			["1", "video, 0.8 hours"], ["1", "live stream saved"], ["1", "highlight clip"], ["1", "photo"], ["2", "downloads, 30 days"], ["4", "questions asked, 30 days"]]) {
			expect(html, label).toContain(`<div class="sb"><b>${value}</b><span>${label}</span>`);
		}
		const views = html.slice(html.indexOf("<span>first views, 30 days</span>"), html.indexOf("</div>", html.indexOf("<span>first views, 30 days</span>")));
		expect(views.match(/<rect /g)).toHaveLength(12);
		expect(views.match(/<rect class="now"/g)).toHaveLength(1);
		expect(views).toContain('<span class="delta">2 this week, 1 last week</span>');
		// The tiles that count what's there now say their weeks are what was added.
		const videos = html.slice(html.indexOf("<span>video, 0.8 hours</span>"), html.indexOf("</div>", html.indexOf("<span>video, 0.8 hours</span>")));
		expect(videos).toContain('<span class="delta">0 added this week, 1 last week</span>');
		// Twelve weeks of nothing: no line, no words.
		const streams = html.slice(html.indexOf("<span>live stream saved</span>"), html.indexOf("</div>", html.indexOf("<span>live stream saved</span>")));
		expect(streams).toContain('<svg class="spark"');
		const questions = html.slice(html.indexOf("<span>questions asked, 30 days</span>"), html.indexOf("</div>", html.indexOf("<span>questions asked, 30 days</span>")));
		expect(questions).not.toContain("spark");
	});

	it("charts first views week by week, the rest as small charts, with the numbers as a table too", async () => {
		const html = await page(await site());
		const main = html.slice(html.indexOf('<figure class="chart main">'), html.indexOf("</figure>", html.indexOf('<figure class="chart main">')));
		expect(main).toContain("<b>First views</b>");
		expect(main.match(/<rect class="hit"/g)).toHaveLength(12);
		expect(main).toContain("<title>Week of 5 Oct: 1</title>");
		expect(main).toContain("<title>Week of 12 Oct: 2</title>");
		expect(main).toContain("<title>Week of 27 Jul: 0</title>");
		expect(main).toContain('aria-label="First views, last 12 weeks: 3 in all, most in the week of 12 Oct (2)"');
		expect(html.match(/<figure class="chart">/g)).toHaveLength(4);
		expect(html).toContain("<summary>The numbers, week by week</summary>");
		// What happened that week: both photos were added then, though one has gone since.
		expect(html).toContain("<tr><td>12 Oct</td><td>2</td><td>0</td><td>1</td><td>2</td><td>2</td><td>0</td><td>0</td></tr>");
	});

	it("says None yet in a chart with nothing in it, rather than an empty box", async () => {
		expect((await page(createTestDeps())).match(/>None yet<\/text>/g)).toHaveLength(6);
	});

	it("sets mobile against desktop: the devices signed in now in each view, and the devices that opened the site in each, week by week", async () => {
		const deps = await site();
		const session = (id: string, view: string | null, ended: string | null = null) => run(deps,
			"INSERT INTO sessions (id, email, device, created_at, expires_at, view, ended_at) VALUES (?, 'x@x.com', '', '2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z', ?, ?)", id, view, ended);
		await session("a", "mobile");
		await session("b", "mobile");
		await session("c", "desktop");
		await session("d", null);
		await session("e", "desktop", "2026-10-02T00:00:00.000Z");
		for (const [week, view, n] of [["2026-10-12", "mobile", 7], ["2026-10-12", "desktop", 2], ["2026-10-05", "mobile", 4], ["2026-07-20", "desktop", 9]] as const) {
			await run(deps, "INSERT INTO view_weeks (week, view, devices) VALUES (?, ?, ?)", week, view, n);
		}
		const html = await page(deps);
		expect(html).toContain('<h2 id="devices-h">Mobile and desktop</h2>');
		expect(html).toContain('<div class="sb"><b>2</b><span>devices in the mobile view</span><svg class="spark"');
		expect(html).toContain('<span class="delta">7 opened the site this week, 4 last week</span>');
		expect(html).toContain('<div class="sb"><b>1</b><span>device in the desktop view</span><svg class="spark"');
		expect(html).toContain('<div class="sb"><b>1</b><span>device whose view isn&#39;t known yet</span></div>');
		const fig = html.slice(html.indexOf('<figure class="chart main pair">'), html.indexOf("</figure>", html.indexOf('<figure class="chart main pair">')));
		expect(fig).toContain("<b>Devices that opened the site each week</b>");
		expect(fig).toContain("<title>Week of 12 Oct: 7 in the mobile view, 2 in the desktop view</title>");
		expect(fig).toContain("<title>Week of 27 Jul: 0 in the mobile view, 0 in the desktop view</title>");
		expect(fig).toContain('aria-label="Devices that opened the site each week, last 12 weeks: 11 in the mobile view, 2 in the desktop view"');
		expect(fig).toContain('<span class="key mobile"></span>Mobile view');
		expect(fig).toContain('<span class="key desktop"></span>Desktop view');
		expect(fig.match(/<path class="bar mobile"/g)).toHaveLength(2);
		expect(fig.match(/<path class="bar desktop"/g)).toHaveLength(1);
		expect(html).toContain("<tr><td>12 Oct</td><td>2</td><td>0</td><td>1</td><td>2</td><td>2</td><td>7</td><td>2</td></tr>");
		// No device whose view isn't known: no tile for it.
		await run(deps, "UPDATE sessions SET view = 'mobile' WHERE id = 'd'");
		expect(await page(deps)).not.toContain("known yet");
	});

	it("maps when families watch, by day and hour in the club's time zone, and names the busiest time once there's enough to say", async () => {
		const deps = await site();
		const html = await page(deps);
		const heat = html.slice(html.indexOf('<figure class="heat">'), html.indexOf("</figure>", html.indexOf('<figure class="heat">')));
		expect(heat.match(/<rect class="h\d"/g)).toHaveLength(7 * 24);
		expect(heat).toContain("<title>Sundays, 11pm: 1 first view</title>");
		expect(heat).toContain("<title>Mondays, 1am: 1 first view</title>");
		expect(heat).toContain("<title>Wednesdays, 8pm: 1 first view</title>");
		expect(heat).toContain("<title>Saturdays, 7pm: none</title>");
		expect(heat).toContain("Not enough first views yet to say when families watch most.");
		// Nine more on Tuesday 13 Oct at 7pm in the club's time zone.
		for (let i = 0; i < 9; i++) {
			const member = await addMember(deps.db, B12_1.id, `fan${i}@x.com`, "watcher");
			await run(deps, "INSERT INTO video_views (team_id, video_id, member_id, opened_at) SELECT team_id, id, ?, '2026-10-13T08:00:00.000Z' FROM videos LIMIT 1", member);
		}
		const more = await page(deps);
		expect(more).toContain("Most first views come on Tuesdays around 7pm.");
		// When families watch most is the heatmap's to say (its 12 weeks), not a second answer from 30 days.
		expect(more).not.toContain("Most first views happen on a");
	});

	it("compares the teams: people, who opened the site, footage, views and requests, with bars where it helps", async () => {
		const html = await page(await site());
		expect(rowText(html, "Saints B12.1")).toBe("Saints B12.1 3 1 1 (0.8 h) 1 1 3 Sun 11 Oct 1");
		expect(rowText(html, "Saints G14.5")).toBe("Saints G14.5 2 0 0 (0 h) 0 0 0 None yet 0");
		const b12 = html.slice(html.indexOf('<th scope="row">Saints B12.1'), html.indexOf("</tr>", html.indexOf('<th scope="row">Saints B12.1')));
		expect(b12.match(/<svg class="meter"/g)).toHaveLength(2);
	});

	it("says what stands out", async () => {
		const html = await page(await site());
		for (const line of [
			"Most watched: Saints B12.1 v Lakeside (Sat 10 Oct 2026, 6:40pm), opened by 3 people in the last 30 days.",
			"Saints B12.1: 1 played game with no video yet.", "Saints G14.5: nobody has opened the site in the last 30 days.",
			"1 of 1 video came from a live stream; the rest were recorded and uploaded.",
		]) expect(html, line).toContain(`<li>${line.replace(/'/g, "&#39;")}</li>`);
	});

	it("counts a live stream only while the video it saved is still there", async () => {
		const deps = await site();
		const game = (await run(deps, "INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, '2026-10-03T18:40', 'VJBL', '8', 'Northside')", B12_1.id)).meta.last_row_id;
		const gone = (await run(deps, `INSERT INTO videos (team_id, game_id, status, stream_uid, duration_seconds, delete_after, created_at, deleted_at, deleted_reason)
			VALUES (?, ?, 'ready', 'v2', 3000, '2027-12-31T13:00:00.000Z', '2026-10-04T01:00:00.000Z', '2026-10-05T00:00:00.000Z', 'admin')`, B12_1.id, game)).meta.last_row_id;
		await run(deps, "INSERT INTO live_streams (team_id, game_id, live_input_uid, status, created_at, recording_video_id) VALUES (?, ?, 'in-2', 'saved', '2026-10-03T07:40:00.000Z', ?)", B12_1.id, game, gone);
		const html = await page(deps);
		expect(html).toContain("<li>1 of 1 video came from a live stream; the rest were recorded and uploaded.</li>");
		expect(html).toContain("<b>1</b><span>live stream saved</span>");
	});

	it("never shows anyone's email", async () => {
		const html = await page(await site());
		for (const email of ["sam@x.com", "kim@x.com", "jane@x.com", "lee@x.com", "sam@saints.example"]) expect(html, email).not.toContain(email);
	});

	it("asks Stream and Cloudflare for the Alerts section's checks, and still opens when neither answers", async () => {
		const deps = await site();
		let asked = 0;
		deps.live.storage = async () => { asked++; throw new Error("Stream is down"); };
		const html = await page({ ...deps, cloudflare: { figures: async () => { asked++; throw new Error("down"); }, minutesByVideo: async () => [] } });
		expect(asked).toBeGreaterThan(0);
		expect(html).toContain('<section class="healthbanner');
		// Cloudflare's own figures over 30 days stay on Platform.
		expect(html).not.toContain("Worker requests");
	});
});
