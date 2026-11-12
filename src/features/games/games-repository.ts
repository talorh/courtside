import { CLUB } from "../../club.ts";
import { assertChanged } from "../../shared/d1.ts";
import { BACK_TO_VIDEO } from "./no-video-repository.ts";
import type { VideoStatus } from "../videos/video-status.ts";
import type { SeasonPhase } from "./season-phase.ts";

// Game footage only (no training sessions).
/** The club's league (club.ts) first, then the other kinds of game. */
export const COMPETITIONS = [CLUB.league, "Tournament", "Practice match"] as [string, ...string[]];
export type Competition = string;

export interface GameInput {
	startsAt: string;
	competition: Competition;
	roundLabel: string;
	opponent: string;
	venue: string;
	/** The league season's phase (season-phase.ts): never kept for another competition. */
	phase?: SeasonPhase | null;
}

export interface Game extends GameInput {
	id: number;
	teamId: string;
	phase: SeasonPhase | null;
	/** Video set to No video on the Fixture (it won't be, or wasn't, filmed, or the footage was lost): no upload or Go live. */
	noVideo: boolean;
	/** Imported from a PlayHQ fixture that no longer lists it (e.g. a grading game). Kept; an admin decides. */
	playhqGone: boolean;
	/** Brought in from PlayHQ: its checks keep it up to date, replacing hand edits. */
	fromPlayhq: boolean;
	/** Live streamed from Go live (the default), or recorded and uploaded after: set on the Fixture. */
	liveStream: boolean;
}

export interface GameRow {
	id: number;
	team_id: string;
	starts_at: string;
	competition: Competition;
	round_label: string;
	opponent: string;
	venue: string;
	phase: SeasonPhase | null;
	no_video_at: string | null;
	playhq_gone_at: string | null;
	playhq_game_id: string | null;
	live_stream: number;
}

export const GAME_COLUMNS = "g.id, g.team_id, g.starts_at, g.competition, g.round_label, g.opponent, g.venue, g.phase, g.no_video_at, g.playhq_gone_at, g.playhq_game_id, g.live_stream";

export const toGame = (r: GameRow): Game => ({
	id: r.id, teamId: r.team_id, startsAt: r.starts_at, competition: r.competition, roundLabel: r.round_label,
	opponent: r.opponent, venue: r.venue, phase: r.phase, noVideo: r.no_video_at !== null, playhqGone: r.playhq_gone_at !== null,
	fromPlayhq: r.playhq_game_id !== null, liveStream: r.live_stream !== 0,
});

export async function getGame(db: D1Database, teamId: string, id: number): Promise<Game | null> {
	const row = await db
		.prepare(`SELECT ${GAME_COLUMNS} FROM games g WHERE g.team_id = ? AND g.id = ? AND g.deleted_at IS NULL`)
		.bind(teamId, id)
		.first<GameRow>();
	return row ? toGame(row) : null;
}

export interface GameWithVideo {
	game: Game;
	videoStatus: VideoStatus | null;
}

/** Every game, newest first, with the status of its current video (null = no video). */
export async function listGamesWithVideoStatus(db: D1Database, teamId: string): Promise<GameWithVideo[]> {
	const { results } = await db
		.prepare(`SELECT ${GAME_COLUMNS},
			(SELECT v.status FROM videos v WHERE v.game_id = g.id AND v.team_id = g.team_id AND v.deleted_at IS NULL ORDER BY v.id DESC LIMIT 1) AS video_status
			FROM games g WHERE g.team_id = ? AND g.deleted_at IS NULL ORDER BY g.starts_at DESC`)
		.bind(teamId)
		.all<GameRow & { video_status: VideoStatus | null }>();
	return results.map((r) => ({ game: toGame(r), videoStatus: r.video_status }));
}

/** Whether the team has a game (one not deleted): its code and season are settled then (the admin area's Edit). */
export async function hasGames(db: D1Database, teamId: string): Promise<boolean> {
	return (await db.prepare("SELECT 1 AS one FROM games WHERE team_id = ? AND deleted_at IS NULL LIMIT 1").bind(teamId).first("one")) !== null;
}

export async function countActiveVideosForGame(db: D1Database, teamId: string, gameId: number): Promise<number> {
	const n = await db
		.prepare("SELECT COUNT(*) AS n FROM videos WHERE team_id = ? AND game_id = ? AND deleted_at IS NULL")
		.bind(teamId, gameId)
		.first<number>("n");
	return n ?? 0;
}

/** A season's phase is the league's alone: another competition's game never keeps one. */
export const phaseFor = (input: GameInput): SeasonPhase | null => (input.competition === CLUB.league ? input.phase ?? null : null);

/** `noVideoAt`: added already marked No video (an import from a fixture that doesn't allow filming). `liveStream`:
 * false for a game to be recorded and uploaded after. */
export function createGameWrite(db: D1Database, teamId: string, input: GameInput, createdBy: number, noVideoAt: string | null = null, liveStream = true) {
	return db
		.prepare(`INSERT INTO games (team_id, starts_at, competition, round_label, opponent, venue, phase, created_by, no_video_at, live_stream)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		.bind(teamId, input.startsAt, input.competition, input.roundLabel, input.opponent, input.venue, phaseFor(input), createdBy, noVideoAt, liveStream ? 1 : 0);
}

export async function createGame(db: D1Database, teamId: string, input: GameInput, createdBy: number, noVideoAt: string | null = null, liveStream = true): Promise<number> {
	return (await createGameWrite(db, teamId, input, createdBy, noVideoAt, liveStream).run()).meta.last_row_id;
}

/** `liveStream` null leaves it as it is (a No video game). `noVideoAt`: No video since then (an earlier time is kept), or
 * null for Video (back to it at `nowIso`). */
export async function updateGame(db: D1Database, teamId: string, id: number, input: GameInput, liveStream: boolean | null, noVideoAt: string | null, nowIso: string): Promise<void> {
	const video = noVideoAt === null ? BACK_TO_VIDEO : "no_video_at = COALESCE(no_video_at, ?1)";
	const result = await db
		.prepare(`UPDATE games SET starts_at = ?3, competition = ?4, round_label = ?5, opponent = ?6, venue = ?7, live_stream = COALESCE(?8, live_stream),
			phase = ?11, ${video} WHERE team_id = ?9 AND id = ?10 AND deleted_at IS NULL`)
		.bind(noVideoAt, nowIso, input.startsAt, input.competition, input.roundLabel, input.opponent, input.venue, liveStream === null ? null : liveStream ? 1 : 0, teamId, id, phaseFor(input))
		.run();
	assertChanged(result, "game");
}

/** Deletes the game and its coaches' notes together. */
export async function softDeleteGame(db: D1Database, teamId: string, id: number, nowIso: string): Promise<void> {
	const [, game] = await db.batch([
		db.prepare("UPDATE coach_notes SET deleted_at = ? WHERE team_id = ? AND game_id = ? AND deleted_at IS NULL").bind(nowIso, teamId, id),
		db.prepare("UPDATE games SET deleted_at = ? WHERE team_id = ? AND id = ? AND deleted_at IS NULL").bind(nowIso, teamId, id),
	]);
	assertChanged(game!, "game");
}

