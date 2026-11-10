// Rows deleted long ago that nothing kept names any more (tombstones-service.ts): the reads that find them, each
// leaving out a row the download log, a removal request or a favourite still names, and the deletes to batch, child
// first. Every statement names its team.

/** Videos deleted before `beforeIso` whose media is purged, that no download or removal request names, and none of
 * whose clips a removal request or a favourite names. */
const VIDEOS = `SELECT v.id FROM videos v
	WHERE v.team_id = ?1 AND v.deleted_at IS NOT NULL AND v.deleted_at < ?2 AND v.purge_after IS NULL
	AND NOT EXISTS (SELECT 1 FROM downloads d WHERE d.team_id = v.team_id AND d.video_id = v.id)
	AND NOT EXISTS (SELECT 1 FROM removal_requests r WHERE r.team_id = v.team_id AND r.video_id = v.id)
	AND NOT EXISTS (SELECT 1 FROM clips c WHERE c.team_id = v.team_id AND c.video_id = v.id
		AND (EXISTS (SELECT 1 FROM clip_removal_requests cr WHERE cr.team_id = c.team_id AND cr.clip_id = c.id)
			OR EXISTS (SELECT 1 FROM favourites f WHERE f.team_id = c.team_id AND f.clip_id = c.id)))
	ORDER BY v.id`;

/** The video, its views, its clips and their players; a closed stream it was the recording of forgets it. */
export const videoTombstoneWrites = (db: D1Database, teamId: string, id: number) => [
	db.prepare("DELETE FROM video_views WHERE team_id = ? AND video_id = ?").bind(teamId, id),
	db.prepare("DELETE FROM clip_players WHERE team_id = ? AND clip_id IN (SELECT id FROM clips WHERE team_id = ? AND video_id = ?)").bind(teamId, teamId, id),
	db.prepare("DELETE FROM clips WHERE team_id = ? AND video_id = ?").bind(teamId, id),
	db.prepare("UPDATE live_streams SET recording_video_id = NULL WHERE team_id = ? AND recording_video_id = ? AND status <> 'open'").bind(teamId, id),
	db.prepare("DELETE FROM recording_segments WHERE team_id = ? AND video_id = ?").bind(teamId, id),
	db.prepare("DELETE FROM videos WHERE team_id = ? AND id = ? AND deleted_at IS NOT NULL").bind(teamId, id),
];

/** Clips deleted before `beforeIso` from a video still on the site (a deleted video's clips go with the video) that no
 * removal request or favourite names. */
const CLIPS = `SELECT c.id FROM clips c
	WHERE c.team_id = ?1 AND c.deleted_at IS NOT NULL AND c.deleted_at < ?2
	AND EXISTS (SELECT 1 FROM videos v WHERE v.team_id = c.team_id AND v.id = c.video_id AND v.deleted_at IS NULL)
	AND NOT EXISTS (SELECT 1 FROM clip_removal_requests cr WHERE cr.team_id = c.team_id AND cr.clip_id = c.id)
	AND NOT EXISTS (SELECT 1 FROM favourites f WHERE f.team_id = c.team_id AND f.clip_id = c.id)
	ORDER BY c.id`;

export const clipTombstoneWrites = (db: D1Database, teamId: string, id: number) => [
	db.prepare("DELETE FROM clip_players WHERE team_id = ? AND clip_id = ?").bind(teamId, id),
	db.prepare("DELETE FROM clips WHERE team_id = ? AND id = ? AND deleted_at IS NOT NULL").bind(teamId, id),
];

/** Games deleted before `beforeIso` with no video rows left (a kept video keeps its game). */
const GAMES = `SELECT g.id FROM games g
	WHERE g.team_id = ?1 AND g.deleted_at IS NOT NULL AND g.deleted_at < ?2
	AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.team_id = g.team_id AND v.game_id = g.id)
	ORDER BY g.id`;

/** The game, its score, its coaches' notes, its favourites and its closed streams (a deleted game has no open one). */
export const gameTombstoneWrites = (db: D1Database, teamId: string, id: number) => [
	db.prepare("DELETE FROM coach_notes WHERE team_id = ? AND game_id = ?").bind(teamId, id),
	db.prepare("DELETE FROM game_scores WHERE team_id = ? AND game_id = ?").bind(teamId, id),
	db.prepare("DELETE FROM favourites WHERE team_id = ? AND game_id = ?").bind(teamId, id),
	db.prepare("DELETE FROM live_streams WHERE team_id = ? AND game_id = ? AND status <> 'open'").bind(teamId, id),
	db.prepare("DELETE FROM games WHERE team_id = ? AND id = ? AND deleted_at IS NOT NULL").bind(teamId, id),
];

/** Photos deleted before `beforeIso` (their image long gone) that no removal request names. */
const PHOTOS = `SELECT p.id FROM photos p
	WHERE p.team_id = ?1 AND p.deleted_at IS NOT NULL AND p.deleted_at < ?2
	AND NOT EXISTS (SELECT 1 FROM photo_removal_requests pr WHERE pr.team_id = p.team_id AND pr.photo_id = p.id)
	ORDER BY p.id`;

export const photoTombstoneWrites = (db: D1Database, teamId: string, id: number) => [
	db.prepare("DELETE FROM photos WHERE team_id = ? AND id = ? AND deleted_at IS NOT NULL").bind(teamId, id),
];

export type TombstoneKind = "video" | "clip" | "game" | "photo";

/** Every kind's tombstones in one trip, `batch` of each (`photoBatch` photos): the video, clip, game and photo rules
 * above, each with its own limit. ?1 the team, ?2 the deletion cutoff. */
export async function listTombstones(db: D1Database, teamId: string, beforeIso: string, batch: number, photoBatch: number): Promise<Array<{ kind: TombstoneKind; id: number }>> {
	const sql = `SELECT 'video' AS kind, id FROM (${VIDEOS} LIMIT ?3) UNION ALL SELECT 'clip', id FROM (${CLIPS} LIMIT ?3)
		UNION ALL SELECT 'game', id FROM (${GAMES} LIMIT ?3) UNION ALL SELECT 'photo', id FROM (${PHOTOS} LIMIT ?4)`;
	return (await db.prepare(sql).bind(teamId, beforeIso, batch, photoBatch).all<{ kind: TombstoneKind; id: number }>()).results;
}
