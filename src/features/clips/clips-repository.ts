export type ClipStatus = "processing" | "ready" | "failed";

export interface Clip {
	id: number;
	videoId: number;
	label: string;
	startSeconds: number;
	endSeconds: number;
	status: ClipStatus;
	streamUid: string | null;
	createdBy: number | null;
}

interface ClipRow {
	id: number; video_id: number; label: string; start_seconds: number; end_seconds: number; status: ClipStatus;
	stream_uid: string | null; created_by: number | null;
}

const COLUMNS = "id, video_id, label, start_seconds, end_seconds, status, stream_uid, created_by";
// A clip whose place is taken but Stream hasn't made it yet has no Stream uid (clip-limits-repository.ts): not one yet.
const ACTIVE = "team_id = ? AND deleted_at IS NULL AND stream_uid IS NOT NULL";

const toClip = (r: ClipRow): Clip => ({
	id: r.id, videoId: r.video_id, label: r.label, startSeconds: r.start_seconds, endSeconds: r.end_seconds,
	status: r.status, streamUid: r.stream_uid, createdBy: r.created_by,
});

async function many(db: D1Database, where: string, ...params: unknown[]): Promise<Clip[]> {
	const { results } = await db.prepare(`SELECT ${COLUMNS} FROM clips WHERE ${where}`).bind(...params).all<ClipRow>();
	return results.map(toClip);
}

/** A clip that can still be watched, downloaded or changed: not one whose video was deleted (it goes with the video's media). */
export async function getClip(db: D1Database, teamId: string, id: number): Promise<Clip | null> {
	const row = await db.prepare(`SELECT ${COLUMNS} FROM clips WHERE ${ACTIVE} AND id = ?
		AND EXISTS (SELECT 1 FROM videos v WHERE v.team_id = clips.team_id AND v.id = clips.video_id AND v.deleted_at IS NULL)`).bind(teamId, id).first<ClipRow>();
	return row ? toClip(row) : null;
}

export const listClipsForVideo = (db: D1Database, teamId: string, videoId: number) =>
	many(db, `${ACTIVE} AND video_id = ? ORDER BY start_seconds, id`, teamId, videoId);

/** Clips Stream is still making, and places taken for clips Stream hasn't made yet (with when each was taken), in one read. */
export async function listProcessing(db: D1Database, teamId: string): Promise<{ clips: Clip[]; places: Array<{ id: number; createdAt: string }> }> {
	const { results } = await db.prepare(`SELECT ${COLUMNS}, created_at FROM clips WHERE team_id = ? AND deleted_at IS NULL AND status = 'processing' ORDER BY id`)
		.bind(teamId).all<ClipRow & { created_at: string }>();
	return {
		clips: results.filter((r) => r.stream_uid !== null).map(toClip),
		places: results.filter((r) => r.stream_uid === null).map((r) => ({ id: r.id, createdAt: r.created_at })),
	};
}

/** Another part of an external app's stream (it restarted after a long gap), already a Stream video: a clip of the game
 * video whose own Stream video is `videoStreamUid`. To batch with that video's insert. */
export function insertPartClipWrite(db: D1Database, teamId: string, c: { videoStreamUid: string; label: string; endSeconds: number; streamUid: string; createdBy: number | null }) {
	return db.prepare(`INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, stream_uid, created_by, part)
		SELECT v.team_id, v.id, ?, 0, ?, 'processing', ?, ?, 1 FROM videos v WHERE v.team_id = ? AND v.stream_uid = ? AND v.deleted_at IS NULL`)
		.bind(c.label, c.endSeconds, c.streamUid, c.createdBy, teamId, c.videoStreamUid);
}

export async function setClipStatus(db: D1Database, teamId: string, id: number, status: ClipStatus, reason: string | null = null): Promise<void> {
	await db.prepare("UPDATE clips SET status = ?, failure_reason = ? WHERE team_id = ? AND id = ?").bind(status, reason, teamId, id).run();
}

/** To batch with closing its removal requests (clips-service.ts deleteClip). */
export const softDeleteClipWrite = (db: D1Database, teamId: string, id: number, nowIso: string) => db
	.prepare("UPDATE clips SET deleted_at = ? WHERE team_id = ? AND id = ? AND deleted_at IS NULL").bind(nowIso, teamId, id);
