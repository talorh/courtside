export type ActivityKind =
	| "upload_started" | "upload_finished" | "video_ready" | "video_failed" | "hd_ready" | "clip_made" | "removal_requested"
	| "clip_removal_requested" | "live_started" | "live_saved" | "photo_removal_requested" | "video_deleted" | "game_deleted";

export interface ActivityEntry {
	kind: ActivityKind;
	gameId: number | null;
	memberName: string | null;
	detail: string | null;
	createdAt: string;
}

export interface ActivityInput {
	kind: ActivityKind;
	gameId: number | null;
	memberId?: number | null;
	detail?: string | null;
}

/** What the site does by itself (whoever's request it happens in): written without a device. */
export const SITE_KINDS: readonly ActivityKind[] = ["video_ready", "video_failed", "hd_ready"];

/** `device`: the request's (AppDeps.device), for the admin Log. */
export async function logActivity(db: D1Database, teamId: string, nowIso: string, a: ActivityInput, device: string): Promise<void> {
	await db
		.prepare("INSERT INTO activity (team_id, kind, game_id, member_id, detail, created_at, device) VALUES (?, ?, ?, ?, ?, ?, ?)")
		.bind(teamId, a.kind, a.gameId, a.memberId ?? null, a.detail ?? null, nowIso, SITE_KINDS.includes(a.kind) ? "" : device)
		.run();
}

/** Newest first (Notifications is for team managers only, so everything is shown). */
export async function listActivity(db: D1Database, teamId: string, sinceIso: string): Promise<ActivityEntry[]> {
	const { results } = await db
		.prepare(`SELECT a.kind, a.game_id, a.detail, a.created_at, COALESCE(NULLIF(m.name, ''), m.email) AS member_name
			FROM activity a LEFT JOIN members m ON m.id = a.member_id AND m.team_id = a.team_id
			WHERE a.team_id = ? AND a.created_at >= ?
			ORDER BY a.created_at DESC, a.id DESC LIMIT 200`)
		.bind(teamId, sinceIso)
		.all<{ kind: ActivityKind; game_id: number | null; detail: string | null; created_at: string; member_name: string | null }>();
	return results.map((r) => ({ kind: r.kind, gameId: r.game_id, memberName: r.member_name, detail: r.detail, createdAt: r.created_at }));
}

/** When `kind` last happened to a game (an upload finishing, say), or null if it hasn't. */
export async function lastActivityAt(db: D1Database, teamId: string, gameId: number, kind: ActivityKind): Promise<string | null> {
	return db.prepare("SELECT MAX(created_at) AS at FROM activity WHERE team_id = ? AND game_id = ? AND kind = ?").bind(teamId, gameId, kind).first<string | null>("at");
}

export async function purgeActivityBefore(db: D1Database, teamId: string, cutoffIso: string): Promise<number> {
	const r = await db.prepare("DELETE FROM activity WHERE team_id = ? AND created_at < ?").bind(teamId, cutoffIso).run();
	return r.meta.changes;
}
