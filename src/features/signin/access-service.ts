// Request access (the sign-in page's "Can't get in?"): someone not on a team's list gives their name, their team and
// their email, and the site's admins get a ticket on the support desk, emailed to them like every ticket, to add them.
// Nothing is ever emailed to the address typed: once they're on a list, they sign in with it as everyone does.
import { z } from "zod";
import type { AppDeps } from "../../app/deps.ts";
import { loadViewer } from "../../auth/viewer.ts";
import { trySend } from "../admin/support-desk-service.ts";
import { isEmail } from "../members/members-service.ts";
import { countAccessRequestsSince, hasOpenAccessRequest, insertAccessRequest } from "./access-repository.ts";

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
const HOUR = 3_600_000;

/** Typed text on one line, for a ticket's title and the email's subject. */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export async function requestAccess(deps: AppDeps, form: AccessForm): Promise<AccessResult> {
	const name = oneLine(form.name), team = oneLine(form.team), email = form.email.toLowerCase();
	if (!name || !team || !email) return "missing";
	if (!isEmail(email)) return "notEmail";
	const viewer = await loadViewer(deps.db, email, deps.now());
	if (viewer.isAdmin || viewer.memberships.length > 0) return "onList";
	if (await hasOpenAccessRequest(deps.db, email)) return "already";
	const now = deps.now();
	if (await countAccessRequestsSince(deps.db, new Date(now.getTime() - HOUR).toISOString()) >= ACCESS_PER_HOUR) return "busy";
	const id = await insertAccessRequest(deps.db, {
		email, title: `Access request: ${name}, ${team}`, nowIso: now.toISOString(),
		message: `${name} asked for access on the sign-in page.\n\nName: ${name}\nTeam: ${team}\nEmail: ${email}\n\n`
			+ `To let them in, add ${email} to the team's list (Teams, open the team, Manage team), then resolve this ticket. `
			+ "Nothing is emailed to them: once they're on the list, they sign in with that address. If it isn't one of our teams, resolve it.",
	});
	if (id === null) return "already";
	console.log(JSON.stringify({ event: "access_requested", teamId: null, ticket: id }));
	await trySend(deps, "ticket", id);
	return "sent";
}
