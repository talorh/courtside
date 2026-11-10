// What Health counts across every team: videos stuck processing, uploads that failed lately, and what's going on now.
// Admins only, so it reads every team (a CROSS_TEAM exception in scripts/rules.mjs). Counts only.

export interface HealthCounts { stuck: number; failed: number; liveNow: number; uploadingNow: number }

/** `stuckBefore`: a video still processing since before this is stuck; `failedSince`: uploads failed since this count. */
export async function healthCounts(db: D1Database, p: { stuckBefore: string; failedSince: string }): Promise<HealthCounts> {
	const row = await db.prepare(`SELECT
		(SELECT COUNT(*) FROM videos WHERE status = 'processing' AND deleted_at IS NULL AND created_at < ?1) AS stuck,
		(SELECT COUNT(*) FROM videos WHERE status = 'failed' AND created_at >= ?2) AS failed,
		(SELECT COUNT(*) FROM live_streams WHERE status = 'open') AS liveNow,
		(SELECT COUNT(*) FROM videos WHERE status = 'uploading' AND deleted_at IS NULL) AS uploadingNow`).bind(p.stuckBefore, p.failedSince).first<HealthCounts>();
	return row ?? { stuck: 0, failed: 0, liveNow: 0, uploadingNow: 0 };
}
