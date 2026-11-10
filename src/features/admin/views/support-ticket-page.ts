// One ticket (a proper service desk, replies on the site): the conversation (the question or idea, replies, the admins'
// private notes in amber, and what happened to it), one box to reply, reply and resolve, or note; beside it its status
// (a feature request's stage instead), its owner, its type (to move it to the other queue), who asked and how to reach
// them, and its team. The site's own tickets have nobody to reply to: notes and status only.
import type { AdminFrame } from "../../../app/admin-router.ts";
import { ROLE_LABELS } from "../../../auth/permissions.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime } from "../../../shared/time.ts";
import { notice, selectOptions } from "../../../ui/components.ts";
import { teamLabel } from "../../teams/team-code.ts";
import type { DeskMessage, Ticket } from "../support-desk-repository.ts";
import { ticketTitle } from "../support-emails.ts";
import { adminLayout } from "./admin-layout.ts";
import { KIND_LABELS, STAGE_LABELS, STATUS_LABELS } from "./support-page.ts";
import { FEATURE_STAGES } from "../../support/support-repository.ts";
import { openTeamForm } from "./teams-page.ts";

/** What a change just did (`?done=`): fixed words only, never anything from the address itself. */
export const TICKET_MESSAGES: Record<string, string> = { sent: "Reply sent.", noted: "Note added.", saved: "Saved.", moved: "Moved." };

const when = (iso: string) => formatGameDate(localTime(new Date(iso)));

function message(m: DeskMessage): SafeHtml {
	if (m.kind === "event") return html`<li class="msg event"><p class="small">${m.body} <span>${when(m.createdAt)}</span></p></li>`;
	const who = m.kind === "note" ? html`<b>${m.adminEmail}</b> <span class="t warn">Private note</span>` : html`<b>${m.memberName ?? m.adminEmail ?? "Someone"}</b>`;
	return html`<li class="msg${m.kind === "note" ? " note" : ""}${m.adminEmail ? " admin" : ""}"><p class="msgwho">${who} <span class="small">${when(m.createdAt)}</span></p><p class="msgtext">${m.body}</p></li>`;
}

function side(t: Ticket, admins: string[], me: string): SafeHtml {
	// The site's own tickets wait on nobody (support-desk-service.ts).
	const statuses = (t.source === "site" ? ["open", "resolved"] as const : ["open", "waiting", "resolved"] as const).map((s) => ({ value: s, label: STATUS_LABELS[s] }));
	const owners = [{ value: "", label: "Nobody" }, ...admins.map((a) => ({ value: a, label: a }))];
	const stages = FEATURE_STAGES.map((s) => html`<option value="${s}"${s === t.stage ? html` selected` : ""}>${STAGE_LABELS[s]}</option>`);
	const where = t.kind === "feature"
		? html`<form method="post" action="/admin/support/${t.id}/stage" class="sideform"><label>Stage<select name="stage">${t.stage ? "" : html`<option value="" selected disabled>Not looked at yet</option>`}${stages}</select></label><button class="btn">Save</button></form>
<p class="small">The team manager is emailed each change. Shipped and not planned close it.</p>`
		: html`<form method="post" action="/admin/support/${t.id}/status" class="sideform"><label>Status<select name="status">${selectOptions(statuses, t.status === "new" ? "open" : t.status)}</select></label><button class="btn">Save</button></form>`;
	const kinds = (["support", "feature"] as const).map((k) => ({ value: k, label: k === "feature" ? "Feature request" : "Support question" }));
	const type = t.source === "team" ? html`<form method="post" action="/admin/support/${t.id}/type" class="sideform"><label>Type<select name="kind">${selectOptions(kinds, t.kind)}</select></label><button class="btn">Move</button></form>` : "";
	const take = t.assignedTo?.toLowerCase() === me.toLowerCase() ? "" : html`<form method="post" action="/admin/support/${t.id}/assign"><input type="hidden" name="to" value="${me}"><button class="btn primary">Take it</button></form>`;
	const asked = t.member ? html`<dl class="kv"><dt>Asked by</dt><dd>${t.member.name || t.member.email}</dd><dt>Role</dt><dd>${ROLE_LABELS[t.member.role]}</dd>
<dt>Email</dt><dd>${t.member.email}</dd><dt>Reach them</dt><dd>${t.contact}</dd></dl>` : html`<p class="small">Raised by the site's own checks. It resolves itself once the problem's gone.</p>`;
	return html`<aside class="tside stack"><section class="panel stack"><h2>${t.kind === "feature" ? "Feature request" : "Ticket"}</h2>
${where}
<form method="post" action="/admin/support/${t.id}/assign" class="sideform"><label>Owner<select name="to">${selectOptions(owners, t.assignedTo ?? "")}</select></label><button class="btn">Save</button></form>${take}${type}</section>
<section class="panel stack"><h2>${t.team ? teamLabel(t.team) : "The site"}</h2>${asked}${t.team ? openTeamForm(t.team, "btn", `Open ${teamLabel(t.team)}`) : ""}</section></aside>`;
}

export function ticketPage(p: { frame: AdminFrame; ticket: Ticket; messages: DeskMessage[]; admins: string[]; message: string | null }): SafeHtml {
	const t = p.ticket, me = p.frame.viewer.email;
	const first = html`<li class="msg"><p class="msgwho"><b>${t.member ? t.member.name || t.member.email : "The site"}</b> <span class="small">${when(t.createdAt)}</span></p><p class="msgtext">${t.message}</p></li>`;
	const reply = t.source !== "team" ? "" : t.kind === "feature" ? html`<button class="btn primary" name="then" value="reply">Send reply</button>`
		: html`<button class="btn primary" name="then" value="reply">Send reply</button><button class="btn" name="then" value="resolve">Send and resolve</button>`;
	const to = t.member ? `${t.member.name || t.member.email}: it's emailed to them and shows on their Support page` : "nobody: the site raised this one";
	const standing = t.kind === "feature" ? (t.stage ? STAGE_LABELS[t.stage] : "New") : STATUS_LABELS[t.status];
	const lede = `${KIND_LABELS[t.kind].slice(0, -1)}. ${standing}${t.assignedTo ? `, ${t.assignedTo}'s` : ", nobody's yet"}. Asked ${when(t.createdAt)}.`;
	return adminLayout({ title: `#${t.id} ${ticketTitle(t)}`, current: "support", frame: p.frame, back: { href: t.kind === "feature" ? "/admin/support?type=feature" : "/admin/support", label: t.kind === "feature" ? "Feature requests" : "Support" }, lede },
		html`${notice(p.message)}<div class="ticketgrid"><div class="stack"><ol class="thread">${first}${p.messages.map(message)}</ol>
<form class="panel stack" method="post" action="/admin/support/${t.id}/message"><label>Write<textarea name="body" rows="5" required maxlength="4000"></textarea></label>
<div class="row-actions">${reply}<button class="btn" name="then" value="note">Add a private note</button></div>
<p class="small">A reply goes to ${to}. A private note is for the admins only.</p></form></div>${side(t, p.admins, me)}</div>`);
}
