import type { LiveSource } from "./live-repository.ts";

/**
 * Sets how an open stream is streamed, while nothing has streamed to it: not stopped, no phone's recording, never seen
 * live. Its day before it counts as unused, and an app stream's recordings, count from now. True if it changed.
 */
export async function setSource(db: D1Database, teamId: string, id: number, source: LiveSource, startedBy: number, nowIso: string): Promise<boolean> {
	const r = await db.prepare(`UPDATE live_streams SET source = ?, started_by = ?, created_at = ? WHERE team_id = ? AND id = ? AND status = 'open'
		AND end_requested_at IS NULL AND recording_video_id IS NULL AND last_live_at IS NULL`).bind(source, startedBy, nowIso, teamId, id).run();
	return r.meta.changes > 0;
}

/** The first time an app's stream is seen arriving. True only for whoever notes it first (the page's check or the job). */
export async function noteFirstLive(db: D1Database, teamId: string, id: number, nowIso: string): Promise<boolean> {
	const r = await db.prepare("UPDATE live_streams SET last_live_at = ? WHERE team_id = ? AND id = ? AND status = 'open' AND last_live_at IS NULL")
		.bind(nowIso, teamId, id).run();
	return r.meta.changes > 0;
}

/** An app stream saved: closed, pointing at the game video made from its recording (the one whose Stream video is
 * `streamUid`), as a camera stream points at its phone's recording. To batch with that video's insert. */
export function saveAppLiveWrite(db: D1Database, teamId: string, id: number, streamUid: string, nowIso: string) {
	return db.prepare(`UPDATE live_streams SET status = 'saved', finished_at = ?,
		recording_video_id = (SELECT v.id FROM videos v WHERE v.team_id = ? AND v.stream_uid = ? AND v.deleted_at IS NULL)
		WHERE team_id = ? AND id = ? AND status = 'open'`).bind(nowIso, teamId, streamUid, teamId, id);
}
