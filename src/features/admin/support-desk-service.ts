// The support desk's work (replies on the site; admins emailed about ticket news): an admin replies,
// notes, takes or gives a ticket, or changes its status; each is saved first (with who it's emailed to), then emailed,
// and any email that didn't go is sent by the 5-minute job. An admin's reply waits on the team manager; a team manager's
// reply opens it again (support-service.ts).
import { logProblem } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import { badRequest, conflict, notFound } from "../../app/errors.ts";
import { isAdmin } from "../../auth/admins-repository.ts";
import type { TicketStatus } from "../support/support-repository.ts";
import { adminLogStatement } from "./admin-log-repository.ts";
import { mailAdmin, mailAdmins, mailTicketManager } from "./admin-mail.ts";
import { messageEmail, newTicketEmail, siteTicketEmail } from "./support-emails.ts";
import {
	findOpenSiteTicket, getMessage, getTicket, listUnsent, markMessageEmailed, markTicketEmailed, messageStatement, type Ticket, ticketStatement,
} from "./support-desk-repository.ts";

const RETRY_BATCH = 5;

export async function ticketOr404(deps: AppDeps, id: number): Promise<Ticket> {
	const ticket = await getTicket(deps.db, id);
	if (!ticket) throw notFound("Ticket");
	return ticket;
}

const body = (text: string) => {
	const b = text.trim();
	if (!b || b.length > 4000) throw badRequest("Write something (up to 4,000 characters).");
	return b;
};

/** Sends a ticket's first email (to the admins), once. */
export async function sendTicketEmail(deps: AppDeps, id: number): Promise<void> {
	const t = await ticketOr404(deps, id);
	if (t.emailedAt) return;
	await mailAdmins(deps, t.source === "site" ? siteTicketEmail(t) : newTicketEmail(t));
	await markTicketEmailed(deps.db, id, deps.now().toISOString());
}

/** Sends one message's email, to whoever it's for; someone no longer there gets nothing, and it isn't tried again. */
export async function sendMessageEmail(deps: AppDeps, id: number): Promise<void> {
	const m = await getMessage(deps.db, id);
	if (!m?.emailTo || m.emailedAt) return;
	const t = await ticketOr404(deps, m.ticketId);
	const email = messageEmail(t, m);
	const sent = m.emailTo === "admins" ? (await mailAdmins(deps, email), "sent")
		: m.emailTo === "manager" ? (t.teamId && t.member && m.adminEmail ? await mailTicketManager(deps, { teamId: t.teamId, memberId: t.member.id }, m.adminEmail, email) : "gone")
		: await mailAdmin(deps, m.emailTo, email);
	if (sent === "gone") console.log(JSON.stringify({ event: "ticket_email_skipped", teamId: t.teamId, ticket: t.id, message: id }));
	await markMessageEmailed(deps.db, id, deps.now().toISOString());
}

/** Tries now; a failure is logged (a problem in the admin Log too) and the 5-minute job sends it. */
export const trySend = (deps: AppDeps, what: "ticket" | "message", id: number) => (what === "ticket" ? sendTicketEmail(deps, id) : sendMessageEmail(deps, id))
	.catch(async (err: unknown) => {
		console.error(JSON.stringify({ event: "ticket_email_failed", teamId: null, what, id, error: String(err) }));
		await logProblem(deps, { kind: "email_failed", teamId: null, what: `Support ${what === "ticket" ? "request" : "reply"} ${id}'s email didn't send (it's tried again every 5 minutes)`, error: err });
	});

/** An admin's reply (to the team manager: it then waits on them, or is resolved), or a private note (no email). */
export async function adminWrites(deps: AppDeps, admin: string, id: number, text: string, then: "reply" | "resolve" | "note"): Promise<void> {
	const t = await ticketOr404(deps, id);
	const b = body(text);
	if (then !== "note" && t.source !== "team") throw badRequest("The site's own tickets have nobody to reply to: add a note instead.");
	const nowIso = deps.now().toISOString(), db = deps.db;
	// A feature request's stage says whether it's closed (feature-requests-service.ts): a reply keeps it as it is.
	const closed = t.kind === "feature" ? t.stage === "shipped" || t.stage === "declined" : then === "resolve";
	const status: TicketStatus = then === "note" ? (t.status === "new" ? "open" : t.status) : closed ? "resolved" : "waiting";
	const owner = then === "note" ? t.assignedTo : t.assignedTo ?? admin;
	const log = (action: "support_replied" | "support_status", detail: string) => adminLogStatement(db, { device: deps.device, adminEmail: admin, teamId: t.teamId, action, detail, at: nowIso });
	const [, reply] = await db.batch([
		ticketStatement(db, id, { status, assignedTo: owner, by: admin, nowIso }),
		messageStatement(db, { ticket: t, kind: then === "note" ? "note" : "reply", adminEmail: admin, body: b, emailTo: then === "note" ? null : "manager", nowIso }),
		...(then === "note" ? [] : [log("support_replied", `#${id}`)]), ...(then === "resolve" && t.kind === "support" ? [log("support_status", `#${id} resolved`)] : []),
	]);
	if (then !== "note") await trySend(deps, "message", reply?.meta.last_row_id ?? 0);
}

/** Taking a ticket (`to` the admin themselves), giving it to another admin (emailed to them), or letting it go (null). */
export async function assignTicket(deps: AppDeps, admin: string, id: number, to: string | null): Promise<void> {
	const t = await ticketOr404(deps, id);
	if (to !== null && !(await isAdmin(deps.db, to))) throw badRequest("Only one of the site's admins can have a ticket.");
	const nowIso = deps.now().toISOString(), db = deps.db, mine = to?.toLowerCase() === admin.toLowerCase();
	const words = to === null ? `${admin} let it go.` : mine ? `${admin} took it.` : `${admin} gave it to ${to}.`;
	const [, event] = await db.batch([
		ticketStatement(db, id, { status: t.status === "new" && to !== null ? "open" : t.status, assignedTo: to, by: admin, nowIso }),
		messageStatement(db, { ticket: t, kind: "event", adminEmail: admin, body: words, emailTo: to !== null && !mine ? to : null, nowIso }),
		adminLogStatement(db, { device: deps.device, adminEmail: admin, teamId: t.teamId, action: "support_assigned", detail: `#${id} to ${to ?? "nobody"}`, at: nowIso }),
	]);
	if (to !== null && !mine) await trySend(deps, "message", event?.meta.last_row_id ?? 0);
}

const STATUS_WORDS: Record<Exclude<TicketStatus, "new">, string> = { open: "open", waiting: "waiting for their reply", resolved: "resolved" };

/** Open, waiting on the team manager, or resolved (which tells the team manager, on their own ticket). The site's own
 * wait on nobody, and an old one reopens only while no newer one about the same thing is open. The status it has
 * already changes nothing. */
export async function setTicketStatus(deps: AppDeps, admin: string, id: number, status: string): Promise<void> {
	if (status !== "open" && status !== "waiting" && status !== "resolved") throw badRequest("Choose open, waiting or resolved.");
	const t = await ticketOr404(deps, id);
	if (t.kind === "feature") throw badRequest("A feature request goes by its stage: choose one of those.");
	if (status === t.status) return;
	if (t.source === "site" && status === "waiting") throw badRequest("The site's own tickets don't wait on anyone: choose open or resolved.");
	const newer = t.source === "site" && t.status === "resolved" ? await findOpenSiteTicket(deps.db, t.alertKind ?? "") : null;
	if (newer) throw conflict(`#${newer.id} is open about this already: add to that one.`);
	const nowIso = deps.now().toISOString(), db = deps.db;
	const tell = status === "resolved" && t.status !== "resolved" && t.source === "team";
	const [, event] = await db.batch([
		ticketStatement(db, id, { status, assignedTo: t.assignedTo, by: admin, nowIso }),
		messageStatement(db, { ticket: t, kind: "event", adminEmail: admin, body: `${admin} marked it ${STATUS_WORDS[status]}.`, emailTo: tell ? "manager" : null, nowIso }),
		adminLogStatement(db, { device: deps.device, adminEmail: admin, teamId: t.teamId, action: "support_status", detail: `#${id} ${status}`, at: nowIso }),
	]);
	if (tell) await trySend(deps, "message", event?.meta.last_row_id ?? 0);
}

/** The 5-minute job's step: tickets and messages whose email didn't go, a few a run. One that fails again is logged
 * (ticket_email_failed) and tried the next run, never failing the job: the email alert (usage-checks.ts) raises a ticket
 * once one has waited an hour. */
export async function retryTicketEmails(deps: AppDeps): Promise<void> {
	const { tickets, messages } = await listUnsent(deps.db, RETRY_BATCH);
	for (const id of tickets) await trySend(deps, "ticket", id);
	for (const id of messages) await trySend(deps, "message", id);
}
