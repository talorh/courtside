import { CLUB } from "../../club.ts";
import type { Team } from "../teams/team.ts";
import { parseTeamCode } from "../teams/team-code.ts";
import type { Competition, Game } from "./games-repository.ts";

type Titled = Pick<Game, "competition" | "roundLabel" | "opponent">;

export function gameTitle(game: Titled): string {
	const isRoundNumber = game.competition === CLUB.league && /^\d+$/.test(game.roundLabel);
	const label = isRoundNumber ? `Round ${game.roundLabel}` : game.roundLabel || game.competition;
	return `${label} · vs ${game.opponent}`;
}

/** "VJBL U12 Boys" for B12.1: the league with the team's own age group. */
export function competitionLabel(competition: Competition, team: Pick<Team, "code">): string {
	const p = parseTeamCode(team.code);
	return competition === CLUB.league && p ? `${CLUB.league} U${p.age} ${p.gender === "b" ? "Boys" : "Girls"}` : competition;
}

export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** File name stem for downloads, from the team's code: saints-b12-1-2026-09-06-round-8-vs-westside-storm */
export function downloadBaseName(team: Pick<Team, "code">, game: Titled & Pick<Game, "startsAt">): string {
	return `${slug(CLUB.nickname)}-${slug(team.code)}-${game.startsAt.slice(0, 10)}-${slug(gameTitle(game))}`;
}

/** A game lasts about an hour from tip-off. */
export const GAME_MINUTES = 60;

/**
 * Still to come, being played (the hour after tip-off), or over. Both times are local wall time 'YYYY-MM-DDTHH:MM'.
 * A game whose final score is in (`scored`) is over, even inside its hour.
 */
export function gamePhase(startsAt: string, nowLocal: string, scored = false): "upcoming" | "in_progress" | "complete" {
	if (startsAt > nowLocal) return "upcoming";
	const end = new Date(Date.parse(`${startsAt}:00Z`) + GAME_MINUTES * 60_000).toISOString().slice(0, 16);
	return end > nowLocal && !scored ? "in_progress" : "complete";
}
