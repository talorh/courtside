import { CLUB } from "../../club.ts";

// The league season's phases, as PlayHQ names a game's grade (VJBL, the example league: three grading rounds, "12 Boys
// Grading 1 - Pool 2D"; a crossover game, "12 Boys Grading 1 - Crossover"; three more grading rounds, "U12 Boys Grading 2
// - AA Pool B"; then the season proper in the team's division, "U12 Boys - VJL1 (P1)", its rounds and finals). Each
// phase's rounds start again from 1, and PlayHQ drops the played grading games after each phase, so a game keeps its
// phase here. The labels are the club's (club.ts seasonPhases).

export const SEASON_PHASES = ["grading1", "crossover", "grading2", "championship"] as const;
export type SeasonPhase = (typeof SEASON_PHASES)[number];

export const PHASE_LABELS: Record<SeasonPhase, string> = CLUB.seasonPhases;

/** The phase of a league game from its PlayHQ grade's name: anything that isn't grading or the crossover is the season proper. */
export const phaseOfGrade = (grade: string): SeasonPhase => phaseOfWords(grade) ?? "championship";

/** A phase from the words a person, a spreadsheet or a fixture page uses ("Grading phase 1", "grading 2", "crossover",
 * "championship"), or null when they name none. */
export function phaseOfWords(text: string): SeasonPhase | null {
	const s = text.toLowerCase();
	if (/cross/.test(s)) return "crossover";
	if (/(grading|phase)\s*(phase\s*)?1\b/.test(s)) return "grading1";
	if (/(grading|phase)\s*(phase\s*)?2\b/.test(s)) return "grading2";
	if (/champ|season/.test(s)) return "championship";
	return null;
}
