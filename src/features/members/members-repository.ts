import type { Role } from "../../auth/permissions.ts";
import { assertChanged } from "../../shared/d1.ts";

export interface Member {
	id: number;
	teamId: string;
	email: string;
	name: string;
	role: Role;
	lastSeenAt: string | null;
	/** Hide scores (spoilers off): no score or result anywhere on the site for this member. */
	hideScores: boolean;
	/** A site admin's own way into a team they aren't in: never listed or counted. */
	hidden: boolean;
}

export interface MemberInput {
	email: string;
	name: string;
	role: Role;
}

export interface MemberRow {
	id: number;
	team_id: string;
	email: string;
	name: string;
	role: Role;
	last_seen_at: string | null;
	hide_scores: number;
	hidden: number;
}

const COLUMNS = "id, team_id, email, name, role, last_seen_at, hide_scores, hidden";
const LAST_SEEN_THROTTLE_MS = 3_600_000;

export const toMember = (r: MemberRow): Member => ({
	id: r.id, teamId: r.team_id, email: r.email, name: r.name, role: r.role, lastSeenAt: r.last_seen_at, hideScores: r.hide_scores === 1, hidden: r.hidden === 1,
});

export async function findActiveMemberByEmail(db: D1Database, teamId: string, email: string): Promise<Member | null> {
	const row = await db
		.prepare(`SELECT ${COLUMNS} FROM members WHERE team_id = ? AND email = ? AND removed_at IS NULL`)
		.bind(teamId, email)
		.first<MemberRow>();
	return row ? toMember(row) : null;
}

export async function getActiveMember(db: D1Database, teamId: string, id: number): Promise<Member | null> {
	const row = await db
		.prepare(`SELECT ${COLUMNS} FROM members WHERE team_id = ? AND id = ? AND removed_at IS NULL`)
		.bind(teamId, id)
		.first<MemberRow>();
	return row ? toMember(row) : null;
}

/** Manage team's orders for its people: by role (the usual one), by name, or by Last seen. */
export const MEMBER_SORTS = ["role", "name", "seen"] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

// By name: people with no name yet last, by email. By role: team managers, coaches, Watch and film, then Watch only, each
// by name. By Last seen: most recent first, people never seen last, then by name.
const BY_NAME = "name = '', name COLLATE NOCASE, email";
const LIST_ORDER: Record<MemberSort, string> = {
	role: `CASE role WHEN 'manager' THEN 0 WHEN 'coach' THEN 1 WHEN 'filmer' THEN 2 ELSE 3 END, ${BY_NAME}`,
	name: BY_NAME,
	seen: `last_seen_at IS NULL, last_seen_at DESC, ${BY_NAME}`,
};

export async function listActiveMembers(db: D1Database, teamId: string, sort: MemberSort = "role"): Promise<Member[]> {
	const { results } = await db
		.prepare(`SELECT ${COLUMNS} FROM members WHERE team_id = ? AND removed_at IS NULL AND hidden = 0 ORDER BY ${LIST_ORDER[sort]}`)
		.bind(teamId)
		.all<MemberRow>();
	return results.map(toMember);
}

export async function countActiveManagers(db: D1Database, teamId: string): Promise<number> {
	const count = await db
		.prepare("SELECT COUNT(*) AS n FROM members WHERE team_id = ? AND role = 'manager' AND hidden = 0 AND removed_at IS NULL")
		.bind(teamId)
		.first<number>("n");
	return count ?? 0;
}

/**
 * Inserts new emails and reactivates removed ones (keeping their old name when the new one is blank). An admin's hidden
 * membership becomes a real one with the role given (losing its "Site admin" name). Active real members are never
 * touched here: names and roles change only through updateMemberDetails.
 */
export async function upsertMembers(db: D1Database, teamId: string, inputs: MemberInput[]): Promise<void> {
	const sql = `INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)
		ON CONFLICT (team_id, email) DO UPDATE SET
			name = CASE WHEN excluded.name <> '' THEN excluded.name WHEN members.hidden = 1 THEN '' ELSE members.name END,
			role = excluded.role, removed_at = NULL, hidden = 0
		WHERE members.removed_at IS NOT NULL OR members.hidden = 1`;
	await db.batch(inputs.map((i) => db.prepare(sql).bind(teamId, i.email, i.name, i.role)));
}

/** A brand-new team's first member (onboarding), to batch with the team itself. */
export const newMemberStatement = (db: D1Database, teamId: string, m: MemberInput) => db
	.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)")
	.bind(teamId, m.email, m.name, m.role);

// In the same statement as the change, so two team managers demoting or removing each other at once can't leave none.
const KEEPS_A_MANAGER = `(role <> 'manager' OR EXISTS (SELECT 1 FROM members o WHERE o.team_id = members.team_id AND o.id <> members.id
	AND o.role = 'manager' AND o.hidden = 0 AND o.removed_at IS NULL))`;

export async function updateMemberDetails(db: D1Database, teamId: string, id: number, details: { name: string; role: Role }): Promise<void> {
	const result = await db
		.prepare(`UPDATE members SET name = ?, role = ? WHERE team_id = ? AND id = ? AND removed_at IS NULL AND (? = 'manager' OR ${KEEPS_A_MANAGER})`)
		.bind(details.name, details.role, teamId, id, details.role)
		.run();
	assertChanged(result, "member");
}

export async function markMemberRemoved(db: D1Database, teamId: string, id: number, nowIso: string): Promise<void> {
	const result = await db
		.prepare(`UPDATE members SET removed_at = ? WHERE team_id = ? AND id = ? AND removed_at IS NULL AND ${KEEPS_A_MANAGER}`)
		.bind(nowIso, teamId, id)
		.run();
	assertChanged(result, "member");
}

/** Spoilers: this member sees no scores anywhere, or sees them again. */
export async function setHideScores(db: D1Database, teamId: string, id: number, hide: boolean): Promise<void> {
	await db.prepare("UPDATE members SET hide_scores = ? WHERE team_id = ? AND id = ?").bind(hide ? 1 : 0, teamId, id).run();
}

/** Records activity at most once an hour per member. A no-op inside the window is expected, not an error. */
export async function touchLastSeen(db: D1Database, teamId: string, id: number, now: Date): Promise<void> {
	const cutoff = new Date(now.getTime() - LAST_SEEN_THROTTLE_MS).toISOString();
	await db
		.prepare("UPDATE members SET last_seen_at = ? WHERE team_id = ? AND id = ? AND (last_seen_at IS NULL OR last_seen_at <= ?)")
		.bind(now.toISOString(), teamId, id, cutoff)
		.run();
}
