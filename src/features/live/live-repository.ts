export type LiveSource = "camera" | "app";

export interface LiveStream {
	id: number;
	gameId: number;
	liveInputUid: string;
	startedBy: number | null;
	lastLiveAt: string | null;
	/** The filmer tapped End game: nothing can stream to the game again. */
	endRequestedAt: string | null;
	createdAt: string;
	status: "open" | "saved" | "cancelled";
	/** Why it closed without saving, in words for the filmer. */
	cancelReason: string | null;
	/** The phone's recording upload (from Go live), which becomes the game video. An app stream's saved video, once saved. */
	recordingVideoId: number | null;
	/** Go live's camera in the phone's browser, or an external app over RTMPS (app-live-service.ts). */
	source: LiveSource;
}

interface Row {
	id: number; game_id: number; live_input_uid: string; started_by: number | null; last_live_at: string | null;
	end_requested_at: string | null; created_at: string; status: LiveStream["status"]; cancel_reason: string | null;
	recording_video_id: number | null; source: LiveSource;
}

const COLUMNS = "id, game_id, live_input_uid, started_by, last_live_at, end_requested_at, created_at, status, cancel_reason, recording_video_id, source";
const toLive = (r: Row): LiveStream => ({
	id: r.id, gameId: r.game_id, liveInputUid: r.live_input_uid, startedBy: r.started_by, lastLiveAt: r.last_live_at,
	endRequestedAt: r.end_requested_at, createdAt: r.created_at, status: r.status, cancelReason: r.cancel_reason,
	recordingVideoId: r.recording_video_id, source: r.source,
});

/** The game's newest live stream, open or closed. */
export async function getLatestLiveForGame(db: D1Database, teamId: string, gameId: number): Promise<LiveStream | null> {
	const row = await db.prepare(`SELECT ${COLUMNS} FROM live_streams WHERE team_id = ? AND game_id = ? ORDER BY id DESC LIMIT 1`)
		.bind(teamId, gameId).first<Row>();
	return row ? toLive(row) : null;
}

/**
 * The game went live: its video comes from the stream, so it can't be uploaded. From the Go live page, Go live starts
 * the recording before the phone connects, so no recording means it never really streamed: Stream can still say
 * "connected" for a minute after a test's Stop, and a reused input carries that over. From an external app, it has
 * streamed once the site has seen the app sending.
 */
export const wasStreamed = (l: LiveStream): boolean => (l.source === "app" ? l.lastLiveAt !== null : l.recordingVideoId !== null);

export async function getOpenLiveForGame(db: D1Database, teamId: string, gameId: number): Promise<LiveStream | null> {
	const row = await db.prepare(`SELECT ${COLUMNS} FROM live_streams WHERE team_id = ? AND game_id = ? AND status = 'open'`)
		.bind(teamId, gameId).first<Row>();
	return row ? toLive(row) : null;
}

export async function listOpenLive(db: D1Database, teamId: string): Promise<LiveStream[]> {
	const { results } = await db.prepare(`SELECT ${COLUMNS} FROM live_streams WHERE team_id = ? AND status = 'open' ORDER BY id`)
		.bind(teamId).all<Row>();
	return results.map(toLive);
}

export async function insertLive(
	db: D1Database, l: { teamId: string; gameId: number; liveInputUid: string; startedBy: number; nowIso: string },
): Promise<void> {
	await db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at) VALUES (?, ?, ?, ?, ?)")
		.bind(l.teamId, l.gameId, l.liveInputUid, l.startedBy, l.nowIso).run();
}

/** Streaming again after a try that wasn't saved: the same input (its address is unique to this row) starts afresh,
 * from the camera (an app is chosen again each time). */
export async function reopenLive(db: D1Database, teamId: string, id: number, startedBy: number, nowIso: string): Promise<void> {
	await db.prepare(`UPDATE live_streams SET status = 'open', started_by = ?, created_at = ?, last_live_at = NULL,
		end_requested_at = NULL, finished_at = NULL, cancel_reason = NULL, recording_video_id = NULL, source = 'camera' WHERE team_id = ? AND id = ? AND status = 'cancelled'`)
		.bind(startedBy, nowIso, teamId, id).run();
}

/**
 * Cancels a stream nobody used: still no recording, and stopped or not opened since `cutoffIso`, checked as it's written
 * (Go live may be opening or starting it right now). True if it was.
 */
export async function cancelIfUnused(db: D1Database, teamId: string, id: number, cutoffIso: string, nowIso: string): Promise<boolean> {
	const r = await db.prepare(`UPDATE live_streams SET status = 'cancelled', finished_at = ? WHERE team_id = ? AND id = ? AND status = 'open'
		AND recording_video_id IS NULL AND (end_requested_at IS NOT NULL OR created_at < ?)`).bind(nowIso, teamId, id, cutoffIso).run();
	return r.meta.changes > 0;
}

/** Go live opened again for a stream it hasn't recorded yet: the day before it counts as unused starts again. Never an
 * app stream's: its recordings count from when the app was chosen. */
export async function touchLive(db: D1Database, teamId: string, id: number, nowIso: string): Promise<void> {
	await db.prepare("UPDATE live_streams SET created_at = ? WHERE team_id = ? AND id = ? AND status = 'open' AND recording_video_id IS NULL AND source = 'camera'")
		.bind(nowIso, teamId, id).run();
}

export async function setLastLive(db: D1Database, teamId: string, id: number, nowIso: string): Promise<void> {
	await db.prepare("UPDATE live_streams SET last_live_at = ? WHERE team_id = ? AND id = ?").bind(nowIso, teamId, id).run();
}

export async function finishLive(
	db: D1Database, teamId: string, id: number, status: "saved" | "cancelled", nowIso: string, reason: string | null = null,
): Promise<void> {
	await db.prepare("UPDATE live_streams SET status = ?, finished_at = ?, cancel_reason = ? WHERE team_id = ? AND id = ? AND status = 'open'")
		.bind(status, nowIso, reason, teamId, id).run();
}

/**
 * Cancelled, but only while its recording is still `videoId` (null: it still has none), as the stream was read: Go
 * live may have started a recording since. True if so.
 */
export async function cancelLiveWithRecording(
	db: D1Database, teamId: string, id: number, videoId: number | null, nowIso: string, reason: string | null = null,
): Promise<boolean> {
	const r = await db.prepare(`UPDATE live_streams SET status = 'cancelled', finished_at = ?, cancel_reason = ?
		WHERE team_id = ? AND id = ? AND status = 'open' AND recording_video_id IS ?`).bind(nowIso, reason, teamId, id, videoId).run();
	return r.meta.changes > 0;
}

export async function requestEnd(db: D1Database, teamId: string, id: number, nowIso: string): Promise<void> {
	await db.prepare("UPDATE live_streams SET end_requested_at = ? WHERE team_id = ? AND id = ? AND status = 'open' AND end_requested_at IS NULL")
		.bind(nowIso, teamId, id).run();
}

/** Links the recording, found by its R2 key, to the open stream: batched with the recording's insert (Go live's start).
 * The stream is now the streamer's (went live, saved), not whoever first opened Go live for the game. */
export function linkRecordingWrite(db: D1Database, teamId: string, id: number, r2Key: string, startedBy: number) {
	return db.prepare(`UPDATE live_streams SET recording_video_id = (SELECT v.id FROM videos v WHERE v.team_id = ? AND v.r2_key = ?), started_by = ?
		WHERE team_id = ? AND id = ? AND status = 'open'`).bind(teamId, r2Key, startedBy, teamId, id);
}

/** The browser stream whose recording this video is (open or already closed as saved). */
export async function getLiveByRecording(db: D1Database, teamId: string, videoId: number): Promise<LiveStream | null> {
	const row = await db.prepare(`SELECT ${COLUMNS} FROM live_streams WHERE team_id = ? AND recording_video_id = ? ORDER BY id DESC LIMIT 1`)
		.bind(teamId, videoId).first<Row>();
	return row ? toLive(row) : null;
}

/** A saved browser stream turned out to be a quick test: closed as cancelled, with why. */
export async function cancelSavedLive(db: D1Database, teamId: string, id: number, nowIso: string, reason: string): Promise<void> {
	await db.prepare("UPDATE live_streams SET status = 'cancelled', finished_at = ?, cancel_reason = ? WHERE team_id = ? AND id = ?")
		.bind(nowIso, reason, teamId, id).run();
}
