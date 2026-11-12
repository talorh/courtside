import { describe, expect, it } from "vitest";
import { PHASE_LABELS, phaseOfGrade, phaseOfWords } from "../../../src/features/games/season-phase.ts";

describe("the VJBL season's phases", () => {
	it("reads the phase from a PlayHQ grade name, as the 2026 and 2027 seasons name them", () => {
		expect(phaseOfGrade("12 Boys Grading 1 - Pool 2D")).toBe("grading1");
		expect(phaseOfGrade("14 Boys Grading 1 - Pool 8D")).toBe("grading1");
		expect(phaseOfGrade("12 Boys Grading 1 - Crossover")).toBe("crossover");
		expect(phaseOfGrade("U12 Boys Grading 2 - AA Pool B")).toBe("grading2");
		expect(phaseOfGrade("U12 Boys - VJL1 (P1)")).toBe("championship");
		expect(phaseOfGrade("U14 Girls - VC")).toBe("championship");
		expect(phaseOfGrade("")).toBe("championship");
	});
	it("reads a phase from the words a sheet, a page or a person uses, or none", () => {
		expect(phaseOfWords("Grading phase 1")).toBe("grading1");
		expect(phaseOfWords("grading 1")).toBe("grading1");
		expect(phaseOfWords("Phase 2")).toBe("grading2");
		expect(phaseOfWords("Grading Phase 2 - AA Pool B")).toBe("grading2");
		expect(phaseOfWords("Crossover game")).toBe("crossover");
		expect(phaseOfWords("Championship season")).toBe("championship");
		expect(phaseOfWords("championship")).toBe("championship");
		expect(phaseOfWords("")).toBeNull();
		expect(phaseOfWords("Round 3")).toBeNull();
	});
	it("names each phase", () => {
		expect(PHASE_LABELS).toEqual({ grading1: "Grading phase 1", crossover: "Crossover game", grading2: "Grading phase 2", championship: "Championship season" });
	});
});
