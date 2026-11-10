// What the end-of-season pack lists (Manage team): every game with a ready video, oldest first, every ready clip with its
// game (oldest first), and how many photos there are.
import { GAME_COLUMNS, type Game, type GameRow, toGame } from "../games/games-repository.ts";

export interface PackGame { game: Game; videoId: number; streamUid: string; durationSeconds: number | null }
export interface PackClip { id: number; label: string; game: Game }

export async function packGames(db: D1Database, teamId: string): Promise<PackGame[]> {
	const { results } = await db.prepare(`SELECT ${GAME_COLUMNS}, v.id AS video_id, v.stream_uid, v.duration_seconds FROM games g
		JOIN videos v ON v.id = (SELECT r.id FROM videos r WHERE r.game_id = g.id AND r.team_id = g.team_id AND r.status = 'ready'
			AND r.deleted_at IS NULL AND r.stream_uid IS NOT NULL ORDER BY r.id DESC LIMIT 1)
		WHERE g.team_id = ? AND g.deleted_at IS NULL ORDER BY g.starts_at ASC`)
		.bind(teamId).all<GameRow & { video_id: number; stream_uid: string; duration_seconds: number | null }>();
	return results.map((r) => ({ game: toGame(r), videoId: r.video_id, streamUid: r.stream_uid, durationSeconds: r.duration_seconds }));
}

/** Ready clips of videos still on the site (a clip goes with its video). */
export async function packClips(db: D1Database, teamId: string): Promise<PackClip[]> {
	const { results } = await db.prepare(`SELECT ${GAME_COLUMNS}, c.id AS clip_id, c.label FROM clips c
		JOIN videos v ON v.id = c.video_id AND v.team_id = c.team_id AND v.deleted_at IS NULL
		JOIN games g ON g.id = v.game_id AND g.team_id = c.team_id AND g.deleted_at IS NULL
		WHERE c.team_id = ? AND c.deleted_at IS NULL AND c.status = 'ready' AND c.stream_uid IS NOT NULL ORDER BY g.starts_at ASC, c.start_seconds ASC`)
		.bind(teamId).all<GameRow & { clip_id: number; label: string }>();
	return results.map((r) => ({ id: r.clip_id, label: r.label, game: toGame(r) }));
}

export const countPhotos = (db: D1Database, teamId: string) =>
	db.prepare("SELECT COUNT(*) AS n FROM photos WHERE team_id = ? AND deleted_at IS NULL").bind(teamId).first<number>("n").then((n) => n ?? 0);
