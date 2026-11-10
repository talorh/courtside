// The site's emails: to its admins, read from the admins table when sending, a new
// team's welcome to its team manager, read from its members list, and a support ticket's emails to
// the team manager who asked, or to the admin it's given to; never to an address a caller gives, so nothing
// else can be emailed through it. The only code allowed to use the email port (scripts/rules.mjs).
import { logProblem } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import { formerAdmin, listAdmins } from "../../auth/admins-repository.ts";
import type { OutgoingEmail } from "../../platform/email.ts";
import { listActiveMembers, type Member } from "../members/members-repository.ts";

/** One email to every current admin, and `o.former` too when it's someone just removed as an admin (the admins table
 * says so, so they hear about it). With no admins (there's always one: removing the last is refused) it sends nothing
 * and says so in the logs. */
export async function mailAdmins(deps: AppDeps, message: { subject: string; text: string; replyTo?: string }, o: { former?: string } = {}): Promise<{ sent: number }> {
	const former = o.former ? await formerAdmin(deps.db, o.former) : null;
	const to = [...new Set([...(await listAdmins(deps.db)).map((a) => a.email), ...(former ? [former] : [])])].sort();
	if (!to.length) {
		console.error(JSON.stringify({ event: "admin_mail_no_admins", teamId: null, subject: message.subject }));
		await logProblem(deps, { kind: "email_failed", teamId: null, what: `An email for the admins didn't send: there are none ("${message.subject}")` });
		return { sent: 0 };
	}
	// Staging's emails say so (docs/runbooks/staging.md): they reach the same inbox as the live site's.
	await deps.email.send({ to, ...message, subject: deps.config.staging ? `[Staging] ${message.subject}` : message.subject });
	return { sent: to.length };
}

/** A team's welcome (onboarding emails the team manager, to get them started): to the team manager
 * its members list names, Reply-To the admin sending it. On staging it goes to that admin instead, as staging only lets
 * the admins' own addresses in. Throws when the team has no team manager, or `admin` isn't one of the site's admins. */
export async function mailTeamManager(deps: AppDeps, teamId: string, admin: string, message: (manager: Member) => Omit<OutgoingEmail, "to" | "replyTo">): Promise<void> {
	const manager = (await listActiveMembers(deps.db, teamId)).find((m) => m.role === "manager");
	if (!manager) throw new Error("The team has no team manager to email");
	if (!(await listAdmins(deps.db)).some((a) => a.email === admin)) throw new Error("Only an admin sends a team's welcome");
	const email = message(manager);
	await deps.email.send(deps.config.staging
		? { ...email, to: [admin], subject: `[Staging] ${email.subject}`, replyTo: admin }
		: { ...email, to: [manager.email], replyTo: admin });
}

/** A ticket's email to the team manager who asked, while they're still on the team's list, Reply-To the admin who wrote
 * it, while they're still an admin. On staging it goes to that admin instead, as with a welcome. "gone": either has gone
 * since (nothing sent, and nothing to try again: it's on the ticket, on the site). */
export async function mailTicketManager(deps: AppDeps, ticket: { teamId: string; memberId: number }, admin: string, message: { subject: string; text: string }): Promise<"sent" | "gone"> {
	if (!(await listAdmins(deps.db)).some((a) => a.email.toLowerCase() === admin.toLowerCase())) return "gone";
	const manager = (await listActiveMembers(deps.db, ticket.teamId)).find((m) => m.id === ticket.memberId);
	if (!manager) return "gone";
	await deps.email.send(deps.config.staging
		? { to: [admin], subject: `[Staging] ${message.subject}`, text: message.text, replyTo: admin }
		: { to: [manager.email], subject: message.subject, text: message.text, replyTo: admin });
	return "sent";
}

/** One email to one admin (a ticket given to them), while they're still an admin; "gone" when they aren't. */
export async function mailAdmin(deps: AppDeps, admin: string, message: { subject: string; text: string }): Promise<"sent" | "gone"> {
	const to = (await listAdmins(deps.db)).find((a) => a.email.toLowerCase() === admin.toLowerCase());
	if (!to) return "gone";
	await deps.email.send({ to: [to.email], ...message, subject: deps.config.staging ? `[Staging] ${message.subject}` : message.subject });
	return "sent";
}
