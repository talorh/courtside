import { assertChanged } from "../../shared/d1.ts";

interface NewUpload {
	teamId: string; gameId: number; r2Key: string; r2UploadId: string; originalName: string;
	originalBytes: number; uploadedBy: number; deleteAfter: string; createdAt: string;
}

/** The insert, to batch with other writes (Go live links its recording in the same batch). Fails with a UNIQUE
 * constraint error if the game already has a video that isn't failed or deleted. */
export function insertUploadVideoWrite(db: D1Database, v: NewUpload) {
	return db
		.prepare(`INSERT INTO videos (team_id, game_id, status, r2_key, r2_upload_id, original_name, original_bytes, uploaded_by, delete_after, created_at)
			VALUES (?, ?, 'uploading', ?, ?, ?, ?, ?, ?, ?)`)
		.bind(v.teamId, v.gameId, v.r2Key, v.r2UploadId, v.originalName, v.originalBytes, v.uploadedBy, v.deleteAfter, v.createdAt);
}

export const insertUploadVideo = async (db: D1Database, v: NewUpload): Promise<number> => (await insertUploadVideoWrite(db, v).run()).meta.last_row_id;

/** An external app's stream, recorded by Stream: the video's already there (no original in R2), so it starts at
 * processing. To batch with closing its live stream. Fails (UNIQUE) if the game already has a video. */
export function insertLiveVideoWrite(db: D1Database, v: { teamId: string; gameId: number; streamUid: string; uploadedBy: number | null; deleteAfter: string; createdAt: string }) {
	return db.prepare(`INSERT INTO videos (team_id, game_id, status, stream_uid, original_name, original_bytes, uploaded_by, delete_after, created_at, processing_at)
		VALUES (?, ?, 'processing', ?, 'Live stream', 0, ?, ?, ?, ?)`).bind(v.teamId, v.gameId, v.streamUid, v.uploadedBy, v.deleteAfter, v.createdAt, v.createdAt);
}

async function update(db: D1Database, sql: string, params: unknown[]): Promise<void> {
	assertChanged(await db.prepare(sql).bind(...params).run(), "video");
}

/** R2 multipart finished, processing begins now; Stream copy still to be requested (stream_uid NULL until setStreamUid). */
export const markUploaded = (db: D1Database, teamId: string, id: number, nowIso: string) =>
	update(db, "UPDATE videos SET status = 'processing', processing_at = ?, r2_upload_id = NULL WHERE team_id = ? AND id = ? AND status = 'uploading' AND deleted_at IS NULL", [nowIso, teamId, id]);

/** False if the video already has a copy (asked for twice at once) or is gone. */
export const setStreamUid = async (db: D1Database, teamId: string, id: number, uid: string): Promise<boolean> =>
	(await db.prepare("UPDATE videos SET stream_uid = ? WHERE team_id = ? AND id = ? AND stream_uid IS NULL").bind(uid, teamId, id).run()).meta.changes > 0;

/** Stream no longer has this copy: back to processing with none, so the cron job makes a new one from the original. */
export const dropStreamCopy = (db: D1Database, teamId: string, id: number, uid: string) =>
	update(db, "UPDATE videos SET status = 'processing', stream_uid = NULL WHERE team_id = ? AND id = ? AND stream_uid = ? AND deleted_at IS NULL", [teamId, id, uid]);

export const markReady = (db: D1Database, teamId: string, id: number, durationSeconds: number | null) =>
	update(db, "UPDATE videos SET status = 'ready', duration_seconds = ? WHERE team_id = ? AND id = ? AND status = 'processing'", [durationSeconds, teamId, id]);

export const markFailed = (db: D1Database, teamId: string, id: number, reason: string) =>
	update(db, "UPDATE videos SET status = 'failed', failure_reason = ? WHERE team_id = ? AND id = ?", [reason, teamId, id]);

/** Sent to be repaired (live/repair-service.ts): processing again with no Stream copy, its join bookkeeping fresh,
 * Stream's `reason` kept. Only from the processing copy Stream refused, and only once: true if this ask did it. */
export async function startRepairWrite(db: D1Database, teamId: string, id: number, uid: string, reason: string, nowIso: string): Promise<boolean> {
	return (await db.prepare(`UPDATE videos SET stream_uid = NULL, failure_reason = ?, repair_tried_at = ?, join_tries = 0, join_tried_at = NULL,
		join_failed_at = NULL WHERE team_id = ? AND id = ? AND stream_uid = ? AND status = 'processing' AND deleted_at IS NULL AND repair_tried_at IS NULL`)
		.bind(reason, nowIso, teamId, id, uid).run()).meta.changes > 0;
}

/** A repair given up (live/join-service.ts): failed, true if this ask did it. Only while the video is still on the file
 * Stream refused (`r2Key`): another run that has just finished the repair has moved it on, and it isn't failed. */
export async function markRepairFailed(db: D1Database, teamId: string, id: number, r2Key: string, reason: string): Promise<boolean> {
	return (await db.prepare(`UPDATE videos SET status = 'failed', failure_reason = ? WHERE team_id = ? AND id = ? AND status = 'processing'
		AND stream_uid IS NULL AND repair_tried_at IS NOT NULL AND r2_key = ?`).bind(reason, teamId, id, r2Key).run()).meta.changes > 0;
}

/** Stream refused the copy `uid` the video is processing on: failed, true if this ask did it (another run, or a
 * repair begun, got there first otherwise). */
export async function markCopyFailed(db: D1Database, teamId: string, id: number, uid: string, reason: string): Promise<boolean> {
	return (await db.prepare("UPDATE videos SET status = 'failed', failure_reason = ? WHERE team_id = ? AND id = ? AND stream_uid = ? AND status = 'processing'")
		.bind(reason, teamId, id, uid).run()).meta.changes > 0;
}

/** Fails with a UNIQUE constraint error if the target game already has a video. */
export const moveVideo = (db: D1Database, teamId: string, id: number, gameId: number) =>
	update(db, "UPDATE videos SET game_id = ? WHERE team_id = ? AND id = ? AND deleted_at IS NULL", [gameId, teamId, id]);

/** purgeAfter: when its media goes, if it's being kept for now (see video-removal-service.ts). */
export const softDeleteVideo = (db: D1Database, teamId: string, id: number, nowIso: string, reason: string, purgeAfter: string | null = null) =>
	update(db, "UPDATE videos SET deleted_at = ?, deleted_reason = ?, purge_after = ? WHERE team_id = ? AND id = ? AND deleted_at IS NULL",
		[nowIso, reason, purgeAfter, teamId, id]);

export const markPurged = (db: D1Database, teamId: string, id: number) =>
	update(db, "UPDATE videos SET purge_after = NULL WHERE team_id = ? AND id = ? AND deleted_at IS NOT NULL", [teamId, id]);

export const markHdReady = (db: D1Database, teamId: string, id: number, nowIso: string) =>
	update(db, "UPDATE videos SET hd_ready_at = ? WHERE team_id = ? AND id = ? AND hd_ready_at IS NULL", [nowIso, teamId, id]);

/** Stream couldn't make the HD MP4: the job stops asking about it (processing-service.ts trackHdDownloads). */
export const markHdFailed = (db: D1Database, teamId: string, id: number, nowIso: string) =>
	update(db, "UPDATE videos SET hd_failed_at = ? WHERE team_id = ? AND id = ? AND hd_failed_at IS NULL", [nowIso, teamId, id]);

/** A join begun (the 5-minute job), or one that couldn't be asked for: one more try, now. */
export const countJoinTry = (db: D1Database, teamId: string, id: number, nowIso: string) =>
	update(db, "UPDATE videos SET join_tries = join_tries + 1, join_tried_at = ? WHERE team_id = ? AND id = ?", [nowIso, teamId, id]);

/** Six joins failed: the team manager is asked (Keep the first part). */
export const setJoinFailed = (db: D1Database, teamId: string, id: number, nowIso: string) =>
	update(db, "UPDATE videos SET join_failed_at = ? WHERE team_id = ? AND id = ? AND join_failed_at IS NULL", [nowIso, teamId, id]);
