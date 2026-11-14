// A member found by email in one team, as tests look people up (the site itself finds them by id, or by the sign-in's
// memberships).
import { type Member, type MemberRow, toMember } from "../../src/features/members/members-repository.ts";

export async function findActiveMemberByEmail(db: D1Database, teamId: string, email: string): Promise<Member | null> {
	const row = await db.prepare(`SELECT id, team_id, email, name, role, last_seen_at, hide_scores, hidden FROM members
		WHERE team_id = ? AND email = ? AND removed_at IS NULL`).bind(teamId, email).first<MemberRow>();
	return row ? toMember(row) : null;
}
