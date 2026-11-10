// One of a team manager's requests (replies on the site): where it's at (ticket-standing.ts), the conversation (their
// question, the admin's replies and theirs; never the admins' private notes) and a box to reply, which opens it again.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime } from "../../../shared/time.ts";
import { notice, pageHead } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import type { MyTicket, PublicReply } from "../support-repository.ts";
import { standing } from "./ticket-standing.ts";

const when = (iso: string) => formatGameDate(localTime(new Date(iso)));
const said = (who: string, at: string, body: string, mine: boolean) =>
	html`<li class="msg${mine ? " mine" : ""}"><p class="msgwho"><b>${who}</b> <span class="small">${when(at)}</span></p><p class="msgtext">${body}</p></li>`;

export function myTicketPage(p: { frame: PageFrame; ticket: MyTicket; replies: PublicReply[]; message?: string | null; body?: string; error?: string }): SafeHtml {
	const t = p.ticket, s = standing(t);
	const replies = p.replies.map((r) => said(r.fromManager ? "You" : "The site's admin", r.createdAt, r.body, r.fromManager));
	return layout({ title: `Your request #${t.id}`, frame: p.frame, current: "help" }, html`${pageHead("Contact support", `#${t.id} ${s.name}`)}
${notice(p.message)}<p class="small"><a href="/support">‹ Your requests</a></p>
<p class="ticketwhere"><span class="tstat s-${s.cls}">${s.label}</span> ${s.means}</p>
<ol class="thread">${said("You", t.createdAt, t.message, true)}${replies}</ol>
<form class="panel stack" method="post" action="/support/${t.id}/reply">${p.error ? html`<div class="note warn" role="alert">${p.error}</div>` : ""}
<label>Your reply<textarea name="body" rows="4" required maxlength="2000">${p.body ?? ""}</textarea></label>
<div class="row-actions"><button class="btn primary">Send</button></div></form>`);
}
