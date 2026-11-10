// What the admin area's Insights page counts:
// each team's people, footage and activity, the site's weeks, and how big the database is. Admins only, so it reads
// every team (a CROSS_TEAM exception in scripts/rules.mjs). Counts only: nobody's email or name leaves here.
import type { Team } from "../teams/team.ts";
import { TEAM_COLUMNS, type TeamRow, toTeam } from "../teams/teams-repository.ts";

export interface TeamCounts {
	team: Team; people: number; managers: number; signedIn30: number; gamesPlayed: number; awaitingVideo: number; videos: number; videoSeconds: number;
	clips: number; photos: number; watchers30: number; downloads30: number; streams: number; appStreams: number; lastUpload: string | null;
	openRequests: number; openSupport: number; questions30: number;
}

interface CountsRow extends TeamRow {
	people: number; managers: number; signed_in_30: number; games_played: number; awaiting_video: number; videos: number; video_seconds: number; clips: number;
	photos: number; watchers_30: number; downloads_30: number; streams: number; app_streams: number; last_upload: string | null; open_requests: number; open_support: number; questions_30: number;
}

/** Every team that isn't deleted, current ones first. `since30`: the instant 30 days ago; `nowLocal`: local wall time
 * (games.starts_at's format); `day30`: the local date 30 days ago (ask_counts.day's). */
export async function teamCounts(db: D1Database, p: { since30: string; nowLocal: string; day30: string }): Promise<TeamCounts[]> {
	const { results } = await db.prepare(`SELECT ${TEAM_COLUMNS},
		(SELECT COUNT(*) FROM members m WHERE m.team_id = t.id AND m.removed_at IS NULL AND m.hidden = 0) AS people,
		(SELECT COUNT(*) FROM members m WHERE m.team_id = t.id AND m.removed_at IS NULL AND m.hidden = 0 AND m.role = 'manager') AS managers,
		(SELECT COUNT(*) FROM members m WHERE m.team_id = t.id AND m.removed_at IS NULL AND m.hidden = 0 AND m.last_seen_at >= ?1) AS signed_in_30,
		(SELECT COUNT(*) FROM games g WHERE g.team_id = t.id AND g.deleted_at IS NULL AND g.starts_at <= ?2) AS games_played,
		(SELECT COUNT(*) FROM games g WHERE g.team_id = t.id AND g.deleted_at IS NULL AND g.no_video_at IS NULL AND g.starts_at <= ?2
			AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.team_id = g.team_id AND v.game_id = g.id AND v.deleted_at IS NULL AND v.status <> 'failed')) AS awaiting_video,
		(SELECT COUNT(*) FROM videos v WHERE v.team_id = t.id AND v.deleted_at IS NULL AND v.status = 'ready') AS videos,
		(SELECT COALESCE(SUM(v.duration_seconds), 0) FROM videos v WHERE v.team_id = t.id AND v.deleted_at IS NULL AND v.status = 'ready') AS video_seconds,
		(SELECT MAX(v.created_at) FROM videos v WHERE v.team_id = t.id AND v.status <> 'failed') AS last_upload,
		(SELECT COUNT(*) FROM clips c WHERE c.team_id = t.id AND c.deleted_at IS NULL AND c.status = 'ready') AS clips,
		(SELECT COUNT(*) FROM photos f WHERE f.team_id = t.id AND f.deleted_at IS NULL) AS photos,
		(SELECT COUNT(*) FROM video_views w WHERE w.team_id = t.id AND w.opened_at >= ?1) AS watchers_30,
		(SELECT COUNT(*) FROM downloads d WHERE d.team_id = t.id AND d.created_at >= ?1)
			+ (SELECT COUNT(*) FROM media_downloads md WHERE md.team_id = t.id AND md.created_at >= ?1) AS downloads_30,
		(SELECT COUNT(DISTINCT s.game_id) FROM live_streams s WHERE s.team_id = t.id AND s.status = 'saved'
			AND EXISTS (SELECT 1 FROM videos v WHERE v.team_id = s.team_id AND v.game_id = s.game_id AND v.deleted_at IS NULL AND v.status = 'ready')) AS streams,
		(SELECT COUNT(DISTINCT s.game_id) FROM live_streams s WHERE s.team_id = t.id AND s.status = 'saved' AND s.source = 'app'
			AND EXISTS (SELECT 1 FROM videos v WHERE v.team_id = s.team_id AND v.game_id = s.game_id AND v.deleted_at IS NULL AND v.status = 'ready')) AS app_streams,
		(SELECT COUNT(*) FROM removal_requests r WHERE r.team_id = t.id AND r.status = 'open')
			+ (SELECT COUNT(*) FROM clip_removal_requests r WHERE r.team_id = t.id AND r.status = 'open')
			+ (SELECT COUNT(*) FROM photo_removal_requests r WHERE r.team_id = t.id AND r.status = 'open') AS open_requests,
		(SELECT COUNT(*) FROM support_requests q WHERE q.team_id = t.id AND q.status IN ('new', 'open')) AS open_support,
		(SELECT COALESCE(SUM(a.n), 0) FROM ask_counts a WHERE a.team_id = t.id AND a.day >= ?3) AS questions_30
		FROM teams t WHERE t.status <> 'deleted' ORDER BY t.status = 'closed', t.season_start DESC, t.code`)
		.bind(p.since30, p.nowLocal, p.day30).all<CountsRow>();
	return results.map((r) => ({
		team: toTeam(r), people: r.people, managers: r.managers, signedIn30: r.signed_in_30, gamesPlayed: r.games_played, awaitingVideo: r.awaiting_video, videos: r.videos,
		videoSeconds: r.video_seconds, clips: r.clips, photos: r.photos, watchers30: r.watchers_30, downloads30: r.downloads_30, streams: r.streams, appStreams: r.app_streams,
		lastUpload: r.last_upload, openRequests: r.open_requests, openSupport: r.open_support, questions30: r.questions_30,
	}));
}

/** Everyone on a team (each email once) who opened the site since each instant, and how big the database is (bytes; D1
 * says with every answer, a local database doesn't). */
export async function signedInSince(db: D1Database, since7: string, since30: string): Promise<{ week: number; month: number; dbBytes: number | null }> {
	const res = await db.prepare(`SELECT COUNT(DISTINCT CASE WHEN m.last_seen_at >= ?1 THEN lower(m.email) END) AS week,
		COUNT(DISTINCT CASE WHEN m.last_seen_at >= ?2 THEN lower(m.email) END) AS month
		FROM members m JOIN teams t ON t.id = m.team_id WHERE t.status <> 'deleted' AND m.removed_at IS NULL AND m.hidden = 0`)
		.bind(since7, since30).all<{ week: number; month: number }>();
	const row = res.results[0] ?? { week: 0, month: 0 };
	const size = (res.meta as { size_after?: unknown }).size_after;
	return { ...row, dbBytes: typeof size === "number" ? size : null };
}

export const SERIES = ["watchers", "uploads", "streams", "clips", "photos", "downloads"] as const;
export type Series = (typeof SERIES)[number];

// Each series counted by UTC hour (the page puts the hours into the club's weeks): what happened, not what's left now.
const HOURLY: Record<Series, string> = {
	watchers: "SELECT strftime('%Y-%m-%dT%H', opened_at) AS h, COUNT(*) AS n FROM video_views WHERE opened_at >= ?1 GROUP BY h",
	uploads: "SELECT strftime('%Y-%m-%dT%H', created_at) AS h, COUNT(*) AS n FROM videos WHERE created_at >= ?1 AND status <> 'failed' GROUP BY h",
	streams: "SELECT strftime('%Y-%m-%dT%H', created_at) AS h, COUNT(*) AS n FROM live_streams WHERE created_at >= ?1 AND status = 'saved' GROUP BY h",
	clips: "SELECT strftime('%Y-%m-%dT%H', created_at) AS h, COUNT(*) AS n FROM clips WHERE created_at >= ?1 AND status <> 'failed' GROUP BY h",
	photos: "SELECT strftime('%Y-%m-%dT%H', created_at) AS h, COUNT(*) AS n FROM photos WHERE created_at >= ?1 GROUP BY h",
	downloads: `SELECT strftime('%Y-%m-%dT%H', created_at) AS h, COUNT(*) AS n FROM (SELECT created_at FROM downloads WHERE created_at >= ?1
		UNION ALL SELECT created_at FROM media_downloads WHERE created_at >= ?1) GROUP BY h`,
};

/** Every team's activity since `since`, by UTC hour ('YYYY-MM-DDTHH'), one batch. */
export async function hourlyActivity(db: D1Database, since: string): Promise<Record<Series, Array<{ h: string; n: number }>>> {
	const results = await db.batch(SERIES.map((s) => db.prepare(HOURLY[s]).bind(since)));
	return Object.fromEntries(SERIES.map((s, i) => [s, (results[i]?.results ?? []) as Array<{ h: string; n: number }>])) as Record<Series, Array<{ h: string; n: number }>>;
}

export interface Watched { teamId: string; startsAt: string; opponent: string | null; watchers: number }

/** The videos the most people opened for the first time since `since`. */
export async function mostWatched(db: D1Database, since: string, limit: number): Promise<Watched[]> {
	const { results } = await db.prepare(`SELECT w.team_id, g.starts_at, g.opponent, COUNT(*) AS watchers FROM video_views w
		JOIN videos v ON v.id = w.video_id AND v.team_id = w.team_id JOIN games g ON g.id = v.game_id AND g.team_id = v.team_id
		WHERE w.opened_at >= ?1 AND v.deleted_at IS NULL GROUP BY w.team_id, w.video_id ORDER BY watchers DESC, g.starts_at DESC LIMIT ?2`)
		.bind(since, limit).all<{ team_id: string; starts_at: string; opponent: string | null; watchers: number }>();
	return results.map((r) => ({ teamId: r.team_id, startsAt: r.starts_at, opponent: r.opponent, watchers: r.watchers }));
}
