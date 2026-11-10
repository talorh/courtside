// Who's asking: the signed-in email, whether they're a site admin, and every team they're in.
import { isBeingDeleted } from "../features/teams/team.ts";
import { isAdminStatement } from "./admins-repository.ts";
import { type Membership, membershipsStatement, toMembership } from "./memberships-repository.ts";

export interface Viewer { email: string; isAdmin: boolean; memberships: Membership[] }

/** Memberships and admin together, in one trip. Hidden memberships count only for someone who is an admin now, so a
 * removed admin keeps no way into teams they aren't really in. A team being deleted is no one's any more (`now`). */
export async function loadViewer(db: D1Database, rawEmail: string, now: Date): Promise<Viewer> {
	const email = rawEmail.toLowerCase();
	const [memberships, admin] = await db.batch([membershipsStatement(db, email), isAdminStatement(db, email)]);
	const isAdmin = (((admin?.results?.[0] as { n?: number } | undefined)?.n) ?? 0) > 0;
	const all = ((memberships?.results ?? []) as Parameters<typeof toMembership>[0][]).map(toMembership);
	return { email, isAdmin, memberships: all.filter((m) => (isAdmin || !m.member.hidden) && !isBeingDeleted(m.team, now)) };
}
