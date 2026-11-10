// Teams. Site-wide by nature: a team is what other tables' team_id points at, so these queries are the
// CROSS_TEAM exceptions in scripts/check-rules.mjs.
import type { Team, TeamStatus } from "./team.ts";
import type { SetupCounts } from "./team-setup.ts";
import { SETUP_COUNTS, type SetupRow, toSetup } from "./team-setup-repository.ts";

export interface TeamRow {
	id: string; name: string; code: string; season_start: number; ask_name: string | null; status: TeamStatus;
	closed_at: string | null; delete_after: string | null;
}

export const TEAM_COLUMNS = "id, name, code, season_start, ask_name, status, closed_at, delete_after";

export const toTeam = (r: TeamRow): Team => ({
	id: r.id, code: r.code, name: r.name, seasonStart: r.season_start, askName: r.ask_name, status: r.status, closedAt: r.closed_at, deleteAfter: r.delete_after,
});

/** One team by id, whatever its status (callers decide what a closed or deleted one means). */
export async function getTeam(db: D1Database, id: string): Promise<Team | null> {
	const row = await db.prepare(`SELECT ${TEAM_COLUMNS} FROM teams WHERE id = ?`).bind(id).first<TeamRow>();
	return row ? toTeam(row) : null;
}

/** Every team that isn't deleted: current ones first, then by season (newest) and code. */
export async function listTeams(db: D1Database): Promise<Team[]> {
	const { results } = await db
		.prepare(`SELECT ${TEAM_COLUMNS} FROM teams WHERE status <> 'deleted' ORDER BY status = 'closed', season_start DESC, code`)
		.all<TeamRow>();
	return results.map(toTeam);
}

/** The open team with this code, if any (only one can be: teams_active_code). */
export async function findOpenTeam(db: D1Database, code: string): Promise<Team | null> {
	const row = await db.prepare(`SELECT ${TEAM_COLUMNS} FROM teams WHERE status = 'active' AND code = ?`).bind(code).first<TeamRow>();
	return row ? toTeam(row) : null;
}

/** A new team (onboarding), to batch with its first team manager and the admin log line. Fails with a UNIQUE constraint
 * error if an open team has its code or its id is taken. */
export const insertTeamStatement = (db: D1Database, team: Team) => db
	.prepare("INSERT INTO teams (id, name, code, season_start, ask_name, status) VALUES (?, ?, ?, ?, ?, 'active')")
	.bind(team.id, team.name, team.code, team.seasonStart, team.askName);

/** The team with this code and season that isn't deleted, if any. */
export async function findTeamBySeason(db: D1Database, code: string, seasonStart: number): Promise<Team | null> {
	const row = await db.prepare(`SELECT ${TEAM_COLUMNS} FROM teams WHERE code = ? AND season_start = ? AND status <> 'deleted'`).bind(code, seasonStart).first<TeamRow>();
	return row ? toTeam(row) : null;
}

/** An admin's edit (code, names, season, who to ask, and a closed team's delete date with its season). Fails with a
 * UNIQUE constraint error if an open team has the code. */
export const updateTeam = (db: D1Database, t: Team) => db
	.prepare("UPDATE teams SET code = ?, name = ?, season_start = ?, ask_name = ?, delete_after = ? WHERE id = ? AND status <> 'deleted'")
	.bind(t.code, t.name, t.seasonStart, t.askName, t.deleteAfter, t.id).run();

/** Closing, reopening and when a closed team is deleted, each only from the state it applies to (meta.changes 0: someone
 * else got there first). Reopening and changing the date stop once deleting has started (delete_after passed). */
export const closeTeamWrite = (db: D1Database, id: string, nowIso: string, deleteAfter: string) => db
	.prepare("UPDATE teams SET status = 'closed', closed_at = ?, delete_after = ? WHERE id = ? AND status = 'active'").bind(nowIso, deleteAfter, id).run();
export const reopenTeamWrite = (db: D1Database, id: string, nowIso: string) => db
	.prepare("UPDATE teams SET status = 'active', closed_at = NULL, delete_after = NULL WHERE id = ? AND status = 'closed' AND delete_after > ?").bind(id, nowIso).run();
export const setDeleteAfterWrite = (db: D1Database, id: string, deleteAfter: string, nowIso: string) => db
	.prepare("UPDATE teams SET delete_after = ? WHERE id = ? AND status = 'closed' AND delete_after > ?").bind(deleteAfter, id, nowIso).run();

/** The purge's last step (jobs/delete-teams.ts): the team is a tombstone now, kept for its download log (its row goes once nothing of it is left). */
export const markTeamDeleted = (db: D1Database, id: string, nowIso: string) => db
	.prepare("UPDATE teams SET status = 'deleted', deleted_at = ? WHERE id = ? AND status = 'closed'").bind(nowIso, id);

/** A team as the admin area's Teams page lists it. An admin's hidden way into a team is never counted or named. */
export interface TeamSummary { team: Team; members: number; managers: string[]; lastSeenAt: string | null; openSupport: number; setup: SetupCounts }

interface SummaryRow extends TeamRow, SetupRow { member_count: number; last_seen_at: string | null; open_support: number }

/** Every team that isn't deleted, current ones first (as listTeams), with its numbers. */
export async function listTeamSummaries(db: D1Database): Promise<TeamSummary[]> {
	const [teams, managers] = await db.batch([
		db.prepare(`SELECT ${TEAM_COLUMNS},
			(SELECT COUNT(*) FROM members m WHERE m.team_id = t.id AND m.removed_at IS NULL AND m.hidden = 0) AS member_count,
			(SELECT MAX(m.last_seen_at) FROM members m WHERE m.team_id = t.id AND m.hidden = 0) AS last_seen_at,
			(SELECT COUNT(*) FROM support_requests s WHERE s.team_id = t.id AND s.status IN ('new', 'open')) AS open_support, ${SETUP_COUNTS("t.id")}
			FROM teams t WHERE status <> 'deleted' ORDER BY status = 'closed', season_start DESC, code`),
		db.prepare(`SELECT m.team_id, CASE WHEN m.name <> '' THEN m.name ELSE m.email END AS who FROM members m JOIN teams t ON t.id = m.team_id
			WHERE t.status <> 'deleted' AND m.role = 'manager' AND m.removed_at IS NULL AND m.hidden = 0 ORDER BY m.name = '', m.name COLLATE NOCASE, m.email`),
	]);
	const names = (managers?.results ?? []) as Array<{ team_id: string; who: string }>;
	return ((teams?.results ?? []) as SummaryRow[]).map((r) => ({
		team: toTeam(r), members: r.member_count, managers: names.filter((n) => n.team_id === r.id).map((n) => n.who), lastSeenAt: r.last_seen_at,
		openSupport: r.open_support, setup: toSetup(r),
	}));
}

/** People on teams that aren't deleted: each email once, however many teams it's in (shown on Insights, Teams and Platform; no limit). */
export async function countPeopleOnTeams(db: D1Database): Promise<number> {
	const n = await db.prepare(`SELECT COUNT(DISTINCT lower(m.email)) AS n FROM members m JOIN teams t ON t.id = m.team_id
		WHERE t.status <> 'deleted' AND m.removed_at IS NULL AND m.hidden = 0`).first<number>("n");
	return n ?? 0;
}

/** The teams with one of `statuses` (the jobs: deleted teams too, for what's kept after them). */
export async function listTeamsIn(db: D1Database, statuses: TeamStatus[]): Promise<Team[]> {
	const { results } = await db
		.prepare(`SELECT ${TEAM_COLUMNS} FROM teams WHERE status IN (${statuses.map(() => "?").join(", ")}) ORDER BY id`)
		.bind(...statuses)
		.all<TeamRow>();
	return results.map(toTeam);
}
