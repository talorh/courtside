import { describe, expect, it } from "vitest";
import { competitionLabel, downloadBaseName, gameTitle } from "../../../src/features/games/game-format.ts";

describe("game format", () => {
	it("titles games by competition", () => {
		expect(gameTitle({ competition: "VJBL", roundLabel: "8", opponent: "Westside Storm" })).toBe("Round 8 · vs Westside Storm");
		expect(gameTitle({ competition: "Tournament", roundLabel: "Semi", opponent: "Pine Valley Eagles" })).toBe("Semi · vs Pine Valley Eagles");
		expect(gameTitle({ competition: "Practice match", roundLabel: "", opponent: "TBC" })).toBe("Practice match · vs TBC");
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
