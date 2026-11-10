// What admins did, and what team managers change on their teams, for the admin area's Log page.
import { ALL_TIME, type LogRange } from "../../shared/time.ts";

/** What people do on their team (features/admin/team-log.ts): a team manager's changes, Go live, photos; a line each, with who did it. */
export const TEAM_ACTIONS = ["member_added", "member_changed", "member_removed", "member_let_in", "player_added", "player_changed", "player_removed",
	"game_added", "game_changed", "game_deleted", "video_deleted", "video_moved", "live_app_chosen", "live_app_camera", "live_app_stopped",
	"game_lines_changed", "live_started", "live_ended", "live_test", "live_saved", "live_continued", "video_joined", "join_failed", "first_part_kept", "photo_added", "photo_deleted", "photo_kept"] as const;
export type TeamAction = typeof TEAM_ACTIONS[number];

export type AdminAction = "team_onboarded" | "team_edited" | "team_closed" | "team_reopened" | "delete_scheduled" | "delete_cancelled"
	| "team_deleted" | "team_opened" | "view_as" | "support_done" | "test_email" | "admin_added" | "admin_removed"
	| "support_replied" | "support_assigned" | "support_status" | TeamAction;

/** `device`: the request's (AppDeps.device); the site's own lines (`adminEmail` "site") are written without one. */
export interface AdminLogEntry { adminEmail: string; teamId: string | null; action: AdminAction; detail?: string; at: string; device: string }

/** The log line, to batch with the change it records, so neither happens without the other. */
export const adminLogStatement = (db: D1Database, e: AdminLogEntry) => db
	.prepare("INSERT INTO admin_log (admin_email, team_id, action, detail, created_at, device) VALUES (?, ?, ?, ?, ?, ?)")
	.bind(e.adminEmail, e.teamId, e.action, e.detail ?? "", e.at, e.adminEmail === "site" ? "" : e.device);

export interface AdminLogLine { adminEmail: string; action: AdminAction; detail: string; at: string; device: string; team: { code: string; seasonStart: number } | null }

/** The newest `limit` lines, newest first, with each one's team (a deleted team's too, by the name its lines keep once
 * its row has gone). */
export async function listAdminLog(db: D1Database, limit: number, range: LogRange = ALL_TIME): Promise<AdminLogLine[]> {
	const { results } = await db.prepare(`SELECT l.admin_email, l.action, l.detail, l.created_at, l.device, COALESCE(t.code, l.team_code) AS code,
		COALESCE(t.season_start, l.team_season) AS season_start FROM admin_log l
		LEFT JOIN teams t ON t.id = l.team_id WHERE l.created_at >= ? AND l.created_at < ?
		ORDER BY l.created_at DESC, l.id DESC LIMIT ?`).bind(range.from, range.to, limit)
		.all<{ admin_email: string; action: AdminAction; detail: string; created_at: string; device: string; code: string | null; season_start: number | null }>();
	return results.map((r) => ({
		adminEmail: r.admin_email, action: r.action, detail: r.detail, at: r.created_at, device: r.device,
		team: r.code && r.season_start ? { code: r.code, seasonStart: r.season_start } : null,
	}));
}

/** The last test email from Platform: when, and whether it went. */
export async function lastTestEmail(db: D1Database): Promise<{ at: string; detail: string } | null> {
	return db.prepare("SELECT created_at AS at, detail FROM admin_log WHERE action = 'test_email' ORDER BY created_at DESC, id DESC LIMIT 1")
		.first<{ at: string; detail: string }>();
}
