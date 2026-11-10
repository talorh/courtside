// The membership a team request runs as: the viewer's own in the current team, or a current admin's hidden
// one. View as (an admin trying the team as another role) comes in here too. And a closed team's site is read-only.
import type { Role } from "../auth/permissions.ts";
import { ensureHiddenManager } from "../auth/memberships-repository.ts";
import type { Viewer } from "../auth/viewer.ts";
import { adminLogStatement } from "../features/admin/admin-log-repository.ts";
import { viewingAs } from "../features/admin/view-as.ts";
import type { Member } from "../features/members/members-repository.ts";
import { teamLabel } from "../features/teams/team-code.ts";
import type { Team } from "../features/teams/team.ts";
import { type AppDeps, type TeamDeps, withTeam } from "./deps.ts";
import { conflict } from "./errors.ts";

export interface TeamContext { team: Team; member: Member; viewAs: Role | null; deps: TeamDeps }

/**
 * The viewer's membership of `team`; for an admin who isn't in it, their hidden team manager membership, made (and
 * logged) on their first visit: an idempotent write on a GET (docs/development-standards.md §3). null for anyone else.
 * An admin viewing the team as another role (`viewAsCookie`) gets that role, still as their own membership.
 */
export async function teamContext(deps: AppDeps, viewer: Viewer, team: Team, viewAsCookie: string | null = null): Promise<TeamContext | null> {
	let member = viewer.memberships.find((m) => m.team.id === team.id)?.member ?? null;
	if (!member && viewer.isAdmin) {
		const hidden = await ensureHiddenManager(deps.db, team.id, viewer.email);
		if (hidden.opened) await adminLogStatement(deps.db, { device: deps.device, adminEmail: viewer.email, teamId: team.id, action: "team_opened", at: deps.now().toISOString() }).run();
		member = hidden.member;
	}
	if (!member) return null;
	const viewAs = viewingAs(viewer, team, viewAsCookie);
	return { team, member: viewAs ? { ...member, role: viewAs } : member, viewAs, deps: withTeam(deps, team) };
}

/** Once a team's season is over its site is read-only: a write gets through only when its route is marked for closed
 * teams (removal requests, the team manager's deletes and the like). */
export function assertWritable(team: Team, method: string, allowedOnClosedTeams: boolean): void {
	if (team.status === "active" || method === "GET" || method === "HEAD" || allowedOnClosedTeams) return;
	throw conflict(`${teamLabel(team)}'s season is over, so its site is read-only.`);
}
