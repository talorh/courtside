import { describe, expect, it } from "vitest";
import { teamCopy } from "../../../src/features/teams/team-copy.ts";
import { teamSeason } from "../../../src/features/teams/team-code.ts";
import { B12_1 } from "../../helpers/fakes.ts";
import { G14_5 } from "../../helpers/two-teams.ts";

describe("each team's names, and who to ask", () => {
	it("says Sam for B12.1, whose ask name is Sam", () => {
		expect(teamCopy(B12_1)).toEqual({ short: "Saints B12.1", long: "Saints U12 Boys 12.1", ask: "Sam", Ask: "Sam", helper: "Virtual Sam" });
	});
	it("says your team manager for a team with no ask name, and its helper is Virtual Team Manager", () => {
		expect(teamCopy(G14_5)).toEqual({ short: "Saints G14.5", long: "Saints U14 Girls 14.5", ask: "your team manager", Ask: "Your team manager", helper: "Virtual Team Manager" });
	});
	it("gives a team its own season, whatever today's date", () => {
		expect(teamSeason({ ...G14_5, seasonStart: 2027 })).toEqual({ start: 2027, end: 2028, label: "2027/28" });
	});
});

describe("a team's pages show its own season", () => {
	it("Watch games, the roster and its spreadsheet say the team's season, even when it's viewed in a later one", async () => {
		const { createTestDeps } = await import("../../helpers/fakes.ts");
		const { makeClient } = await import("../../helpers/app.ts");
		const { sheetRows } = await import("../../helpers/unzip.ts");
		// Saints B12.1's 2026/27 season, closed, looked at in November 2027 (season 2027/28 by the calendar).
		const deps = createTestDeps(new Date("2027-11-10T00:00:00Z"));
		await deps.db.prepare("UPDATE teams SET status = 'closed', delete_after = '2027-12-31T13:00:00.000Z' WHERE id = ?").bind(deps.team.id).run();
		await deps.db.prepare("INSERT INTO games (team_id, starts_at, competition, opponent) VALUES (?, '2026-11-06T18:40', 'VJBL', 'Lakeside')").bind(deps.team.id).run();
		const manager = makeClient(deps);
		expect(await (await manager("/games")).text()).toContain("Season 2026/27");
		const roster = await (await manager("/roster")).text();
		expect(roster).toContain("Lakeside");
		const xlsx = await manager("/roster/export.xlsx");
		expect(xlsx.headers.get("Content-Disposition")).toContain("2026-27");
		expect(sheetRows(new Uint8Array(await xlsx.arrayBuffer()))[1]?.[1]).toContain("Lakeside");
	});
});
