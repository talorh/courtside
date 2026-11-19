// Request access (the sign-in page's "Can't get in?"): someone not on a team's list gives their name, their team and
// their email, and the site's admins get a ticket on the support desk, emailed to them like every ticket, to add them.
// Nothing is ever emailed to the address typed: once they're on a list, they sign in with it as everyone does.
import { isLocked } from "../../auth/locks-repository.ts";
import { z } from "zod";
import type { AppDeps } from "../../app/deps.ts";
import { countSignInEvents, recordSignInEvent } from "../../auth/sign-in-codes-repository.ts";
import { LIMITS, since } from "../../auth/sign-in-limits.ts";
import { storedEmail } from "../../auth/sign-in-service.ts";
import { loadViewer } from "../../auth/viewer.ts";
import { trySend } from "../admin/support-desk-service.ts";
import { isEmail } from "../members/members-service.ts";
import { hasOpenAccessRequest, insertAccessTicket } from "./access-repository.ts";

export const accessSchema = z.object({
	name: z.string().trim().max(80).default(""),
	team: z.string().trim().max(80).default(""),
	email: z.string().trim().max(254).default(""),
	"cf-turnstile-response": z.string().max(4096).default(""),
});
export type AccessForm = z.infer<typeof accessSchema>;
export type AccessResult = "sent" | "missing" | "notEmail" | "onList" | "already" | "busy";

/** Requests an hour from the whole site, so the form can't flood the admins' inboxes. */
export const ACCESS_PER_HOUR = 10;
/** Tries from one internet address in 15 minutes, as many as the sign-in's unknown addresses, so the form can't be used
 * to find out, address after address, who is on a team's list. */
export const ACCESS_PER_IP_15M = LIMITS.unknownPerIp15m;
const MINUTE = 60_000, HOUR = 3_600_000;

/** Typed text on one line, for a ticket's title and the email's subject. */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** `ip`: who's asking, for the form's limit. Every try is a sign-in event ("access"), which no sign-in limit counts. */
export async function requestAccess(deps: AppDeps, form: AccessForm, ip: string): Promise<AccessResult> {
	const name = oneLine(form.name), team = oneLine(form.team), email = form.email.toLowerCase();
	const now = deps.now();
	// Recorded before it's counted, so tries sent at the same moment each count the others; over the limit, the answer
	// is the same whatever the address, and the list isn't looked at.
	await recordSignInEvent(deps.db, { kind: "access", email: storedEmail(email), ip, at: now.toISOString(), device: deps.device });
	if (await countSignInEvents(deps.db, "access", since(now, 15 * MINUTE), { ip }) > ACCESS_PER_IP_15M) {
		console.log(JSON.stringify({ event: "access_refused", teamId: null, why: "limited" }));
		return "busy";
	}
	if (!name || !team || !email) return "missing";
	if (!isEmail(email)) return "notEmail";
	// A locked address hears what anyone does, and no ticket is made: locking isn't undone from the sign-in page.
	if (await isLocked(deps.db, email)) return "sent";
	const viewer = await loadViewer(deps.db, email, deps.now());
	if (viewer.isAdmin || viewer.memberships.length > 0) return "onList";
	if (await hasOpenAccessRequest(deps.db, email)) return "already";
	const id = await insertAccessTicket(deps.db, {
		email, title: `Access request: ${name}, ${team}`, nowIso: now.toISOString(),
		message: `${name} asked for access on the sign-in page.\n\nName: ${name}\nTeam: ${team}\nEmail: ${email}\n\n`
			+ `To let them in, add ${email} to the team's list (Teams, open the team, Manage team), then resolve this ticket. `
			+ "Nothing is emailed to them: once they're on the list, they sign in with that address. If it isn't one of our teams, resolve it.",
	}, { sinceIso: new Date(now.getTime() - HOUR).toISOString(), max: ACCESS_PER_HOUR });
	if (id === null) return "already";
	if (id === "busy") return "busy";
	console.log(JSON.stringify({ event: "access_requested", teamId: null, ticket: id }));
	await trySend(deps, "ticket", id);
	return "sent";
}
