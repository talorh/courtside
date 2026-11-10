// A person's memberships across teams: a member row in each team they're in, with that team's role. Spans
// teams by design (who is this email, everywhere), so a CROSS_TEAM exception in scripts/check-rules.mjs.
import { type Member, toMember, type MemberRow } from "../features/members/members-repository.ts";
import type { Team } from "../features/teams/team.ts";
import { toTeam, type TeamRow } from "../features/teams/teams-repository.ts";

export interface Membership { team: Team; member: Member }

type Row = MemberRow & { team_name: string; code: string; season_start: number; ask_name: string | null; status: Team["status"]; closed_at: string | null; delete_after: string | null };

/** Every current membership of `email` in a team that isn't deleted: active teams first, then the newest season. */
export const membershipsStatement = (db: D1Database, email: string) => db
	.prepare(`SELECT m.id, m.team_id, m.email, m.name, m.role, m.last_seen_at, m.hide_scores, m.hidden,
		t.code, t.name AS team_name, t.season_start, t.ask_name, t.status, t.closed_at, t.delete_after
		FROM members m JOIN teams t ON t.id = m.team_id
		WHERE m.email = ? AND m.removed_at IS NULL AND t.status <> 'deleted'
		ORDER BY t.status = 'closed', t.season_start DESC, t.code`)
	.bind(email);

export const toMembership = (r: Row): Membership => ({
	member: toMember(r),
	team: toTeam({ id: r.team_id, name: r.team_name, code: r.code, season_start: r.season_start, ask_name: r.ask_name, status: r.status, closed_at: r.closed_at, delete_after: r.delete_after } as TeamRow),
});

export async function listMemberships(db: D1Database, email: string): Promise<Membership[]> {
	const { results } = await membershipsStatement(db, email).all<Row>();
	return results.map(toMembership);
}

/**
 * A site admin's own way into a team they aren't in: a hidden team manager membership, made the first time and the same
 * row after (a removed one comes back hidden). A real membership is never touched. Idempotent: a GET may call it.
 * Named "Site admin", which is what the team's pages show for what they do there. `opened`: made (or back) just now.
 */
export async function ensureHiddenManager(db: D1Database, teamId: string, email: string): Promise<{ member: Member; opened: boolean }> {
	const made = await db.prepare(`INSERT INTO members (team_id, email, name, role, hidden) VALUES (?, ?, 'Site admin', 'manager', 1)
		ON CONFLICT (team_id, email) DO UPDATE SET removed_at = NULL, name = 'Site admin', role = 'manager', hidden = 1 WHERE members.removed_at IS NOT NULL`)
		.bind(teamId, email).run();
	const row = await db.prepare(`SELECT id, team_id, email, name, role, last_seen_at, hide_scores, hidden FROM members WHERE team_id = ? AND email = ?`)
		.bind(teamId, email).first<MemberRow>();
	if (!row) throw new Error(`No membership for an admin in team ${teamId} after making one`);
	return { member: toMember(row), opened: made.meta.changes > 0 };
}
