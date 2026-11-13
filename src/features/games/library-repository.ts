import { COMPETITIONS, type Competition, GAME_COLUMNS, type Game, type GameRow, toGame } from "./games-repository.ts";
import type { VideoStatus } from "../videos/video-status.ts";

export interface LibraryEntry {
	game: Game;
	/** Set only when the game's video is ready to watch. */
	durationSeconds: number | null;
	streamUid: string | null;
	/** The newest video's status, ready or not (null: no video yet). */
	videoStatus: VideoStatus | null;
	/** Ready, added recently by someone else, and this viewer hasn't opened it yet. */
	isNew: boolean;
}

/** Who's looking, and how far back a video still counts as new (see NEW_FOR_DAYS). */
export interface Viewer {
	memberId: number;
	newSinceIso: string;
}

const IS_NEW = `v.id IS NOT NULL AND v.uploaded_by IS NOT ? AND v.created_at >= ?
	AND NOT EXISTS (SELECT 1 FROM video_views w WHERE w.video_id = v.id AND w.member_id = ? AND w.team_id = g.team_id)`;

// The game's newest ready video (one row per game, even if an old ready one was left behind).
const READY = `v.id = (SELECT r.id FROM videos r WHERE r.game_id = g.id AND r.team_id = g.team_id AND r.status = 'ready'
	AND r.deleted_at IS NULL ORDER BY r.id DESC LIMIT 1)`;

/**
 * Every game, oldest first (upcoming ones at the bottom), optionally filtered by competition. Games without a ready
 * video are listed too, so families can see what's coming and what's still to be uploaded.
 */
export async function listLibrary(db: D1Database, teamId: string, competition: Competition | "", viewer: Viewer): Promise<LibraryEntry[]> {
	const { results } = await db
		.prepare(`SELECT ${GAME_COLUMNS}, v.duration_seconds, v.stream_uid, ${IS_NEW} AS is_new,
			(SELECT x.status FROM videos x WHERE x.game_id = g.id AND x.team_id = g.team_id AND x.deleted_at IS NULL ORDER BY x.id DESC LIMIT 1) AS video_status
			FROM games g LEFT JOIN videos v ON ${READY}
			WHERE g.team_id = ? AND g.deleted_at IS NULL AND (? = '' OR g.competition = ?)
			ORDER BY g.starts_at ASC`)
		.bind(viewer.memberId, viewer.newSinceIso, viewer.memberId, teamId, competition, competition)
		.all<GameRow & { duration_seconds: number | null; stream_uid: string | null; video_status: VideoStatus | null; is_new: number }>();
	return results.map((r) => ({
		game: toGame(r), durationSeconds: r.duration_seconds, streamUid: r.stream_uid,
		videoStatus: r.stream_uid ? "ready" : r.video_status, isNew: r.is_new === 1,
	}));
}

/** Competitions that have at least one game (drives the filter chips). */
export async function listLibraryCompetitions(db: D1Database, teamId: string): Promise<Competition[]> {
	// Fixed order (the league, Tournament, Practice match) rather than whatever order the rows come back in.
	const { results } = await db
		.prepare(`SELECT DISTINCT g.competition FROM games g WHERE g.team_id = ? AND g.deleted_at IS NULL`)
		.bind(teamId)
		.all<{ competition: Competition }>();
	const present = new Set(results.map((r) => r.competition));
	return COMPETITIONS.filter((c) => present.has(c));
}
