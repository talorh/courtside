import { describe, expect, it } from "vitest";
import { competitionLabel, downloadBaseName, gameTitle } from "../../../src/features/games/game-format.ts";

describe("game format", () => {
	it("titles games by competition", () => {
		expect(gameTitle({ competition: "VJBL", roundLabel: "8", opponent: "Westside Storm" })).toBe("Round 8 · vs Westside Storm");
		expect(gameTitle({ competition: "Tournament", roundLabel: "Semi", opponent: "Pine Valley Eagles" })).toBe("Semi · vs Pine Valley Eagles");
		expect(gameTitle({ competition: "Practice match", roundLabel: "", opponent: "TBC" })).toBe("Practice match · vs TBC");
	});
	it("puts the season's phase in a league grading or crossover game's title; the championship season is the season itself", () => {
		expect(gameTitle({ competition: "VJBL", roundLabel: "2", opponent: "Hillcrest 2", phase: "grading1" })).toBe("Grading phase 1, Round 2 · vs Hillcrest 2");
		expect(gameTitle({ competition: "VJBL", roundLabel: "1", opponent: "Hillcrest 2", phase: "crossover" })).toBe("Crossover game · vs Hillcrest 2");
		expect(gameTitle({ competition: "VJBL", roundLabel: "3", opponent: "Westside 1", phase: "grading2" })).toBe("Grading phase 2, Round 3 · vs Westside 1");
		expect(gameTitle({ competition: "VJBL", roundLabel: "14", opponent: "Lakeside 2", phase: "championship" })).toBe("Round 14 · vs Lakeside 2");
		expect(gameTitle({ competition: "VJBL", roundLabel: "", opponent: "TBC", phase: "grading2" })).toBe("Grading phase 2 · vs TBC");
		expect(gameTitle({ competition: "VJBL", roundLabel: "Finals Round 1", opponent: "Bayside 1", phase: "championship" })).toBe("Finals Round 1 · vs Bayside 1");
		expect(gameTitle({ competition: "Tournament", roundLabel: "Semi", opponent: "Eagles", phase: "grading1" })).toBe("Semi · vs Eagles");
		expect(gameTitle({ competition: "VJBL", roundLabel: "8", opponent: "Storm", phase: null })).toBe("Round 8 · vs Storm");
	});
	it("builds a safe download name, from the team's code", () => {
		const game = { startsAt: "2026-09-06T10:20", competition: "VJBL" as const, roundLabel: "8", opponent: "Westside Storm" };
		expect(downloadBaseName({ code: "b12.1" }, game)).toBe("saints-b12-1-2026-09-06-round-8-vs-westside-storm");
		expect(downloadBaseName({ code: "g14.5" }, game)).toBe("saints-g14-5-2026-09-06-round-8-vs-westside-storm");
	});
	it("names the competition with the team's own age group", () => {
		expect(competitionLabel("VJBL", { code: "b12.1" })).toBe("VJBL U12 Boys");
		expect(competitionLabel("VJBL", { code: "g14.5" })).toBe("VJBL U14 Girls");
		expect(competitionLabel("Tournament", { code: "g14.5" })).toBe("Tournament");
	});
});
