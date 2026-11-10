import { afterEach, describe, expect, it, vi } from "vitest";
import { money } from "../../../src/features/admin/costs-currency.ts";
import { fixedAMonth } from "../../../src/features/admin/costs-prices.ts";
import { storedItems } from "../../../src/features/admin/costs-repository.ts";
import type { MinutesWatched } from "../../../src/platform/cloudflare-insights.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

// The admin area's Costs page: each team's month, season so far and season estimated, in Australian dollars at the
// day's rate (the fake's $1 = $1.50) or Cloudflare's own US dollars, for site admins only, with Cloudflare's minutes
// watched by video put to each video's team and saved by month. Every team's budget is $200 until one's set for it here.

afterEach(() => vi.restoreAllMocks());

const NOW = "2026-11-15T00:00:00.000Z";
const A = money("local");
const at = (deps: TestDeps) => ({ ...deps, now: () => new Date(NOW) });

function withCloudflare(deps: TestDeps, read: () => Promise<MinutesWatched[]>) {
	const asked: Array<[string, string]> = [];
	const d = { ...at(deps), cloudflare: { figures: async () => { throw new Error("not this"); }, minutesByVideo: async (s: string, u: string) => { asked.push([s, u]); return (await read()).filter((g) => g.date >= s && g.date <= u); } } };
	return { deps: d, asked, page: async (path = "/admin/costs") => (await makeClient(d)(path)).text() };
}

const budgetForm = (budget: string) => form({ budget });

describe("the admin Costs page", () => {
	it("is for site admins only: a team manager is told there's no such page", async () => {
		const deps = createTestDeps();
		await addMember(deps.db, deps.team.id, "boss@x.com", "manager");
		expect((await makeClient(deps, { email: "boss@x.com" })("/admin/costs")).status).toBe(404);
	});

	it("shows each team's month, its estimate and a player a season and a month, in Australian dollars at the day's rate", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("UPDATE teams SET created_at = '2026-11-01T00:00:00.000Z'").run();
		const page = await (await makeClient(at(deps))("/admin/costs")).text();
		expect(page).toContain("<h1>Costs</h1>");
		expect(page).toContain(`<td class="c-month">${A(fixedAMonth() * 1.5)}<span class="sub">Its first month</span></td>`);
		// The baseline's season (no games yet) comes to a little over the default at $1.50 to the US dollar.
		expect(page).toContain('<td class="c-state"><span class="t warn">On track to go over</span></td>');
		expect(page).toContain("used of $200.00 (the default)");
		expect(page).toContain(`<a href="/admin/costs/${deps.team.id}"><b>`);
		expect(page).toContain('<a class="chip" href="/admin/costs" aria-current="true">$AUD</a><a class="chip" href="/admin/costs?cur=usd">$USD</a>');
		expect(page).toContain("1 USD = 1.5000 AUD, the European Central Bank&#39;s rate for Fri 13 Nov.");
		expect(page).toContain("Minutes watched need the read-only token");
		// A player: the season's estimate over the squad, and a twelfth of it a month.
		expect(page).toContain("<th>A player</th>");
		const player = page.match(/<td class="c-game">\$([\d,.]+) a season<span class="sub">\$([\d,.]+) a month<\/span><\/td>/);
		expect(player).not.toBeNull();
		expect(Number(player![1]!.replace(",", "")) / 12).toBeCloseTo(Number(player![2]!.replace(",", "")), 1);
		// The charts: the season's twelve months stacked by kind, the running total, and where it goes.
		expect(page.match(/<text class="mon"/g)).toHaveLength(24);
		expect(page).toContain("<b>The running teams against their budgets</b> <span class=\"small\">$");
		expect(page).toContain("<b>Where it goes</b>");
		// The running teams' budgets go on their own running total only: every team's months aren't set against them.
		expect(page.match(/class="budgetline"/g)).toHaveLength(1);
		expect(page).toContain(`<title>Nov 2026 (not billed yet): ${A(fixedAMonth() * 1.5)}. Shared ${A(fixedAMonth() * 1.5)}, Video storage $0.00`);
	});

	it("shows one season at a time, this one unless another is picked, each team in the season it was onboarded for", async () => {
		// A year on: B12.1's season is over, and a team is running in the new one.
		const deps = { ...createTestDeps(), now: () => new Date("2027-11-15T00:00:00.000Z") };
		await deps.db.prepare("UPDATE teams SET status = 'closed', closed_at = '2027-09-30T00:00:00.000Z'").run();
		await addTeam(deps.db, { ...G14_5, id: "g14.5-2027", seasonStart: 2027 });
		const client = makeClient(deps);
		const now = await (await client("/admin/costs")).text();
		expect(now).toContain('<nav class="chips" aria-label="Season"><a class="chip" href="/admin/costs" aria-current="true">2027/28</a><a class="chip" href="/admin/costs?season=2026">2026/27</a></nav>');
		expect(now).toContain('<a href="/admin/costs/g14.5-2027"><b>');
		expect(now).not.toContain(`<a href="/admin/costs/${deps.team.id}`);
		expect(now).toContain("<span>This month, every team</span>");
		const past = await (await client("/admin/costs?season=2026&cur=usd")).text();
		expect(past).toContain('<a class="chip" href="/admin/costs?season=2026&amp;cur=usd" aria-current="true">2026/27</a>');
		expect(past).toContain('<a class="chip" href="/admin/costs?season=2026">$AUD</a>');
		expect(past).toContain(`<a href="/admin/costs/${deps.team.id}?cur=usd"><b>`);
		expect(past).not.toContain('<a href="/admin/costs/g14.5-2027');
		// A past season's months are all spent: the season in all, its last month, and every one of its teams' budgets.
		expect(past).toContain("<span>Sep 2027, its last month</span>");
		expect(past).toContain("<span>The season</span>");
		expect(past).not.toContain("The season, estimated");
		expect(past).toContain("<span>Budgets, 1 team</span>");
		expect(past).toContain("<b>The teams against their budgets</b>");
		// A season no team is in is this one.
		expect(await (await client("/admin/costs?season=2031")).text()).toContain('<a class="chip" href="/admin/costs" aria-current="true">2027/28</a>');
	});

	it("shows Cloudflare's own US dollars when asked, and each team's link keeps to them", async () => {
		const deps = createTestDeps();
		const page = await (await makeClient(at(deps))("/admin/costs?cur=usd")).text();
		expect(page).toContain(`<td class="c-month">$11.18<span class="sub">`);
		expect(page).toContain(`<a href="/admin/costs/${deps.team.id}?cur=usd"><b>`);
		expect(page).toContain('<a class="chip" href="/admin/costs?cur=usd" aria-current="true">$USD</a>');
	});

	it("puts Cloudflare's minutes watched to each video's team, and those no team has to everyone running", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("UPDATE teams SET created_at = '2026-10-01T00:00:00.000Z'").run();
		const game = await seedGame(deps, { startsAt: "2026-10-10T10:00" });
		await seedVideo(deps, { gameId: game, streamUid: "uid-b12", createdAt: "2026-10-10T03:00:00.000Z" });
		const cf = withCloudflare(deps, async () => [{ uid: "uid-b12", date: "2026-10-12", minutes: 2000 }, { uid: "gone", date: "2026-10-12", minutes: 500 }]);
		await cf.page();
		const page = await cf.page(`/admin/costs/${deps.team.id}?cur=usd`);
		// October: its 2,000 minutes at $1 a thousand; the 500 no team has go in what's shared, with the fixed costs.
		expect(page).toContain("$2.00<span class=\"sub\">2,000 min</span>");
		expect(page).toMatch(/<tr><td>Oct 2026<\/td>[^]*?<td>\$11\.68<\/td><td><b>\$13\.68<\/b><\/td>/);
		const saved = await deps.db.prepare("SELECT month, team_id AS teamId, minutes FROM cost_views ORDER BY team_id").all();
		expect(saved.results).toEqual([{ month: "2026-10", teamId: "", minutes: 500 }, { month: "2026-11", teamId: "", minutes: 0 }, { month: "2026-10", teamId: deps.team.id, minutes: 2000 }]);
		// October and November, a query each, once in the hour.
		expect(cf.asked).toEqual([["2026-10-01", "2026-10-31"], ["2026-11-01", "2026-11-30"]]);
		expect(page).toContain("Minutes watched are from Cloudflare&#39;s analytics, by video, read");
	});

	it("reads Cloudflare at most once an hour, and shows what's saved when it doesn't answer", async () => {
		const deps = createTestDeps();
		const cf = withCloudflare(deps, async () => [{ uid: "x", date: "2026-11-02", minutes: 10 }]);
		await cf.page();
		await cf.page();
		expect(cf.asked).toHaveLength(2);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const later = { ...cf.deps, now: () => new Date("2026-11-15T02:00:00.000Z"), cloudflare: { ...cf.deps.cloudflare, minutesByVideo: async () => { throw new Error("down"); } } };
		const page = await (await makeClient(later)("/admin/costs/b12.1-2026")).text();
		expect(page).toContain("couldn&#39;t be read just now, so minutes watched are as last read");
	});

	it("sets a team's budget on its own page, in Australian dollars, logged, and shows the season against it", async () => {
		const deps = createTestDeps();
		const client = makeClient(at(deps));
		const before = await (await client(`/admin/costs/${deps.team.id}`)).text();
		expect(before).toContain('placeholder="200 (the default)" value=""');
		expect(before).toContain("<span>Budget (the default)</span>");
		const saved = await client(`/admin/costs/${deps.team.id}/budget`, budgetForm("150"));
		expect([saved.status, saved.headers.get("Location")]).toEqual([303, `/admin/costs/${deps.team.id}?done=budget`]);
		const page = await (await client(`/admin/costs/${deps.team.id}?done=budget`)).text();
		expect(page).toContain("Budget saved.");
		expect(page).toContain('value="150.00"');
		expect(page).toContain("spent of $150.00 (");
		// A twelfth of the budget a month across the months chart, and the budget's straight line on the running total.
		expect(page).toContain("Budget a month $13</text>");
		expect(page.match(/class="budgetline"/g)).toHaveLength(2);
		expect(page).toMatch(/<tr><td>Oct 2026<\/td>[^]*?<td>\$12\.50<span class="sub">\$[\d.]+ (under|over)<\/span><\/td><\/tr>/);
		expect(page).toContain("<span>A player a season</span>");
		expect(page).toContain("<span>A player a month</span>");
		// In US dollars, the budget is too ($150 at $1.50 to the US dollar), but its box stays in Australian dollars.
		const usd = await (await client(`/admin/costs/${deps.team.id}?cur=usd`)).text();
		expect(usd).toContain("spent of $100.00 (");
		expect(usd).toContain('value="150.00"');
		// Saved from the US dollar page, it goes back to it.
		const fromUsd = await client(`/admin/costs/${deps.team.id}/budget`, form({ budget: "150", cur: "usd" }));
		expect(fromUsd.headers.get("Location")).toBe(`/admin/costs/${deps.team.id}?done=budget&cur=usd`);
		const log = await deps.db.prepare("SELECT admin_email AS a, action, detail FROM admin_log WHERE action = 'team_edited'").first();
		expect(log).toEqual({ a: MANAGER, action: "team_edited", detail: "season budget: $150.00 (was the default, $200.00)" });
		await client(`/admin/costs/${deps.team.id}/budget`, budgetForm(""));
		expect(await deps.db.prepare("SELECT budget FROM teams WHERE id = ?").bind(deps.team.id).first("budget")).toBeNull();
	});

	it("refuses a budget that isn't dollars, and a team that isn't there", async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		expect((await client(`/admin/costs/${deps.team.id}/budget`, budgetForm("lots"))).status).toBe(400);
		expect((await client(`/admin/costs/${deps.team.id}/budget`, budgetForm("-5"))).status).toBe(400);
		expect(await deps.db.prepare("SELECT budget FROM teams WHERE id = ?").bind(deps.team.id).first("budget")).toBeNull();
		expect((await client("/admin/costs/nope")).status).toBe(404);
		expect((await client("/admin/costs/nope/budget", budgetForm("5"))).status).toBe(404);
	});

	it("raises the budget alert as Costs opens: a warning when the season is estimated to go over", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("UPDATE teams SET budget = 60, created_at = '2026-10-01T00:00:00.000Z'").run();
		const page = await (await makeClient(at(deps))("/admin/costs")).text();
		expect(page).toContain('<span class="t warn">On track to go over</span>');
		const alert = await deps.db.prepare("SELECT level, detail FROM platform_alerts WHERE kind = 'budget'").first<{ level: string; detail: string }>();
		expect(alert?.level).toBe("warn");
		expect(alert?.detail).toMatch(/^Saints B12\.1: on track for \$[\d.,]+ of its \$60\.00 budget$/);
	});

	it("doesn't compare a team's month with one it only ran part of: its first month, or its first full one", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("UPDATE teams SET created_at = '2026-10-31T09:00:00.000Z'").run();
		await addTeam(deps.db);
		await deps.db.prepare("UPDATE teams SET created_at = '2026-11-10T00:00:00.000Z' WHERE id = ?").bind(G14_5.id).run();
		const page = await (await makeClient(at(deps))("/admin/costs")).text();
		expect(page).toMatch(/Saints B12\.1 \(2026\/27\)[^]*?<td class="c-month">\$[\d.]+<span class="sub">Its first full month<\/span>/);
		expect(page).toMatch(/Saints G14\.5 \(2026\/27\)[^]*?<td class="c-month">\$[\d.]+<span class="sub">Its first month<\/span>/);
	});

	it("compares a team closed partway through last month with last month, not as a first month", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("UPDATE teams SET created_at = '2026-09-01T00:00:00.000Z', status = 'closed', closed_at = '2026-10-20T00:00:00.000Z', delete_after = '2027-12-31T13:00:00.000Z'").run();
		const page = await (await makeClient(at(deps))("/admin/costs")).text();
		expect(page).not.toContain("Its first full month");
		expect(page).toMatch(/<td class="c-month">\$0\.00<span class="sub">Down \$[\d.]+ \(100%\) on Oct<\/span>/);
	});

	it("counts a clip as gone with its video, when the video goes first", async () => {
		const deps = createTestDeps();
		const video = await seedVideo(deps, { gameId: await seedGame(deps, { startsAt: "2026-10-10T09:00" }), streamUid: "uid-v" });
		await deps.db.prepare("INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, stream_uid) VALUES (?, ?, 'Steal', 0, 60, 'ready', 'clip-s')").bind(deps.team.id, video).run();
		await deps.db.prepare("UPDATE videos SET deleted_at = '2026-10-20T00:00:00.000Z' WHERE id = ?").bind(video).run();
		const clip = (await storedItems(deps.db)).find((i) => i.kind === "clip");
		expect(clip?.deletedAt).toBe("2026-10-20T00:00:00.000Z");
	});
});
