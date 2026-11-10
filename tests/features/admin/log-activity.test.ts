import { describe, expect, it } from "vitest";
import { makeClient } from "../../helpers/app.ts";
import { B12_1, createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

// Activity in the admin Log: every team's live streams, uploads and processing, and removal requests waiting, as its
// Right now; and the teams' activity (uploads, processing, clips, removal requests) as lines among the rest, without
// what the admin log already says. Today in the tests: Thu 15 Oct 2026, 11am in the club's time zone (00:00 UTC).
const run = (deps: TestDeps, sql: string, ...args: unknown[]) => deps.db.prepare(sql).bind(...args).run();
const page = async (deps: TestDeps, query = "") => (await makeClient(deps)(`/admin/log${query}`)).text();
const rightNow = (html: string) => html.slice(html.indexOf("rightnow"), html.indexOf('aria-label="Which lines"'));
/** Each row as "who what happened". */
const rows = (html: string) => [...html.matchAll(/<td class="l-who"><a [^>]*>([^<]*)<\/a><\/td>[^]*?<td class="l-what">([^]*?)<\/td>/g)].map((m) => `${m[1]} ${m[2]}`.replaceAll("&#39;", "'"));

/** B12.1 uploading round 9's video and a family asking for it to be removed; G14.5 processing round 3's; and their activity. */
async function site() {
	const deps = createTestDeps();
	const sam = await addMember(deps.db, B12_1.id, "sam@x.com", "filmer", "Sam");
	await addTeam(deps.db, G14_5);
	const jane = await addMember(deps.db, G14_5.id, "jane@x.com", "manager", "Jane");
	const lakeside = (await run(deps, "INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, '2026-10-10T18:40', 'VJBL', '9', 'Lakeside')", B12_1.id)).meta.last_row_id;
	const oakridge = (await run(deps, "INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, '2026-10-11T09:00', 'VJBL', '3', 'Oakridge')", G14_5.id)).meta.last_row_id;
	const video = (await run(deps, "INSERT INTO videos (team_id, game_id, status, uploaded_by, delete_after, created_at) VALUES (?, ?, 'uploading', ?, '2027-12-31T13:00:00.000Z', '2026-10-14T23:00:00.000Z')", B12_1.id, lakeside, sam)).meta.last_row_id;
	await run(deps, "INSERT INTO videos (team_id, game_id, status, uploaded_by, delete_after, created_at) VALUES (?, ?, 'processing', ?, '2027-12-31T13:00:00.000Z', '2026-10-14T22:30:00.000Z')", G14_5.id, oakridge, jane);
	await run(deps, "INSERT INTO removal_requests (team_id, video_id, member_id, reason, created_at) VALUES (?, ?, ?, 'Please', '2026-10-12T01:00:00.000Z')", B12_1.id, video, sam);
	const activity = "INSERT INTO activity (team_id, kind, game_id, member_id, detail, created_at, device) VALUES (?, ?, ?, ?, ?, ?, ?)";
	await run(deps, activity, B12_1.id, "upload_started", lakeside, sam, null, "2026-10-14T23:00:00.000Z", "iPhone, Safari");
	await run(deps, activity, G14_5.id, "video_ready", oakridge, jane, null, "2026-10-13T09:00:00.000Z", "");
	await run(deps, activity, B12_1.id, "removal_requested", lakeside, sam, "Please", "2026-10-12T01:00:00.000Z", "Android, Chrome");
	// What the admin log says itself, with who did it: not twice.
	await run(deps, activity, B12_1.id, "live_started", lakeside, sam, null, "2026-10-11T07:40:00.000Z", "");
	return { deps, lakeside, oakridge };
}

describe("the Log's Right now", () => {
	it("shows what's happening now in every team, each with its team and a way to open its game", async () => {
		const { deps, lakeside, oakridge } = await site();
		const now = rightNow(await page(deps));
		expect(now).toContain('<span class="teamtag">Saints B12.1</span>Round 9 · vs Lakeside: Uploading from a parent&#39;s phone or computer');
		expect(now).toContain('<span class="teamtag">Saints G14.5</span>Round 3 · vs Oakridge: Uploaded, now being processed (about 20 to 25 minutes)');
		expect(now).toContain(`<form method="post" action="/teams/switch" class="inline"><input type="hidden" name="team" value="${B12_1.id}"><input type="hidden" name="next" value="/games/${lakeside}">`);
		expect(now).toContain(`<input type="hidden" name="team" value="${G14_5.id}"><input type="hidden" name="next" value="/games/${oakridge}">`);
	});

	it("shows each team's removal requests waiting for its team manager, with the way to its Manage team page", async () => {
		const { deps } = await site();
		const now = rightNow(await page(deps));
		expect(now).toContain('<li class="warn"><span class="what"><span class="teamtag">Saints B12.1</span>Removal requests waiting: 1 video</span>');
		expect(now).toContain(`<input type="hidden" name="team" value="${B12_1.id}"><input type="hidden" name="next" value="/manage#removals">`);
		// G14.5 has none waiting.
		expect(now.match(/Removal requests waiting/g)).toHaveLength(1);
	});

	it("follows the Team filter alone: the days, who and the event don't change it", async () => {
		const { deps } = await site();
		const g14 = rightNow(await page(deps, `?team=${G14_5.id}&event=wrong`));
		expect(g14).toContain("Round 3 · vs Oakridge");
		expect(g14).not.toContain("Saints B12.1");
		// A team that isn't one has nothing happening.
		expect(rightNow(await page(deps, "?team=nope-2020"))).toContain("Right now: nothing live, uploading or processing, and no removal requests waiting.");
	});

	it("says so in one line when there's nothing", async () => {
		expect(await page(createTestDeps())).toContain('<p class="small rightnow-none" role="status">Right now: nothing live, uploading or processing, and no removal requests waiting.</p>');
	});
});

describe("Activity's lines in the Log", () => {
	it("are Videos lines, with who, the team, the game and the device, and the site's own by the site", async () => {
		const { deps } = await site();
		const html = await page(deps, "?show=videos");
		expect(rows(html)).toEqual([
			"sam@x.com started uploading Saints B12.1's video of Round 9 · vs Lakeside, Sat 10 Oct",
			"The site Saints G14.5's video of Round 3 · vs Oakridge, Sun 11 Oct is ready to watch",
			"sam@x.com asked for Saints B12.1's video of Round 9 · vs Lakeside, Sat 10 Oct to be removed: “Please”",
		]);
		expect(html).toContain('<a href="/admin/log?show=videos&amp;from=2026-10-09&amp;to=2026-10-15&amp;device=iPhone" title="Only iPhone">iPhone, Safari</a>');
		expect(html).toContain('Videos <span class="n">3</span>');
	});

	it("leave out what the admin log already says with who did it (Went live)", async () => {
		const { deps } = await site();
		expect(rows(await page(deps, "?show=all&from=2026-10-11&to=2026-10-11"))).toEqual([]);
	});

	it("filter by device kind, and the Device filter offers each kind with how many", async () => {
		const { deps } = await site();
		expect(rows(await page(deps, "?device=Android"))).toEqual(["sam@x.com asked for Saints B12.1's video of Round 9 · vs Lakeside, Sat 10 Oct to be removed: “Please”"]);
		const html = await page(deps);
		expect(html).toContain('<select name="device"><option value="">Any device</option><option value="Android">Android (1)</option><option value="iPhone">iPhone (1)</option></select>');
	});

	it("Only warnings shows the lines that warn alone", async () => {
		const { deps } = await site();
		expect(rows(await page(deps, "?warn=1"))).toEqual(["sam@x.com asked for Saints B12.1's video of Round 9 · vs Lakeside, Sat 10 Oct to be removed: “Please”"]);
		expect(await page(deps, "?warn=1")).toContain('<input type="checkbox" name="warn" value="1" checked> Only warnings');
	});

	it("the old Activity page has gone", async () => {
		const { deps } = await site();
		expect((await makeClient(deps)("/admin/activity")).status).toBe(404);
		expect(await page(deps)).not.toContain('href="/admin/activity"');
	});
});
