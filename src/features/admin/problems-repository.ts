// Anything that failed, for the admin Log's Problems (problem-log.ts writes them): kept a month. Across every team, so a
// CROSS_TEAM exception in scripts/rules.mjs; a team's own go with the team (team-purge-repository.ts).
import type { LogRange } from "../../shared/time.ts";

export const PROBLEM_KINDS = ["server_error", "job_failed", "email_failed", "golive_problem", "upload_problem", "photo_problem", "stream_problem", "ai_failed", "site_problem"] as const;
export type ProblemKind = typeof PROBLEM_KINDS[number];

/** `who`: the person it happened to, or "site"; `at` the latest time, `first_at` the first of `times`. */
export interface ProblemLine { kind: ProblemKind; who: string; what: string; detail: string; device: string; times: number; firstAt: string; at: string; team: { code: string; seasonStart: number } | null }

export interface ProblemRow { kind: ProblemKind; teamId: string | null; who: string; what: string; detail: string; device: string; at: string }

/** The same problem again (kind, team, person, words) since `sinceIso`, on a line started since `dayIso`, counts on that
 * line; anything else is a new line. One batch: the insert only when the count changed no row. */
export const problemStatements = (db: D1Database, p: ProblemRow, sinceIso: string, dayIso: string) => [
	db.prepare(`UPDATE problems SET times = times + 1, at = ?1, device = ?2 WHERE kind = ?3 AND team_id IS ?4 AND who = ?5 AND what = ?6 AND detail = ?7
		AND at > ?8 AND first_at > ?9`).bind(p.at, p.device, p.kind, p.teamId, p.who, p.what, p.detail, sinceIso, dayIso),
	db.prepare(`INSERT INTO problems (team_id, kind, who, what, detail, device, times, first_at, at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7
		WHERE changes() = 0`).bind(p.teamId, p.kind, p.who, p.what, p.detail, p.device, p.at),
];

/** The newest `limit` lines of the days, newest first, by when each last happened. */
export async function listProblems(db: D1Database, range: LogRange, limit: number): Promise<ProblemLine[]> {
	const { results } = await db.prepare(`SELECT p.kind, p.who, p.what, p.detail, p.device, p.times, p.first_at, p.at, t.code, t.season_start
		FROM problems p LEFT JOIN teams t ON t.id = p.team_id WHERE p.at >= ?1 AND p.at < ?2 ORDER BY p.at DESC, p.id DESC LIMIT ?3`).bind(range.from, range.to, limit)
		.all<{ kind: ProblemKind; who: string; what: string; detail: string; device: string; times: number; first_at: string; at: string; code: string | null; season_start: number | null }>();
	return results.map((r) => ({
		kind: r.kind, who: r.who, what: r.what, detail: r.detail, device: r.device, times: r.times, firstAt: r.first_at, at: r.at,
		team: r.code && r.season_start ? { code: r.code, seasonStart: r.season_start } : null,
	}));
}

/** The nightly job: a month's kept (31 days, so a whole calendar month is always there, as the sign-in's events). */
export const purgeProblems = (db: D1Database, beforeIso: string) => db.prepare("DELETE FROM problems WHERE at < ?").bind(beforeIso).run();
