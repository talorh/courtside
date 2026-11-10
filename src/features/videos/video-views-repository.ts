import { addDays } from "../../shared/time.ts";

/** A game video is New to a member for this long after it was added, until they open it. */
export const NEW_FOR_DAYS = 21;
/** Openings are kept a little longer than that, then deleted (src/features/videos/retention-service.ts). */
export const VIEWS_KEPT_DAYS = 30;

/** The listLibrary viewer: videos added within NEW_FOR_DAYS can be New to this member. */
export const viewerFor = (memberId: number, now: Date) => ({ memberId, newSinceIso: addDays(now, -NEW_FOR_DAYS).toISOString() });

/** Remembers that a member opened a video's game page. Only the first opening is kept. */
export async function markOpened(db: D1Database, v: { teamId: string; videoId: number; memberId: number; nowIso: string }): Promise<void> {
	await db
		.prepare("INSERT INTO video_views (team_id, video_id, member_id, opened_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING")
		.bind(v.teamId, v.videoId, v.memberId, v.nowIso)
		.run();
}

export async function purgeViewsBefore(db: D1Database, teamId: string, cutoffIso: string): Promise<void> {
	await db.prepare("DELETE FROM video_views WHERE team_id = ? AND opened_at < ?").bind(teamId, cutoffIso).run();
}
