// Team codes: b or g, the age group, a dot, the team's number. b12.1 is the boys' U12 1s; g14.5
// the girls' U14 5s. Names come from the code.
import { CLUB } from "../../club.ts";
import { seasonEndDeadline, seasonLabel } from "../../shared/time.ts";
import type { Team } from "./team.ts";

export interface TeamCode { code: string; gender: "b" | "g"; age: number; number: number }

const CODE = /^([bg])([0-9]{1,2})\.([0-9]{1,2})$/;

/** A code as typed ("B12.1 ", "g14.5"), or null when it isn't one. */
export function parseTeamCode(text: string): TeamCode | null {
	const code = text.trim().toLowerCase();
	const m = CODE.exec(code);
	if (!m) return null;
	return { code, gender: m[1] as "b" | "g", age: Number(m[2]), number: Number(m[3]) };
}

/** "Saints B12.1" for the top bar and titles; "Saints U12 Boys 12.1" for Home (the club's names, club.ts). */
export function teamNames(code: string): { short: string; long: string } {
	const parsed = parseTeamCode(code);
	if (!parsed) throw new Error(`Not a team code: "${code}"`);
	const shown = `${parsed.gender.toUpperCase()}${parsed.age}.${parsed.number}`;
	return { short: `${CLUB.nickname} ${shown}`, long: `${CLUB.name} U${parsed.age} ${parsed.gender === "b" ? "Boys" : "Girls"} ${parsed.age}.${parsed.number}` };
}

/** The team as fixtures name it ("Saints U12 Boys 1" for b12.1, as on PlayHQ), worked out from its code. */
export function fixtureTeamName(code: string): string {
	const p = parseTeamCode(code);
	if (!p) throw new Error(`Not a team code: "${code}"`);
	return `${CLUB.fixtureName} U${p.age} ${p.gender === "b" ? "Boys" : "Girls"} ${p.number}`;
}

/** The name for AI reading a fixture page, with the other ways a club site or a tournament's draw writes it. */
export function fixtureTeamHint(code: string): string {
	const p = parseTeamCode(code);
	if (!p) throw new Error(`Not a team code: "${code}"`);
	const group = `U${p.age} ${p.gender === "b" ? "Boys" : "Girls"}`;
	return `${fixtureTeamName(code)} (it may be written "${CLUB.name} ${group} ${p.number}" or "${CLUB.fixtureName} U${p.age}${p.gender.toUpperCase()}${p.number}", or just "${CLUB.fixtureName} ${p.number}" on a page for ${group} alone)`;
}

/**
 * When a team's games usually tip off ('HH:MM'): U12 at 6:40pm and an hour later every two years of age (U14 7:40pm,
 * U16 8:40pm, U18 9:40pm), boys and girls the same. An age between gets the younger group's; under 12 is U12's and over
 * 18 is U18's. A new game starts there, and so does a game whose tip-off isn't known yet.
 */
export function usualTipOff(code: string): string {
	const p = parseTeamCode(code);
	if (!p) throw new Error(`Not a team code: "${code}"`);
	return `${18 + Math.floor((Math.min(18, Math.max(12, p.age)) - 12) / 2)}:40`;
}

/** A new team's id: its code and season ("g14.5-2026"), so next season's team with the same code is a different one. */
export const newTeamId = (code: string, seasonStart: number) => `${code}-${seasonStart}`;

/** "Saints B12.1", or "Saints B12.1 (2026/27)" where two teams share a code (the old one closed). */
export const teamLabel = (team: Pick<Team, "code" | "seasonStart">, o: { season?: boolean } = {}) =>
	`${teamNames(team.code).short}${o.season ? ` (${seasonLabel(team.seasonStart)})` : ""}`;

/** A team's own season (each team is one season's squad), whatever today's date: a closed team viewed next year is
 * still its own season. The shape of `seasonOf` (shared/time.ts). */
export const teamSeason = (team: Pick<Team, "seasonStart">) => ({ start: team.seasonStart, end: team.seasonStart + 1, label: seasonLabel(team.seasonStart) });

/** When a team's videos, clips and photos go, every one of them (a practice game before its October too): the end of 31
 * December of the year its season ends, as Help tells families. */
export const footageDue = (team: Pick<Team, "seasonStart">) => seasonEndDeadline(team.seasonStart);
