import { CLUB, siteOrigin } from "../../club.ts";
// What a support ticket's emails say (replies on the site, and admins get
// an email about anything on a ticket): each says what happened and links to the ticket, for admins in the admin area and for the team
// manager on their own Support page.
import { ROLE_LABELS } from "../../auth/permissions.ts";
import { TOPIC_LABELS } from "../support/support-repository.ts";
import { teamLabel } from "../teams/team-code.ts";
import type { DeskMessage, Ticket } from "./support-desk-repository.ts";

const adminLink = (t: Ticket) => `${siteOrigin()}/admin/support/${t.id}`;
const managerLink = (t: Ticket) => `${siteOrigin()}/support/${t.id}`;
const team = (t: Ticket) => (t.team ? teamLabel(t.team) : "the site");
/** A name someone typed, on one line: a subject can't hold a line break (the email port refuses it). */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const firstLine = (text: string) => { const line = oneLine(text.split("\n")[0] ?? ""); return line.length > 80 ? `${line.slice(0, 79)}…` : line; };
/** A ticket's name: its title (the site's own), a feature request's first line, else its topic. */
export const ticketTitle = (t: Ticket) => t.title ?? (t.kind === "feature" ? firstLine(t.message) || "Feature request" : TOPIC_LABELS[t.topic]);
/** What the admins call it: "Support #3", "Feature request #4". */
const tag = (t: Ticket) => `${t.kind === "feature" ? "Feature request" : "Support"} #${t.id}`;
const STAGE_SUBJECT = { considering: "Under consideration", planned: "Planned", shipped: "Shipped", declined: "Not planned" } as const;
const STAGE_TEXT = {
	considering: "The site's admin is thinking over your feature request.", planned: "Your feature request is planned. You'll hear here when it's on the site.",
	shipped: "Your feature request is on the site now.", declined: "Your feature request isn't planned for now.",
} as const;
const who = (t: Ticket) => oneLine(t.member?.name || t.member?.email || "Someone");

/** A team manager's new ticket, to the admins. */
export const newTicketEmail = (t: Ticket) => ({
	subject: `${tag(t)}: ${team(t)}, ${ticketTitle(t)}`, replyTo: t.member?.email,
	text: `${who(t)} (${t.member ? ROLE_LABELS[t.member.role].toLowerCase() : "team manager"}, ${team(t)}) ${t.kind === "feature" ? "has an idea for the site" : `asked for help with ${ticketTitle(t)}`}:

${t.message}

Contact: ${t.contact}

Answer on the ticket, so it's kept there: ${adminLink(t)}
Replying to this email goes to ${t.member?.email ?? "them"}.`,
});

/** The site's own ticket about an alert, to the admins. */
export const siteTicketEmail = (t: Ticket) => ({ subject: `${CLUB.siteName}: ${ticketTitle(t)} (#${t.id})`, text: `${t.message}\n\nThe ticket: ${adminLink(t)}` });

/** A message on a ticket: who it's for (`emailTo`) decides what it says. */
export function messageEmail(t: Ticket, m: DeskMessage): { subject: string; text: string; replyTo?: string } {
	if (m.emailTo === "admins" && m.memberName !== null) {
		return { subject: `${tag(t)}: ${oneLine(m.memberName)} replied`, replyTo: t.member?.email, text: `${oneLine(m.memberName)} (${team(t)}) replied about ${ticketTitle(t)}:\n\n${m.body}\n\nThe ticket: ${adminLink(t)}` };
	}
	if (m.emailTo === "admins") return { subject: `${CLUB.siteName}: ${ticketTitle(t)}, now urgent (#${t.id})`, text: `${m.body}\n\nThe ticket: ${adminLink(t)}` };
	const yours = t.kind === "feature" ? "your feature request" : `your question about ${ticketTitle(t)}`;
	if (m.emailTo === "manager" && m.kind === "reply") {
		const resolved = t.status === "resolved" ? "\n\nThis one's resolved now: if there's more, reply on the site and it opens again." : "";
		return { subject: `Re: ${yours} (#${t.id})`, text: `${m.body}\n\nFrom ${m.adminEmail}, the site's admin.${resolved}\n\nSee the whole conversation, and reply, on the site: ${managerLink(t)}` };
	}
	if (m.emailTo === "manager" && t.kind === "feature" && t.stage) {
		return { subject: `${STAGE_SUBJECT[t.stage]}: ${yours} (#${t.id})`, text: `${STAGE_TEXT[t.stage]}\n\n"${firstLine(t.message)}"\n\nSee it, and reply, on the site: ${managerLink(t)}` };
	}
	if (m.emailTo === "manager") {
		return { subject: `Resolved: your question about ${ticketTitle(t)} (#${t.id})`, text: `The site's admin marked your question resolved.\n\nIf there's more, reply on the site and it opens again: ${managerLink(t)}` };
	}
	return { subject: `${tag(t)} is yours: ${ticketTitle(t)}`, text: `${m.adminEmail} gave you ${tag(t).toLowerCase()} (${ticketTitle(t)}).\n\nThe ticket: ${adminLink(t)}` };
}
