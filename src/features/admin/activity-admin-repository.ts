import { CLUB } from "../../club.ts";
// Every team's Activity, for the admin Log (each team manager keeps their own Notifications): its lines for the days the
// Log shows, and what's happening now and removal requests waiting for its Right now, for every team or one (`teamId`
// null: every team). Across teams, so a CROSS_TEAM exception in scripts/rules.mjs.
import type { ActivityKind } from "../activity/activity-repository.ts";
import type { Competition } from "../games/games-repository.ts";
import type { LogRange } from "../../shared/time.ts";

export interface SiteGame { id: number; competition: Competition; roundLabel: string; opponent: string; startsAt: string }
export interface SiteInProgress { teamId: string; stage: "live" | "uploading" | "processing" | "hd"; game: SiteGame | null; since: string }
export interface SiteWaiting { teamId: string; videos: number; clips: number; photos: number }

/** What the admin log already says, with who did it (live-log.ts, game-log.ts): left out of the Log's Activity lines. */
const IN_ADMIN_LOG = ["live_started", "live_saved", "video_deleted", "game_deleted"] as const;
export type LogActivityKind = Exclude<ActivityKind, typeof IN_ADMIN_LOG[number]>;

/** An Activity line for the Log: `email` is whoever's it was ("" for a member since removed). */
export interface ActivityLogLine { kind: LogActivityKind; detail: string | null; at: string; device: string; email: string; team: { code: string; seasonStart: number }; game: SiteGame | null }

type GameCols = { game_id: number | null; competition: Competition | null; round_label: string | null; opponent: string | null; starts_at: string | null };
const game = (r: GameCols): SiteGame | null => (r.game_id === null ? null
	: { id: r.game_id, competition: r.competition ?? CLUB.league, roundLabel: r.round_label ?? "", opponent: r.opponent ?? "", startsAt: r.starts_at ?? "" });
const GAME = "g.id AS game_id, g.competition, g.round_label, g.opponent, g.starts_at";

/** The newest `limit` lines of the days, newest first, of every team still there. */
export async function listActivityLog(db: D1Database, range: LogRange, limit: number): Promise<ActivityLogLine[]> {
	const { results } = await db.prepare(`SELECT a.kind, a.detail, a.created_at, a.device, COALESCE(m.email, '') AS email, t.code, t.season_start, ${GAME}
		FROM activity a JOIN teams t ON t.id = a.team_id LEFT JOIN members m ON m.id = a.member_id AND m.team_id = a.team_id
		LEFT JOIN games g ON g.id = a.game_id AND g.team_id = a.team_id
		WHERE t.status <> 'deleted' AND a.created_at >= ?1 AND a.created_at < ?2 AND a.kind NOT IN (${IN_ADMIN_LOG.map((k) => `'${k}'`).join(", ")})
		ORDER BY a.created_at DESC, a.id DESC LIMIT ?3`).bind(range.from, range.to, limit)
		.all<GameCols & { kind: LogActivityKind; detail: string | null; created_at: string; device: string; email: string; code: string; season_start: number }>();
	return results.map((r) => ({
		kind: r.kind, detail: r.detail, at: r.created_at, device: r.device, email: r.email, team: { code: r.code, seasonStart: r.season_start }, game: game(r),
	}));
}

// As Notifications counts it: a live stream once Go live started its recording (whose upload is the stream, not an upload
// too) or once an external app's has been seen arriving, uploads, processing, and ready videos whose HD download is still being made.
const VIDEOS = (stage: string, where: string) => `SELECT '${stage}' AS stage, v.team_id, v.created_at AS since, ${GAME} FROM videos v JOIN teams t ON t.id = v.team_id
	LEFT JOIN games g ON g.id = v.game_id AND g.team_id = v.team_id WHERE t.status <> 'deleted' AND (?1 IS NULL OR v.team_id = ?1) AND v.deleted_at IS NULL AND ${where}`;

export async function listSiteInProgress(db: D1Database, teamId: string | null): Promise<SiteInProgress[]> {
	const { results } = await db.prepare(`SELECT 'live' AS stage, s.team_id, s.created_at AS since, ${GAME} FROM live_streams s JOIN teams t ON t.id = s.team_id
		LEFT JOIN games g ON g.id = s.game_id AND g.team_id = s.team_id WHERE t.status <> 'deleted' AND (?1 IS NULL OR s.team_id = ?1) AND s.status = 'open'
			AND (s.recording_video_id IS NOT NULL OR (s.source = 'app' AND s.last_live_at IS NOT NULL))
		UNION ALL ${VIDEOS("uploading", "v.status = 'uploading' AND NOT EXISTS (SELECT 1 FROM live_streams o WHERE o.team_id = v.team_id AND o.status = 'open' AND o.recording_video_id = v.id)")}
		UNION ALL ${VIDEOS("processing", "v.status = 'processing'")}
		UNION ALL ${VIDEOS("hd", "v.status = 'ready' AND v.stream_uid IS NOT NULL AND v.hd_ready_at IS NULL")}
		ORDER BY since`).bind(teamId).all<GameCols & { stage: SiteInProgress["stage"]; team_id: string; since: string }>();
	return results.map((r) => ({ teamId: r.team_id, stage: r.stage, game: game(r), since: r.since }));
}

/** Each team with a family's removal request waiting for its team manager: the ones its Manage team page lists, so none for a
 * clip or photo that's gone (a clip goes with its video). */
export async function listSiteWaiting(db: D1Database, teamId: string | null): Promise<SiteWaiting[]> {
	const { results } = await db.prepare(`SELECT t.id AS team_id,
		(SELECT COUNT(*) FROM removal_requests r WHERE r.team_id = t.id AND r.status = 'open') AS videos,
		(SELECT COUNT(*) FROM clip_removal_requests r WHERE r.team_id = t.id AND r.status = 'open' AND EXISTS (SELECT 1 FROM clips c
			JOIN videos v ON v.team_id = c.team_id AND v.id = c.video_id WHERE c.team_id = r.team_id AND c.id = r.clip_id AND c.deleted_at IS NULL AND v.deleted_at IS NULL)) AS clips,
		(SELECT COUNT(*) FROM photo_removal_requests r WHERE r.team_id = t.id AND r.status = 'open'
			AND EXISTS (SELECT 1 FROM photos p WHERE p.team_id = r.team_id AND p.id = r.photo_id AND p.deleted_at IS NULL)) AS photos
		FROM teams t WHERE t.status <> 'deleted' AND (?1 IS NULL OR t.id = ?1) ORDER BY t.status = 'closed', t.season_start DESC, t.code`)
		.bind(teamId).all<{ team_id: string; videos: number; clips: number; photos: number }>();
	return results.filter((r) => r.videos + r.clips + r.photos > 0).map((r) => ({ teamId: r.team_id, videos: r.videos, clips: r.clips, photos: r.photos }));
}
