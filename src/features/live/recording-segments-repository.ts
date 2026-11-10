// A Go live recording's later segments (docs/architecture.md, Live streaming): each its own R2 multipart
// upload beside the recording, numbered from 2 (segment 1 is the video's own r2_key).
import { assertChanged } from "../../shared/d1.ts";

export interface Segment { id: number; videoId: number; n: number; r2Key: string; r2UploadId: string | null; createdAt: string; completedAt: string | null }

interface Row { id: number; video_id: number; n: number; r2_key: string; r2_upload_id: string | null; created_at: string; completed_at: string | null }

const COLUMNS = "id, video_id, n, r2_key, r2_upload_id, created_at, completed_at";
const toSegment = (r: Row): Segment => ({ id: r.id, videoId: r.video_id, n: r.n, r2Key: r.r2_key, r2UploadId: r.r2_upload_id, createdAt: r.created_at, completedAt: r.completed_at });

/** `.../live-2026-10-15.mp4` → `.../live-2026-10-15.2.mp4`: the same folder, so the recording's files stay together. */
export const segmentKey = (r2Key: string, n: number) => r2Key.replace(/(\.[a-z0-9]+)$/i, `.${n}$1`);

/** Where the joined file goes, beside the segments. */
export const joinedKey = (r2Key: string) => r2Key.replace(/(\.[a-z0-9]+)$/i, ".joined$1");

export async function insertSegment(db: D1Database, s: { teamId: string; videoId: number; n: number; r2Key: string; r2UploadId: string; nowIso: string }): Promise<void> {
	await db.prepare("INSERT INTO recording_segments (team_id, video_id, n, r2_key, r2_upload_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
		.bind(s.teamId, s.videoId, s.n, s.r2Key, s.r2UploadId, s.nowIso).run();
}

export async function listSegments(db: D1Database, teamId: string, videoId: number): Promise<Segment[]> {
	const { results } = await db.prepare(`SELECT ${COLUMNS} FROM recording_segments WHERE team_id = ? AND video_id = ? ORDER BY n`).bind(teamId, videoId).all<Row>();
	return results.map(toSegment);
}

/** The team's videos that still have segments (not yet joined). */
export async function videosWithSegments(db: D1Database, teamId: string): Promise<Set<number>> {
	const { results } = await db.prepare("SELECT DISTINCT video_id FROM recording_segments WHERE team_id = ?").bind(teamId).all<{ video_id: number }>();
	return new Set(results.map((r) => r.video_id));
}

/** Its R2 upload completed: the object is whole. */
export async function completeSegmentRow(db: D1Database, teamId: string, videoId: number, n: number, nowIso: string): Promise<void> {
	await db.prepare("UPDATE recording_segments SET r2_upload_id = NULL, completed_at = ? WHERE team_id = ? AND video_id = ? AND n = ?").bind(nowIso, teamId, videoId, n).run();
}

export async function deleteSegmentRow(db: D1Database, teamId: string, videoId: number, n: number): Promise<void> {
	await db.prepare("DELETE FROM recording_segments WHERE team_id = ? AND video_id = ? AND n = ?").bind(teamId, videoId, n).run();
}

export async function deleteSegmentRows(db: D1Database, teamId: string, videoId: number): Promise<void> {
	await db.prepare("DELETE FROM recording_segments WHERE team_id = ? AND video_id = ?").bind(teamId, videoId).run();
}

/** A carried-on recording's first upload had nothing in it: its next whole segment is the video's own file and no
 * longer a segment. One write, so a failure between the two can't leave that file as both and joined to itself. */
export async function promoteSegment(db: D1Database, teamId: string, videoId: number, n: number, r2Key: string): Promise<void> {
	const [video] = await db.batch([
		db.prepare("UPDATE videos SET r2_key = ? WHERE team_id = ? AND id = ?").bind(r2Key, teamId, videoId),
		db.prepare("DELETE FROM recording_segments WHERE team_id = ? AND video_id = ? AND n = ?").bind(teamId, videoId, n),
	]);
	assertChanged(video!, "video");
}

/** The joined file (or the one part kept) is the video's original now, the join's bookkeeping is over and its
 * segments' rows go: one write, so a failure can't leave a video on the joined file with segments still to join. */
export async function replaceSegmentsWith(db: D1Database, teamId: string, videoId: number, r2Key: string): Promise<void> {
	const [video] = await db.batch([
		db.prepare("UPDATE videos SET r2_key = ?, join_tries = 0, join_tried_at = NULL, join_failed_at = NULL WHERE team_id = ? AND id = ?").bind(r2Key, teamId, videoId),
		db.prepare("DELETE FROM recording_segments WHERE team_id = ? AND video_id = ?").bind(teamId, videoId),
	]);
	assertChanged(video!, "video");
}
