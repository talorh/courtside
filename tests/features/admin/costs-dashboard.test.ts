import { describe, expect, it } from "vitest";
import type { TeamCosts } from "../../../src/features/admin/costs-estimate.ts";
import { storageTile } from "../../../src/features/admin/views/costs-widgets.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { addTeam } from "../../helpers/two-teams.ts";

// The Costs page as a dashboard: the figures as a row of tiles (each with a small picture), where the money goes this
// month beside the season, every team's season on one scale, and what the teams used this month.

async function page(now = "2026-11-15T00:00:00.000Z") {
	const deps = { ...createTestDeps(), now: () => new Date(now) };
	await deps.db.prepare("UPDATE teams SET created_at = '2026-10-01T00:00:00.000Z'").run();
	await addTeam(deps.db);
	const game = await seedGame(deps, { startsAt: "2026-10-10T10:00" });
	await seedVideo(deps, { gameId: game, streamUid: "uid-b12", createdAt: "2026-10-10T03:00:00.000Z" });
	const cloudflare = { figures: async () => { throw new Error("not this"); }, minutesByVideo: async (from: string, to: string) => [{ uid: "uid-b12", date: "2026-11-02", minutes: 1500 }].filter((g) => g.date >= from && g.date <= to) };
	return (await makeClient({ ...deps, cloudflare })("/admin/costs")).text();
}

const section = (html: string, title: string) => html.slice(html.indexOf(`<b>${title}</b>`), html.indexOf("</figure>", html.indexOf(`<b>${title}</b>`)));

describe("the Costs dashboard", () => {
	it("shows the figures as six tiles: the months as a sparkline, the season and the budgets as meters, Stream's storage", async () => {
		const html = await page();
		const tiles = html.slice(html.indexOf('class="scoreboard costtiles"'), html.indexOf("</section>", html.indexOf("costtiles")));
		expect(tiles.match(/<div class="sb">/g)).toHaveLength(6);
		expect(tiles).toContain('<svg class="mspark"');
		expect(tiles.match(/<svg class="tmeter"/g)).toHaveLength(3);
		// A player a season first (the running teams' estimate over their squads), with a month and this month under it.
		const player = tiles.match(/<b>\$([\d,.]+)<\/b><span>A player a season<\/span>[^]*?<span class="delta">\$([\d,.]+) a month, \$[\d,.]+ this month<\/span>/);
		expect(player).not.toBeNull();
		expect(Number(player![1]!.replace(",", "")) / 12).toBeCloseTo(Number(player![2]!.replace(",", "")), 1);
		// Only B12.1 has a squad, so a player a season is its own: the other team's costs aren't put on B12.1's players.
		const rows = [...html.matchAll(/<td class="c-game">\$([\d,.]+) a season/g)].map((r) => r[1]);
		expect(rows).toEqual([player![1]]);
		// The video's 47 minutes are all Stream stores, against the 1,100 the fake Stream says are bought.
		expect(tiles).toMatch(/<b>47 min<\/b><span>Stream storage<\/span>[^]*?of 1,100 bought/);
		expect(tiles).toMatch(/<span class="delta">\d+% of the season&#39;s estimate<\/span>/);
		// Not billed yet (no bill read in this test): what's spent and what's estimated of the season.
		expect(tiles).toMatch(/<span class="delta">\$[\d.]+ spent and \$[\d,.]+ estimated<\/span>/);
	});

	it("shows a past season without the estimate or Stream's storage, which are about now", async () => {
		const past = await (await makeClient({ ...createTestDeps(), now: () => new Date("2027-11-15T00:00:00.000Z") })("/admin/costs?season=2026")).text();
		expect(past.match(/<div class="sb">/g)).toHaveLength(4);
		expect(past).not.toContain("<span>Stream storage</span>");
		expect(past).not.toContain("<span>The season, estimated</span>");
		expect(past).toMatch(/<span>A player, the season<\/span>[^]*?<span class="delta">\$[\d,.]+ a month over twelve months<\/span>/);
		// Its last month is September's own figures, not today's (November isn't in that season): the site's fees, shared.
		expect(past).toMatch(/<b>\$[1-9][\d.]*<\/b><span>Sep 2027, its last month<\/span>/);
		expect(past).toMatch(/<td class="c-month">\$[1-9][\d.]*<span/);
	});

	it("puts this month beside the season in Where it goes, a figure each for every kind of cost", async () => {
		const where = section(await page(), "Where it goes");
		expect(where).toContain('<li class="khead" aria-hidden="true"><span></span><span>Nov</span><span>Season</span></li>');
		expect(where.match(/<span class="kval now">/g)).toHaveLength(4);
		// Watching this month: 1,500 minutes at $1 a thousand, $1.50 to the dollar.
		expect(where).toMatch(/Watching<\/span>\s*<span class="kval now">\$2\.25 <span class="vh">in Nov<\/span><\/span>/);
	});

	it("draws every team's season on one scale, the dearest first, each with its spent, its estimate and its budget", async () => {
		const each = section(await page(), "Each team's season");
		expect(each.match(/<li>/g)).toHaveLength(2);
		const [first, second] = [...each.matchAll(/<a href="\/admin\/costs\/([^"]+)">/g)].map((m) => m[1]);
		const estimate = (id: string) => Number(each.match(new RegExp(`${id.replace(".", "\\.")}"[^]*?<b>\\$([\\d.]+)</b> of \\$200\\.00`))?.[1]);
		expect(estimate(first!)).toBeGreaterThanOrEqual(estimate(second!));
		expect(each.match(/<rect class="spent /g)).toHaveLength(2);
		expect(each.match(/<rect class="est"/g)).toHaveLength(2);
		expect(each.match(/<rect class="budgetmark"/g)).toHaveLength(2);
	});

	it("shows what the teams used this month: minutes stored and watched, originals kept, and games with a video", async () => {
		const used = section(await page(), "Used this month");
		expect(used).toContain("<b>47</b><span>Minutes stored</span>");
		expect(used).toContain("<b>1,500</b><span>Minutes watched</span>");
		expect(used).toContain("<span>Originals in R2</span>");
		expect(used).toContain("<b>1</b><span>Games with a video</span><span class=\"sub\">Of 60, 30 a team</span>");
	});

	it("consolidates every team month by month: a row a team, dearest first, its season, and every team's total under them", async () => {
		const html = await page();
		const grid = section(html, "Team by team");
		expect(grid).toContain("<th scope=\"col\">Oct</th><th scope=\"col\" class=\"now\">Nov</th><th scope=\"col\" class=\"est\">Dec</th>");
		const rows = [...grid.matchAll(/<tr( class="total")?><th scope="row">(.*?)<\/th>(.*?)<\/tr>/g)];
		expect(rows.map((r) => r[2]!.replace(/<[^>]+>/g, ""))).toEqual(["Saints B12.1", "Saints G14.5", "Every team"]);
		expect(rows[2]![1]).toBe(' class="total"');
		// Twelve months and the season in each row; the estimated months marked, the season's figure last.
		for (const r of rows) expect(r[3]!.match(/<td/g)).toHaveLength(13);
		expect(rows[0]![3]!.match(/<td class="hm\d est"/g)).toHaveLength(10);
		const dollars = (cell: string) => Number(cell.match(/\$([\d,.]+)/)![1]!.replace(",", ""));
		const cells = (r: RegExpMatchArray) => [...r[3]!.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((c) => dollars(c[1]!));
		const [a, b, all] = rows.map(cells);
		all!.forEach((total, i) => expect(total).toBeCloseTo(a![i]! + b![i]!, 1));
		expect(a![12]).toBeGreaterThanOrEqual(b![12]!);
		// The page's own season total is the grid's.
		expect(html).toContain(`$${all![12]!.toFixed(2)} for the season, estimated`);
	});

	it("measures Stream's storage against the bundle's 1,000 minutes until more is bought, amber past 80% and red past it", () => {
		const storing = (stored: number) => ({ thisMonth: { use: { stored } } }) as unknown as TeamCosts;
		expect(storageTile([storing(500)], null)).toMatchObject({ value: "500 min", note: "of 1,000 in the bundle" });
		expect(storageTile([storing(500), storing(350)], null).pic?.__html).toContain('class="fill warn" width="85.0"');
		expect(storageTile([storing(1200)], 1000).pic?.__html).toContain('class="fill over" width="100.0"');
		expect(storageTile([storing(1200)], 2000)).toMatchObject({ note: "of 2,000 bought" });
	});
});
