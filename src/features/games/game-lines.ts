import { CLUB } from "../../club.ts";
// A game's line, the one under its title, comes from a group of lines: the club's (game-lines-club.ts), or the team's own
// once its team manager changes that group (Manage team, Game lines). A line is plain words with stand-ins for the
// game's details, so nothing is made up about the players.

// The order Manage team lists them in.
export const LINE_KINDS = ["upcoming", "away", "rivals_upcoming", "playing", "rivals_playing", "played", "rivals_played", "won", "won_by_one", "lost", "drew"] as const;
export type LineKind = typeof LINE_KINDS[number];
/** The groups a team has changed, its lines for each. */
export type TeamLines = Partial<Record<LineKind, string[]>>;

/** The local rivals, who get their own lines until there's a result to tell. */
export const RIVAL_CLUBS: readonly string[] = CLUB.rivals;

/** Each group's name (in the Log too) and when its lines are used. */
export const LINE_GROUPS: Record<LineKind, { name: string; when: string }> = {
	upcoming: { name: "Coming up", when: "Before the game." },
	away: { name: `Coming up, away from ${CLUB.homeVenue}`, when: `Before a game somewhere other than ${CLUB.homeVenue}: these are used along with Coming up's.` },
	rivals_upcoming: { name: "Coming up, against a local rival", when: `Before a game against ${RIVAL_CLUBS.join(" or ")}, in place of the others.` },
	playing: { name: "Being played now", when: "While the game is on." },
	rivals_playing: { name: "Being played now, against a local rival", when: `While a game against ${RIVAL_CLUBS.join(" or ")} is on.` },
	played: { name: "Finished, no score shown", when: "After the game when there's no score to show: none entered yet, or the person has hidden scores." },
	rivals_played: { name: "Finished against a local rival, no score shown", when: `After a game against ${RIVAL_CLUBS.join(" or ")} with no score to show.` },
	won: { name: "Won", when: "After a win, with the score." },
	won_by_one: { name: "Won by one point", when: "After a win by a single point (a thriller), in place of Won's." },
	lost: { name: "Lost", when: "After a loss, with the score." },
	drew: { name: "Drew", when: "After a draw, with the score ({ours} is both teams' score)." },
};

const STAND_INS = ["opponent", "venue", "ours", "them"];
/** The scores each result's lines must show; the other groups show none. */
const SCORES: Partial<Record<LineKind, string[]>> = { won: ["ours", "them"], won_by_one: ["ours", "them"], lost: ["ours", "them"], drew: ["ours"] };
export const MAX_LINES = 20;
export const MAX_LENGTH = 200;

export interface LineSlots { who: string; venue: string; h: number; o: number }

/** The line for a game: " at {venue}" is left out when the game has no venue. */
export function renderLine(line: string, s: LineSlots): string {
	const value: Record<string, string> = { opponent: s.who, ours: String(s.h), them: String(s.o) };
	return line.replace(/ at \{venue\}|\{(opponent|ours|them)\}/g, (_match, name?: string) => (name ? value[name]! : s.venue ? ` at ${s.venue}` : ""));
}

function problemsOf(kind: LineKind, line: string): string[] {
	const names = [...line.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!);
	const unknown = names.find((n) => !STAND_INS.includes(n));
	const scores = SCORES[kind];
	return [
		line.length > MAX_LENGTH && `is longer than ${MAX_LENGTH} letters.`,
		!/^[A-Z]/.test(line) && "should start with a capital letter.",
		!/[.!?]$/.test(line) && "should end with a full stop, ! or ?.",
		unknown !== undefined && `has {${unknown}}, which isn't one of {opponent}, {venue}, {ours} and {them}.`,
		!names.includes("opponent") && `needs {opponent}, the team the ${CLUB.nickname} play.`,
		scores ? scores.some((s) => !names.includes(s)) && (scores.length === 2 ? "needs both scores, {ours} and {them}." : "needs the score, {ours}.")
			: (names.includes("ours") || names.includes("them")) && "shows the score, which only the Won, Won by one point, Lost and Drew lines can.",
		line.replaceAll(" at {venue}", "").includes("{venue}") && 'has {venue} without "at" just before it: write "at {venue}", so it can be left out when a game has no venue.',
		/ at \{venue\}[,:;]?\s*\{(ours|them)\}/.test(line) && "has a score straight after the venue, where it would run into a court number: put words between them.",
	].filter((p): p is string => typeof p === "string");
}

/** A group's box as the team manager typed it: its lines, one a row (none: the club's lines), or what's wrong. */
export function checkLines(kind: LineKind, text: string): { lines: string[] } | { problems: string[] } {
	const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	if (lines.length > MAX_LINES) return { problems: [`There are ${lines.length} lines: ${MAX_LINES} at most.`] };
	const problems = lines.flatMap((line, i) => problemsOf(kind, line).map((p) => `Line ${i + 1} ${p}`));
	return problems.length ? { problems } : { lines };
}
