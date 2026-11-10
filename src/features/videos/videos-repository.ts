import type { VideoStatus } from "./video-status.ts";

export interface Video {
	id: number;
	teamId: string;
	gameId: number;
	status: VideoStatus;
	streamUid: string | null;
	r2Key: string | null;
	r2UploadId: string | null;
	originalName: string | null;
	originalBytes: number | null;
	durationSeconds: number | null;
	failureReason: string | null;
	uploadedBy: number | null;
	deleteAfter: string;
	createdAt: string;
	/** When the downloadable HD MP4 finished; null while Stream is still making it. */
	hdReadyAt: string | null;
	/** A carried-on recording's join (live/join-service.ts): tries so far, the last one, and when six had failed. */
	joinTries: number;
	joinTriedAt: string | null;
	joinFailedAt: string | null;
}

interface VideoRow {
	id: number; team_id: string; game_id: number; status: VideoStatus; stream_uid: string | null; r2_key: string | null;
	r2_upload_id: string | null; original_name: string | null; original_bytes: number | null; duration_seconds: number | null;
	failure_reason: string | null; uploaded_by: number | null; delete_after: string; created_at: string; hd_ready_at: string | null;
	join_tries: number; join_tried_at: string | null; join_failed_at: string | null;
}

const COLUMNS = `id, team_id, game_id, status, stream_uid, r2_key, r2_upload_id, original_name, original_bytes,
	duration_seconds, failure_reason, uploaded_by, delete_after, created_at, hd_ready_at, join_tries, join_tried_at, join_failed_at`;
const ACTIVE = "team_id = ? AND deleted_at IS NULL";

const toVideo = (r: VideoRow): Video => ({
	id: r.id, teamId: r.team_id, gameId: r.game_id, status: r.status, streamUid: r.stream_uid, r2Key: r.r2_key,
	r2UploadId: r.r2_upload_id, originalName: r.original_name, originalBytes: r.original_bytes,
	durationSeconds: r.duration_seconds, failureReason: r.failure_reason, uploadedBy: r.uploaded_by,
	deleteAfter: r.delete_after, createdAt: r.created_at, hdReadyAt: r.hd_ready_at,
	joinTries: r.join_tries, joinTriedAt: r.join_tried_at, joinFailedAt: r.join_failed_at,
});

async function one(db: D1Database, where: string, ...params: unknown[]): Promise<Video | null> {
	const row = await db.prepare(`SELECT ${COLUMNS} FROM videos WHERE ${where} LIMIT 1`).bind(...params).first<VideoRow>();
	return row ? toVideo(row) : null;
}

async function many(db: D1Database, where: string, ...params: unknown[]): Promise<Video[]> {
	const { results } = await db.prepare(`SELECT ${COLUMNS} FROM videos WHERE ${where}`).bind(...params).all<VideoRow>();
	return results.map(toVideo);
}

export const getVideo = (db: D1Database, teamId: string, id: number) => one(db, `${ACTIVE} AND id = ?`, teamId, id);

/** The game's current video in any status (newest first, so a re-upload supersedes a failed attempt). */
export const getActiveVideoForGame = (db: D1Database, teamId: string, gameId: number) =>
	one(db, `${ACTIVE} AND game_id = ? ORDER BY id DESC`, teamId, gameId);

export const listVideosByStatus = (db: D1Database, teamId: string, status: VideoStatus) =>
	many(db, `${ACTIVE} AND status = ? ORDER BY id`, teamId, status);

export const listExpiredVideos = (db: D1Database, teamId: string, nowIso: string) =>
	many(db, `${ACTIVE} AND delete_after <= ? ORDER BY id`, teamId, nowIso);

/** Deleted videos whose media was kept a day in case of a mistake, and that day is up. */
export const listVideosToPurge = (db: D1Database, teamId: string, nowIso: string) =>
	many(db, "team_id = ? AND deleted_at IS NOT NULL AND purge_after <= ? ORDER BY id", teamId, nowIso);

/** Every not-yet-deleted video of a game, in any status (for deleting the game with its footage). */
export const listVideosForGame = (db: D1Database, teamId: string, gameId: number) =>
	many(db, `${ACTIVE} AND game_id = ? ORDER BY id`, teamId, gameId);

/** Ready videos whose HD MP4 isn't confirmed yet (the cron job checks on them). */
export const listVideosAwaitingHd = (db: D1Database, teamId: string) =>
	many(db, `${ACTIVE} AND status = 'ready' AND stream_uid IS NOT NULL AND hd_ready_at IS NULL ORDER BY id`, teamId);
