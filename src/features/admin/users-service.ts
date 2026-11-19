// What a site admin does from the Users page, each a line in the Log: lock someone (no sign-in and no team, every
// device signed out at once), unlock them, take them off one team, and add someone to a running team.
import type { AppDeps } from "../../app/deps.ts";
import { badRequest, conflict, notFound } from "../../app/errors.ts";
import { isAdmin } from "../../auth/admins-repository.ts";
import { isLocked, lockWrite, unlockWrite } from "../../auth/locks-repository.ts";
import type { Role } from "../../auth/permissions.ts";
import { countActiveManagers, getActiveMember, markMemberRemoved } from "../members/members-repository.ts";
import { addMembers, isEmail } from "../members/members-service.ts";
import { getTeam } from "../teams/teams-repository.ts";
import { adminLogStatement, type AdminAction } from "./admin-log-repository.ts";
import { personOf, roleOf } from "./team-log.ts";
import { isOnATeam } from "./users-repository.ts";

/** The Log's line, after the change it records: one that can't be written is logged, never undoing the change. */
const log = (deps: AppDeps, actor: string, action: AdminAction, teamId: string | null, detail: string) =>
	adminLogStatement(deps.db, { device: deps.device, adminEmail: actor, teamId, action, detail, at: deps.now().toISOString() }).run()
		.catch((err: unknown) => console.error(JSON.stringify({ event: "users_log_failed", teamId, action, error: String(err) })));

const tidy = (raw: string) => raw.trim().toLowerCase();

/** Never yourself, and never a site admin (they're taken off Admins first, by another admin); only someone on a team. */
export async function lockPerson(deps: AppDeps, actor: string, raw: string): Promise<string> {
	const email = tidy(raw);
	if (email === actor.toLowerCase()) throw conflict("You can't lock yourself.");
	if (await isAdmin(deps.db, email)) throw conflict(`${email} is a site admin: remove them as an admin first.`);
	if (!isEmail(email) || !(await isOnATeam(deps.db, email))) throw notFound("Person");
	if (!(await lockWrite(deps.db, email, actor, deps.now().toISOString()))) throw conflict(`${email} is locked already.`);
	await log(deps, actor, "user_locked", null, email);
	return email;
}

/** They can ask for a sign-in code again, on every team they're still on. */
export async function unlockPerson(deps: AppDeps, actor: string, raw: string): Promise<string> {
	const email = tidy(raw);
	if (!(await unlockWrite(deps.db, email))) throw conflict(`${email} isn't locked.`);
	await log(deps, actor, "user_unlocked", null, email);
	return email;
}

/** Off this team only; their other teams stay theirs. A team keeps at least one team manager, as on Manage team. */
export async function removeFromTeam(deps: AppDeps, actor: string, teamId: string, memberId: number): Promise<void> {
	const member = await getActiveMember(deps.db, teamId, memberId);
	if (!member || member.hidden) throw notFound("Person");
	if (member.role === "manager" && (await countActiveManagers(deps.db, teamId)) <= 1) {
		throw conflict(`${personOf(member)} is the team's last team manager: make someone else team manager first.`);
	}
	await markMemberRemoved(deps.db, teamId, memberId, deps.now().toISOString());
	await log(deps, actor, "member_removed", teamId, `${personOf(member)}, ${roleOf(member.role)}`);
}

/** Onto a running team, with their name and role; they sign in with their email from now, unless they're locked
 * (`locked`: they stay so, and the page says). */
export async function addToTeam(deps: AppDeps, actor: string, input: { email: string; name: string; teamId: string; role: Role }): Promise<{ locked: boolean }> {
	const team = await getTeam(deps.db, input.teamId);
	if (!team || team.status === "deleted") throw notFound("Team");
	if (team.status !== "active") throw badRequest("That team's season is over: add people to a running team.");
	const [added] = await addMembers(deps.db, team.id, [{ email: input.email, name: input.name, role: input.role }]);
	if (added) await log(deps, actor, "member_added", team.id, `${personOf(added)} as ${roleOf(added.role)}`);
	return { locked: await isLocked(deps.db, input.email) };
}
