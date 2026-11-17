// A clip's place, taken before Stream is asked to make it: a clips row with no Stream uid yet, which the clip reads
// (clips-repository.ts) leave out. Taking it checks every limit in the same statement, so overlapping posts can't all
// pass a count read before any of them is saved.

export interface ClipLimits {
	/** Clips a game video can have, being made included. */
	perVideo: number;
	/** Seconds of clips a member, and the team, can make since `since`. */
	memberSeconds: number;
	teamSeconds: number;
	since: string;
	/** Seconds of clips a team keeps, whenever they were made. */
	keptSeconds: number;
}

export interface NewClip { videoId: number; label: string; startSeconds: number; endSeconds: number; createdBy: number; createdAt: string }

// The seconds of the clips people made since a time, deleted ones too (they were made); an app stream's parts aren't.
const MADE = "SELECT COALESCE(SUM(end_seconds - start_seconds), 0) FROM clips WHERE team_id = ?1 AND part = 0 AND created_at > ?9";
// The seconds of the clips a team keeps in Stream: places being made too, not deleted or failed ones, nor a deleted video's.
const KEPT = `SELECT COALESCE(SUM(c.end_seconds - c.start_seconds), 0) AS s FROM clips c WHERE c.team_id = ?1 AND c.part = 0
	AND c.deleted_at IS NULL AND c.status <> 'failed'
	AND EXISTS (SELECT 1 FROM videos v WHERE v.team_id = ?1 AND v.id = c.video_id AND v.deleted_at IS NULL)`;

/** The new clip's id, or null when it would pass a limit. */
export async function reserveClip(db: D1Database, teamId: string, c: NewClip, limits: ClipLimits): Promise<number | null> {
	return db.prepare(`INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, created_by, created_at)
		SELECT ?1, ?2, ?3, ?4, ?5, 'processing', ?6, ?7
		WHERE (SELECT COUNT(*) FROM clips WHERE team_id = ?1 AND video_id = ?2 AND deleted_at IS NULL) < ?8
			AND (${MADE} AND created_by = ?6) + ?5 - ?4 <= ?10
			AND (${MADE}) + ?5 - ?4 <= ?11
			AND (${KEPT}) + ?5 - ?4 <= ?12
		RETURNING id`)
		.bind(teamId, c.videoId, c.label, c.startSeconds, c.endSeconds, c.createdBy, c.createdAt, limits.perVideo, limits.since, limits.memberSeconds,
			limits.teamSeconds, limits.keptSeconds)
		.first<number>("id");
}

export const countVideoClips = (db: D1Database, teamId: string, videoId: number) => db
	.prepare("SELECT COUNT(*) AS n FROM clips WHERE team_id = ? AND video_id = ? AND deleted_at IS NULL").bind(teamId, videoId).first<number>("n")
	.then((n) => n ?? 0);

export const keptClipSeconds = (db: D1Database, teamId: string) => db.prepare(KEPT).bind(teamId).first<number>("s").then((n) => n ?? 0);

/** The clips people made since `since`, oldest first: to say when a limit frees up. */
export async function clipsMadeSince(db: D1Database, teamId: string, since: string): Promise<Array<{ createdBy: number | null; seconds: number; createdAt: string }>> {
	const { results } = await db.prepare(`SELECT created_by AS createdBy, end_seconds - start_seconds AS seconds, created_at AS createdAt FROM clips
		WHERE team_id = ? AND part = 0 AND created_at > ? ORDER BY created_at, id`).bind(teamId, since)
		.all<{ createdBy: number | null; seconds: number; createdAt: string }>();
	return results;
}

/** The clip Stream made, and who's in it, in one batch. False when its place has gone meanwhile. */
export async function fillClip(db: D1Database, teamId: string, id: number, streamUid: string, playerIds: number[]): Promise<boolean> {
	const [filled] = await db.batch([
		db.prepare("UPDATE clips SET stream_uid = ? WHERE team_id = ? AND id = ? AND stream_uid IS NULL AND deleted_at IS NULL").bind(streamUid, teamId, id),
		...playerIds.map((player) => db.prepare(`INSERT INTO clip_players (team_id, clip_id, player_id)
			SELECT team_id, id, ? FROM clips WHERE team_id = ? AND id = ? AND stream_uid = ?`).bind(player, teamId, id, streamUid)),
	]);
	return filled!.meta.changes === 1;
}

/** A place Stream never made a clip for. */
export const dropReservedClip = (db: D1Database, teamId: string, id: number) => db
	.prepare("DELETE FROM clips WHERE team_id = ? AND id = ? AND stream_uid IS NULL").bind(teamId, id).run();

/** Places taken before `before` that were never filled: the Worker stopped between taking one and saving the clip. */
export const dropStaleReservedClips = (db: D1Database, teamId: string, before: string) => db
	.prepare("DELETE FROM clips WHERE team_id = ? AND stream_uid IS NULL AND deleted_at IS NULL AND status = 'processing' AND created_at < ?")
	.bind(teamId, before).run();
