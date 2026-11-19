// What Health counts across every team: videos stuck processing, uploads that failed lately, and what's going on now
// (a live stream once it's under way, as the Log's Right now: not a Go live page opened and left; its recording counts as
// live, not as an upload).
// Admins only, so it reads every team (a CROSS_TEAM exception in scripts/rules.mjs). Counts only.

export interface HealthCounts { stuck: number; failed: number; liveNow: number; uploadingNow: number }

/** `stuckBefore`: a video whose processing began before this and is still going is stuck (from its row's creation for
 * videos from before processing_at was kept); `failedSince`: uploads failed since this, and still there (one deleted or
 * replaced has been dealt with), count. */
export async function healthCounts(db: D1Database, p: { stuckBefore: string; failedSince: string }): Promise<HealthCounts> {
	const row = await db.prepare(`SELECT
		(SELECT COUNT(*) FROM videos WHERE status = 'processing' AND deleted_at IS NULL AND COALESCE(processing_at, created_at) < ?1) AS stuck,
		(SELECT COUNT(*) FROM videos WHERE status = 'failed' AND deleted_at IS NULL AND created_at >= ?2) AS failed,
		(SELECT COUNT(*) FROM live_streams s JOIN teams t ON t.id = s.team_id WHERE t.status <> 'deleted' AND s.status = 'open'
			AND (s.recording_video_id IS NOT NULL OR (s.source = 'app' AND s.last_live_at IS NOT NULL))) AS liveNow,
		(SELECT COUNT(*) FROM videos v WHERE v.status = 'uploading' AND v.deleted_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM live_streams o WHERE o.team_id = v.team_id AND o.status = 'open' AND o.recording_video_id = v.id)) AS uploadingNow`).bind(p.stuckBefore, p.failedSince).first<HealthCounts>();
	return row ?? { stuck: 0, failed: 0, liveNow: 0, uploadingNow: 0 };
}
