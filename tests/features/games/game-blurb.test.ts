import { describe, expect, it } from "vitest";
import { gameBlurb } from "../../../src/features/games/game-blurb.ts";
import type { Score } from "../../../src/features/scores/scores-repository.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

// "the Saints take on <opponent team> at <location>", a line per game from templates.
const game = (id: number, opponent = "Northside 2", venue = "Saints Stadium, Court 1") => ({ id, opponent, venue });
const score = (ours: number, opponent: number): Score => ({ gameId: 1, ours, opponent, source: "manual" });
const PHASES = ["upcoming", "in_progress", "complete"] as const;
const RESULTS = [null, score(34, 28), score(28, 34), score(30, 30)];

describe("game descriptions", () => {
	it("every line reads cleanly, with or without a venue and with the opponent still TBC", () => {
		for (let id = 1; id <= 24; id++) {
			for (const g of [game(id), game(id, "TBC"), game(id, "Lakeside", ""), game(id, "TBC", "  "), game(id, "Bayside 6"), game(id, "Westside 2", "")]) {
				for (const phase of PHASES) {
					for (const s of phase === "complete" ? RESULTS : [null]) {
						const line = gameBlurb(g, phase, s);
						expect(line, line).toMatch(/^[A-Z][^]*[.!]$/);
						expect(line, line).not.toMatch(/undefined|null|NaN|TBC|\s[,.:!]|\s{2}|\bat\s*[.,:]|—|–/);
						if (g.venue.trim()) expect(line).toContain(`at ${g.venue}`);
						expect(line, line).not.toMatch(/Court 1[,:]? \d/); // a score running into the court number
						if (g.opponent !== "TBC") expect(line).toContain(g.opponent);
					}
				}
			}
		}
	});

	it("a win by one point is a thriller, and only a win by one: a two-point win, and a one-point loss, are the usual", () => {
		for (let id = 1; id <= 6; id++) {
			const close = gameBlurb(game(id, "Seaview 1", "Dromana College, Court 3"), "complete", score(31, 30));
			expect(close).toBe("The Saints won by one in a thriller against Seaview 1 at Dromana College, Court 3. Final score 31 to 30.");
			expect(gameBlurb(game(id, "Lakeside"), "complete", score(32, 30))).not.toContain("thriller");
			expect(gameBlurb(game(id, "Lakeside"), "complete", score(30, 31))).not.toContain("thriller");
			expect(gameBlurb(game(id, "Lakeside", ""), "complete", score(31, 30))).toBe("The Saints won by one in a thriller against Lakeside. Final score 31 to 30.");
		}
		// A team that changed its thriller lines gets its own; one that changed only Won still gets the club's thriller.
		expect(gameBlurb(game(1), "complete", score(31, 30), { won_by_one: ["By a whisker against {opponent}, {ours} to {them}."] })).toBe("By a whisker against Northside 2, 31 to 30.");
		expect(gameBlurb(game(1), "complete", score(31, 30), { won: ["The Saints beat {opponent}, {ours} to {them}."] })).toContain("thriller");
	});

	it("says how it went only with a score to show, and keeps its line every time", () => {
		expect(gameBlurb(game(1), "upcoming", null)).toContain("Northside 2 at Saints Stadium, Court 1");
		for (let id = 1; id <= 6; id++) {
			expect(gameBlurb(game(id), "complete", score(34, 28))).toContain("34 to 28");
			expect(gameBlurb(game(id), "complete", score(28, 34))).toContain("28 to 34");
			expect(gameBlurb(game(id), "complete", score(30, 30))).toContain("30 all");
			// No numbers in the names here, so any digit would be a score.
			expect(gameBlurb(game(id, "Lakeside Rockets", "Lakeside Stadium"), "complete", null)).not.toMatch(/\d/);
			expect(gameBlurb(game(id, "Lakeside Rockets", "Lakeside Stadium"), "in_progress", null)).not.toMatch(/\d/);
			expect(gameBlurb(game(id), "complete", score(34, 28))).toBe(gameBlurb(game(id), "complete", score(34, 28)));
		}
		// A game's line is fixed by its id (reordering the templates would change every game's line: do it on purpose).
		expect(gameBlurb(game(1), "upcoming", null)).toBe("Next up: the Saints against Northside 2 at Saints Stadium, Court 1.");
		expect(gameBlurb(game(4), "upcoming", null)).toBe("The Saints go after Northside 2 at Saints Stadium, Court 1.");
		expect(gameBlurb(game(1), "complete", score(28, 34))).toBe("A tough one against Northside 2 at Saints Stadium, Court 1. Final score 28 to 34, and plenty to build on.");
		// Away from Saints Stadium, an upcoming game can get a line about the trip; at home, never.
		expect(gameBlurb(game(12, "Seaview 1", "Dromana College, Court 3"), "upcoming", null)).toBe("The Saints hit the road to take on Seaview 1 at Dromana College, Court 3.");
		for (let id = 1; id <= 24; id++) {
			expect(gameBlurb(game(id, "Lakeside", "Saints Stadium Court 4"), "upcoming", null)).not.toMatch(/road|travel|trip|away from/i);
			expect(gameBlurb(game(id, "Lakeside", ""), "upcoming", null)).not.toMatch(/road|travel|trip|away from/i);
			expect(gameBlurb(game(id, "Lakeside", "Lakeside Stadium"), "complete", null)).not.toMatch(/road|travel|trip|away from/i);
		}
		const away = new Set(Array.from({ length: 17 }, (_, i) => gameBlurb(game(i + 1, "Lakeside", "Lakeside Stadium"), "upcoming", null)));
		expect([...away].filter((l) => /road|travel|trip|away from/i.test(l))).toHaveLength(5);
		// Against Westside or Bayside, a rivals line, until the result is the story.
		for (let id = 1; id <= 6; id++) {
			for (const o of ["Bayside 6", "Westside Storm", "BAYSIDE COBRAS"]) {
				expect(gameBlurb(game(id, o, "Dromana College, Court 3"), "upcoming", null)).toMatch(/rivals|derby|Bragging/);
				expect(gameBlurb(game(id, o), "in_progress", null)).toMatch(/^Local rivals battle it out/);
				expect(gameBlurb(game(id, o), "complete", null)).toMatch(/^Local rivals battled it out/);
				expect(gameBlurb(game(id, o), "complete", score(34, 28))).toContain("34 to 28");
			}
			expect(gameBlurb(game(id, "Northside 2"), "upcoming", null)).not.toMatch(/rivals|derby|Bragging/);
		}
		const lines = new Set([1, 2, 3, 4, 5, 6].map((id) => gameBlurb(game(id), "upcoming", null)));
		expect(lines.size).toBeGreaterThan(1);
		// Eight ways to tell a win and seven a loss, so a season doesn't keep repeating one.
		const told = (s: Score) => new Set(Array.from({ length: 24 }, (_, i) => gameBlurb(game(i + 1), "complete", s))).size;
		expect(told(score(34, 28))).toBe(8);
		expect(told(score(28, 34))).toBe(7);
	});

	it("is on the game page under the title, and leaves the result out for a member who hides scores", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "Lakeside Rockets", venue: "Lakeside Basketball Stadium" });
		const manager = makeClient(deps);
		await manager(`/games/${gameId}/score`, form({ ours: "34", opponent: "28" }));
		const blurbOf = async () => (await (await manager(`/games/${gameId}`)).text()).split('<p class="blurb">')[1]?.split("</p>")[0] ?? "";
		expect(await blurbOf()).toContain("Lakeside Rockets at Lakeside Basketball Stadium");
		expect(await blurbOf()).toContain("34 to 28");
		await manager("/me/scores", form({ hide: "1", back: `/games/${gameId}` }));
		expect(await blurbOf()).toContain("Lakeside Rockets");
		expect(await blurbOf()).not.toMatch(/\d/);
	});
});
