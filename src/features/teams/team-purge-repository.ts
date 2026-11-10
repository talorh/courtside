// Deleting a team: what the purge (jobs/delete-teams.ts) still has to delete from
// Images, Stream and R2, and then the team's rows, child-first, so no row is ever left pointing at one that's gone. The
// download log (kept two years) keeps the videos, games and people it names until it no longer names them; then the
// team's own row goes.
import { markTeamDeleted } from "./teams-repository.ts";

export interface StreamCopy { kind: "video" | "clip"; id: number; uid: string }

/** Photos whose image is still in Images (a deleted photo's has gone already). */
export async function photosLeft(db: D1Database, teamId: string, limit: number): Promise<Array<{ id: number; imageId: string }>> {
	const { results } = await db.prepare("SELECT id, image_id AS imageId FROM photos WHERE team_id = ? AND deleted_at IS NULL ORDER BY id LIMIT ?")
		.bind(teamId, limit).all<{ id: number; imageId: string }>();
	return results;
}

/** Stream copies the team's videos and clips still have, deleted ones' too. */
export async function streamCopiesLeft(db: D1Database, teamId: string, limit: number): Promise<StreamCopy[]> {
	const { results } = await db.prepare(`SELECT 'clip' AS kind, id, stream_uid AS uid FROM clips WHERE team_id = ? AND stream_uid IS NOT NULL
		UNION ALL SELECT 'video', id, stream_uid FROM videos WHERE team_id = ? AND stream_uid IS NOT NULL ORDER BY kind, id LIMIT ?`)
		.bind(teamId, teamId, limit).all<StreamCopy>();
	return results;
}

export const forgetStreamCopy = (db: D1Database, teamId: string, copy: StreamCopy) => db
	.prepare(`UPDATE ${copy.kind === "clip" ? "clips" : "videos"} SET stream_uid = NULL WHERE team_id = ? AND id = ? AND stream_uid = ?`)
	.bind(teamId, copy.id, copy.uid).run();

/** Originals (or unfinished uploads) the team's videos still have in R2. */
export async function originalsLeft(db: D1Database, teamId: string, limit: number): Promise<Array<{ id: number; r2Key: string; r2UploadId: string | null }>> {
	const { results } = await db.prepare("SELECT id, r2_key AS r2Key, r2_upload_id AS r2UploadId FROM videos WHERE team_id = ? AND r2_key IS NOT NULL ORDER BY id LIMIT ?")
		.bind(teamId, limit).all<{ id: number; r2Key: string; r2UploadId: string | null }>();
	return results;
}

export const forgetOriginal = (db: D1Database, teamId: string, id: number) => db
	.prepare("UPDATE videos SET r2_key = NULL, r2_upload_id = NULL WHERE team_id = ? AND id = ?").bind(teamId, id).run();

// Each after everything that points at it: clip players before clips and players, requests before what they're about,
// roster weeks and duties before families, and so on.
const CHILD_ROWS = [
	"clip_players", "favourites", "video_views", "coach_notes", "game_scores", "removal_requests", "clip_removal_requests", "photo_removal_requests",
	"recording_segments", "clips", "live_streams", "activity", "ask_counts", "roster_slots", "roster_weeks", "roster_duties", "roster_families", "players", "playhq_fixtures", "photos",
	"support_messages", "support_requests", "game_lines", "problems",
];

/** What the download log no longer names: its videos, then their games, then the people none of those name. */
const leftovers = (db: D1Database, teamId: string) => [
	db.prepare("DELETE FROM videos WHERE team_id = ? AND NOT EXISTS (SELECT 1 FROM downloads d WHERE d.team_id = videos.team_id AND d.video_id = videos.id)").bind(teamId),
	db.prepare("DELETE FROM games WHERE team_id = ? AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.team_id = games.team_id AND v.game_id = games.id)").bind(teamId),
	db.prepare(`DELETE FROM members WHERE team_id = ? AND NOT EXISTS (SELECT 1 FROM downloads d WHERE d.team_id = members.team_id AND d.member_id = members.id)
		AND NOT EXISTS (SELECT 1 FROM media_downloads md WHERE md.team_id = members.team_id AND md.member_id = members.id)
		AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.team_id = members.team_id AND v.uploaded_by = members.id)
		AND NOT EXISTS (SELECT 1 FROM games g WHERE g.team_id = members.team_id AND g.created_by = members.id)`).bind(teamId),
];

/** A deleted team with nothing left but its row: no download log, nor the videos, games and people it named. */
const NOTHING_LEFT = `EXISTS (SELECT 1 FROM teams WHERE id = ?1 AND status = 'deleted') AND NOT EXISTS (SELECT 1 FROM downloads WHERE team_id = ?1)
	AND NOT EXISTS (SELECT 1 FROM media_downloads WHERE team_id = ?1)
	AND NOT EXISTS (SELECT 1 FROM videos WHERE team_id = ?1) AND NOT EXISTS (SELECT 1 FROM games WHERE team_id = ?1)
	AND NOT EXISTS (SELECT 1 FROM members WHERE team_id = ?1)`;

/**
 * A deleted team, every day: what its download log (purged after two years) no longer names goes. Then, once nothing is
 * left, its row too, so its id is free for a new team: its admin log lines keep its name, and Costs' figures for it go.
 * True once the row's gone.
 */
export async function deleteLeftovers(db: D1Database, teamId: string): Promise<boolean> {
	const results = await db.batch([
		...leftovers(db, teamId),
		db.prepare(`UPDATE admin_log SET team_code = (SELECT code FROM teams WHERE id = ?1), team_season = (SELECT season_start FROM teams WHERE id = ?1),
			team_id = NULL WHERE team_id = ?1 AND ${NOTHING_LEFT}`).bind(teamId),
		db.prepare(`DELETE FROM cost_views WHERE team_id = ?1 AND ${NOTHING_LEFT}`).bind(teamId),
		db.prepare(`DELETE FROM teams WHERE id = ?1 AND ${NOTHING_LEFT}`).bind(teamId),
	]);
	return (results.at(-1)?.meta.changes ?? 0) > 0;
}

export interface DeletedRows { photos: number; clips: number; videos: number; games: number; people: number; kept: { videos: number; games: number; people: number } }

/** Every row of the team's but the download log's (its videos and games marked deleted, its people removed), and the
 * team marked deleted, all in one batch: all or nothing. Its media must be gone first. */
export async function deleteTeamRows(db: D1Database, teamId: string, nowIso: string): Promise<DeletedRows> {
	const results = await db.batch([
		...CHILD_ROWS.map((table) => db.prepare(`DELETE FROM ${table} WHERE team_id = ?`).bind(teamId)),
		...leftovers(db, teamId),
		db.prepare("UPDATE videos SET deleted_at = COALESCE(deleted_at, ?), deleted_reason = COALESCE(deleted_reason, 'retention'), purge_after = NULL WHERE team_id = ?").bind(nowIso, teamId),
		db.prepare("UPDATE games SET deleted_at = COALESCE(deleted_at, ?) WHERE team_id = ?").bind(nowIso, teamId),
		db.prepare("UPDATE members SET removed_at = COALESCE(removed_at, ?) WHERE team_id = ?").bind(nowIso, teamId),
		markTeamDeleted(db, teamId, nowIso),
		db.prepare(`SELECT (SELECT COUNT(*) FROM videos WHERE team_id = ?1) AS videos, (SELECT COUNT(*) FROM games WHERE team_id = ?1) AS games,
			(SELECT COUNT(*) FROM members WHERE team_id = ?1) AS people`).bind(teamId),
	]);
	const changed = (i: number) => results[i]?.meta.changes ?? 0;
	const kept = (results.at(-1)?.results?.[0] ?? { videos: 0, games: 0, people: 0 }) as DeletedRows["kept"];
	const at = CHILD_ROWS.length;
	return { photos: changed(CHILD_ROWS.indexOf("photos")), clips: changed(CHILD_ROWS.indexOf("clips")), videos: changed(at), games: changed(at + 1), people: changed(at + 2), kept };
}
