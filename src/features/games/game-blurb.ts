import type { Score } from "../scores/scores-repository.ts";
import { CLUB } from "../../club.ts";
import { CLUB_LINES } from "./game-lines-club.ts";
import { type LineKind, renderLine, RIVAL_CLUBS, type TeamLines } from "./game-lines.ts";
import type { gamePhase } from "./game-format.ts";
import type { Game } from "./games-repository.ts";

// A line for each game, "the Saints take on <opponent> at <venue>", from the team's lines or the club's (game-lines.ts).
// A win by one point is a thriller, with its own lines.
// A game always gets the same line (picked by its id). How it went only when there's a score to show (not when the
// member hides scores). An upcoming game away from the club's home venue can also get a line about the trip, and one against a local
// rival gets a rivals line until there's a result to tell.
type Phase = "upcoming" | "playing" | "played" | "won" | "won_by_one" | "lost" | "drew";

const RIVALS: Partial<Record<Phase, LineKind>> = { upcoming: "rivals_upcoming", playing: "rivals_playing", played: "rivals_played" };
const escaped = CLUB.homeVenue.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
const HOME = new RegExp(`\\b${escaped}\\b`, "i");
const RIVAL = new RegExp(`\\b(${RIVAL_CLUBS.join("|")})\\b`, "i");

function phaseOf(phase: ReturnType<typeof gamePhase>, score: Score | null): Phase {
	if (phase === "upcoming") return "upcoming";
	if (phase === "in_progress") return "playing";
	if (!score) return "played";
	if (score.ours === score.opponent) return "drew";
	return score.ours - score.opponent === 1 ? "won_by_one" : score.ours > score.opponent ? "won" : "lost";
}

/** The game's line. `score`: null when there's none, or the member hides scores. `lines`: the groups the team changed. */
export function gameBlurb(game: Pick<Game, "id" | "opponent" | "venue">, phase: ReturnType<typeof gamePhase>, score: Score | null, lines: TeamLines = {}): string {
	const group = (kind: LineKind) => lines[kind] ?? CLUB_LINES[kind];
	const kind = phaseOf(phase, score);
	const known = game.opponent.trim() && game.opponent.trim().toUpperCase() !== "TBC";
	const who = known ? game.opponent.trim() : kind === "upcoming" ? "a team still to be confirmed" : "their opponents";
	const venue = game.venue.trim();
	const rival = known ? RIVALS[kind] : undefined;
	const pick = rival && RIVAL.test(who) ? group(rival)
		: kind === "upcoming" && venue && !HOME.test(venue) ? [...group("upcoming"), ...group("away")] : group(kind);
	return renderLine(pick[game.id % pick.length]!, { who, venue, h: score?.ours ?? 0, o: score?.opponent ?? 0 });
}
