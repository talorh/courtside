// The admin area's Users page: everyone on every team, a row for each team they're on, with whether they're a site
// admin or locked. Spans the teams by design, for site admins, so a CROSS_TEAM exception in scripts/rules.mjs. An
// admin's hidden way into a team isn't anyone's place on it, so it isn't listed; nor is a deleted team.
import type { Role } from "../../auth/permissions.ts";
import type { TeamStatus } from "../teams/team.ts";

/** One person's place on one team. `lastSeenAt`: when they last opened that team's pages; null: not yet. */
export interface UserRow {
	memberId: number; teamId: string; code: string; seasonStart: number; teamStatus: TeamStatus;
	email: string; name: string; role: Role; lastSeenAt: string | null; addedAt: string; isAdmin: boolean; locked: boolean;
}

interface Row {
	id: number; team_id: string; code: string; season_start: number; status: TeamStatus; email: string; name: string; role: Role;
	last_seen_at: string | null; created_at: string; admin: number; locked: number;
}

export async function listUserRows(db: D1Database): Promise<UserRow[]> {
	const { results } = await db.prepare(`SELECT m.id, m.team_id, t.code, t.season_start, t.status, m.email, m.name, m.role, m.last_seen_at, m.created_at,
		EXISTS (SELECT 1 FROM admins a WHERE a.email = m.email AND a.removed_at IS NULL) AS admin,
		EXISTS (SELECT 1 FROM locked_people l WHERE l.email = m.email) AS locked
		FROM members m JOIN teams t ON t.id = m.team_id
		WHERE m.removed_at IS NULL AND m.hidden = 0 AND t.status <> 'deleted'
		ORDER BY m.email, t.season_start DESC, t.code`).all<Row>();
	return results.map((r) => ({
		memberId: r.id, teamId: r.team_id, code: r.code, seasonStart: r.season_start, teamStatus: r.status, email: r.email.toLowerCase(),
		name: r.name, role: r.role, lastSeenAt: r.last_seen_at, addedAt: r.created_at, isAdmin: r.admin > 0, locked: r.locked > 0,
	}));
}

/** Whether `email` has a place on any team that isn't deleted (an admin's hidden way in isn't one). */
export async function isOnATeam(db: D1Database, email: string): Promise<boolean> {
	return (await db.prepare(`SELECT 1 AS n FROM members m JOIN teams t ON t.id = m.team_id
		WHERE m.email = ? AND m.removed_at IS NULL AND m.hidden = 0 AND t.status <> 'deleted' LIMIT 1`).bind(email).first<number>("n")) !== null;
}
