import { describe, expect, it } from "vitest";
import { fixtureTeamHint, fixtureTeamName, footageDue, newTeamId, parseTeamCode, teamLabel, teamNames, usualTipOff } from "../../../src/features/teams/team-code.ts";
import { seasonEndDeadline, seasonLabel } from "../../../src/shared/time.ts";

describe("team codes", () => {
	it("reads b or g, the age group, a dot and the team's number, in any case and with spaces around", () => {
		expect(parseTeamCode("b12.1")).toEqual({ code: "b12.1", gender: "b", age: 12, number: 1 });
		expect(parseTeamCode("G14.5")).toEqual({ code: "g14.5", gender: "g", age: 14, number: 5 });
		expect(parseTeamCode(" g14.5 ")?.code).toBe("g14.5");
		expect(parseTeamCode("b8.12")).toEqual({ code: "b8.12", gender: "b", age: 8, number: 12 });
	});

	it("refuses anything else", () => {
		for (const bad of ["b12", "x12.1", "b123.1", "b12.100", "b12.1-2026", "", "b1 2.1", "b.1", "12.1", "bb12.1", "b12.0x"]) {
			expect(parseTeamCode(bad), bad).toBeNull();
		}
	});

	it("names a team from its code: short for the top bar, long for Home", () => {
		expect(teamNames("b12.1")).toEqual({ short: "Saints B12.1", long: "Saints U12 Boys 12.1" });
		expect(teamNames("g14.5")).toEqual({ short: "Saints G14.5", long: "Saints U14 Girls 14.5" });
	});

	it("names a team as fixtures do, from its code alone, so nobody types it", () => {
		expect(fixtureTeamName("b12.1")).toBe("Saints U12 Boys 1");
		expect(fixtureTeamName("g14.5")).toBe("Saints U14 Girls 5");
		expect(fixtureTeamHint("b12.1")).toBe('Saints U12 Boys 1 (it may be written "Saints U12 Boys 1" or "Saints U12B1", or just "Saints 1" on a page for U12 Boys alone)');
	});

	it("gives a new team an id from its code and season", () => {
		expect(newTeamId("g14.5", 2026)).toBe("g14.5-2026");
	});

	it("labels a team, with its season when two share a code", () => {
		const team = { code: "b12.1", seasonStart: 2026 };
		expect(teamLabel(team)).toBe("Saints B12.1");
		expect(teamLabel(team, { season: true })).toBe("Saints B12.1 (2026/27)");
	});
});

describe("the usual tip-off", () => {
	it("is an hour later every two years of age, boys and girls the same: U12 6:40pm, U14 7:40pm, U16 8:40pm, U18 9:40pm", () => {
		expect(["b12.1", "g12.3", "b14.3", "g14.5", "b16.2", "g16.1", "b18.1", "g18.2"].map(usualTipOff))
			.toEqual(["18:40", "18:40", "19:40", "19:40", "20:40", "20:40", "21:40", "21:40"]);
	});
	it("gives an age between them the younger group's time, and keeps to U12's and U18's beyond them", () => {
		expect(["b10.1", "b13.1", "g15.2", "b17.1", "b20.1"].map(usualTipOff)).toEqual(["18:40", "18:40", "19:40", "20:40", "21:40"]);
	});
});

describe("seasons", () => {
	it("label a season by its first year, and end its footage on 31 Dec of the year it ends (local)", () => {
		expect(seasonLabel(2026)).toBe("2026/27");
		expect(seasonLabel(2099)).toBe("2099/00");
		expect(seasonEndDeadline(2026)).toBe("2027-12-31T13:00:00.000Z");
	});
	it("a team's footage goes with its own season, whatever today's date", () => {
		expect(footageDue({ seasonStart: 2026 })).toBe("2027-12-31T13:00:00.000Z");
		expect(footageDue({ seasonStart: 2027 })).toBe("2028-12-31T13:00:00.000Z");
	});
});
