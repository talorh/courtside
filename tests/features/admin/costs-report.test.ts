import { describe, expect, it } from "vitest";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { addTeam } from "../../helpers/two-teams.ts";
import { sheetCells, unzip } from "../../helpers/unzip.ts";

// Costs' report for Excel: the season the page shows, in its currency, as a workbook: the figures, each team, each
// team's months by kind of cost, the teams month by month, and Cloudflare's bill.

async function client(now = "2026-11-15T00:00:00.000Z") {
	const deps = { ...createTestDeps(), now: () => new Date(now) };
	await deps.db.prepare("UPDATE teams SET created_at = '2026-10-01T00:00:00.000Z'").run();
	await addTeam(deps.db);
	const game = await seedGame(deps, { startsAt: "2026-10-10T10:00" });
	await seedVideo(deps, { gameId: game, streamUid: "uid-b12", createdAt: "2026-10-10T03:00:00.000Z" });
	const cloudflare = { figures: async () => { throw new Error("not this"); }, minutesByVideo: async (from: string, to: string) => [{ uid: "uid-b12", date: "2026-11-02", minutes: 1500 }].filter((g) => g.date >= from && g.date <= to) };
	return makeClient({ ...deps, cloudflare });
}

const values = (rows: Array<Array<{ v: string | number }>>) => rows.map((r) => r.map((c) => c.v));
const money = (s: string) => Number(s.replace(/[$,]/g, ""));

describe("Costs' report for Excel", () => {
	it("is a button on Costs that keeps the season and currency the page is in", async () => {
		const html = await (await (await client())("/admin/costs?cur=usd")).text();
		expect(html).toContain('<a class="btn" href="/admin/costs/report.xlsx?season=2026&amp;cur=usd" download>Download for Excel</a>');
	});

	it("downloads as a workbook named for the season and currency, its sheets in order", async () => {
		const res = await (await client())("/admin/costs/report.xlsx?season=2026");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
		expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="site-costs-2026-27-local.xlsx"');
		const workbook = new TextDecoder().decode(unzip(new Uint8Array(await res.arrayBuffer())).get("xl/workbook.xml")!.data);
		expect([...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])).toEqual(["Summary", "Teams", "Months", "Team by team", "Cloudflare bill"]);
	});

	it("says what it is, and has the page's figures as numbers: each team's season the same as its row on Costs", async () => {
		const get = await client();
		const html = await (await get("/admin/costs")).text();
		const file = new Uint8Array(await (await get("/admin/costs/report.xlsx")).arrayBuffer());
		const summary = values(sheetCells(file, 1));
		expect(summary[0]).toEqual(["Courtside costs, 2026/27 season"]);
		expect(String(summary[1]![0])).toMatch(/^In Australian dollars: 1 USD = [\d.]+ AUD/);
		expect(summary.find((r) => r[0] === "A player a season")?.[2]).toBe("Estimated");
		const teams = values(sheetCells(file, 2));
		const head = teams.findIndex((r) => r[0] === "Team");
		expect(teams[head]).toEqual(["Team", "Status", "Games with a video", "Players", "This month", "Season so far", "Season, estimated", "Budget",
			"Budget used so far", "Budget used, estimated", "A player a season", "A player a month", "Against budget"]);
		const b12 = teams.find((r) => r[0] === "Saints B12.1")!;
		const pageEstimate = money(html.match(/<td class="c-team"><a href="\/admin\/costs\/b12\.1-2026">[^]*?<td class="c-est">([^<]+)<\/td>/)![1]!);
		expect(b12[6]).toBeCloseTo(pageEstimate, 2);
		expect(typeof b12[4]).toBe("number");
	});

	it("has a row for each team's month, actual or estimated, by kind of cost adding up to its total", async () => {
		const file = new Uint8Array(await (await (await client())("/admin/costs/report.xlsx")).arrayBuffer());
		const months = values(sheetCells(file, 3));
		const head = months.findIndex((r) => r[0] === "Team");
		expect(months[head]).toEqual(["Team", "Month", "Actual or estimated", "Storage", "Watching", "Uploads", "Shared", "Total", "Minutes stored", "Minutes watched"]);
		const rows = months.slice(head + 1);
		expect(rows.length).toBeGreaterThan(12);
		for (const r of rows) expect((r[3] as number) + (r[4] as number) + (r[5] as number) + (r[6] as number)).toBeCloseTo(r[7] as number, 6);
		expect(rows.find((r) => r[0] === "Saints B12.1" && r[1] === "Sep 2027")?.[2]).toBe("Estimated");
	});

	it("a past season is all spent, in US dollars when asked", async () => {
		const res = await (await client("2027-11-15T00:00:00.000Z"))("/admin/costs/report.xlsx?season=2026&cur=usd");
		expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="site-costs-2026-27-usd.xlsx"');
		const summary = values(sheetCells(new Uint8Array(await res.arrayBuffer()), 1));
		expect(String(summary[1]![0])).toMatch(/^In US dollars/);
		expect(summary.some((r) => r[0] === "The season, estimated")).toBe(false);
		expect(summary.find((r) => r[0] === "A player, the season")).toBeDefined();
	});

	it("is for site admins only", async () => {
		const deps = createTestDeps();
		const res = await makeClient(deps, "manager@example.com")("/admin/costs/report.xlsx");
		expect([403, 404]).toContain(res.status);
	});
});
