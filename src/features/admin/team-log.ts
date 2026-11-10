// What team managers change on their teams, a line each in the admin area's Log, with who did it (an admin viewing as
// the team manager is themselves).
import type { TeamDeps } from "../../app/deps.ts";
import { ROLE_LABELS, type Role } from "../../auth/permissions.ts";
import { adminLogStatement, type TeamAction } from "./admin-log-repository.ts";

/** "Sam's mum (mum@x.com)", or just the email with no name. */
export const personOf = (p: { email: string; name: string }) => (p.name ? `${p.name} (${p.email})` : p.email);
export const roleOf = (role: Role) => ROLE_LABELS[role].toLowerCase();

/** The line, after the change it records. A line that can't be written is logged, never undoing the change. */
export async function logTeamChange(deps: TeamDeps, actor: string, action: TeamAction, detail: string): Promise<void> {
	await adminLogStatement(deps.db, { device: deps.device, adminEmail: actor, teamId: deps.team.id, action, detail, at: deps.now().toISOString() }).run()
		.catch((err: unknown) => console.error(JSON.stringify({ event: "team_log_failed", teamId: deps.team.id, action, error: String(err) })));
}
