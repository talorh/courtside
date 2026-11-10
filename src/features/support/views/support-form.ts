// A team manager asking the site's admin for help, or for something new (a feature request): the form, at the bottom of
// their Help and on Support, and on Support their own requests with where each is at (tickets, answered on the site).
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime } from "../../../shared/time.ts";
import { notice, pageHead, selectOptions } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import { ASK_CHOICES, ASK_LABELS, type MyTicket } from "../support-repository.ts";
import { standing } from "./ticket-standing.ts";

/** What a change just did (`?done=`): fixed words only, never anything from the address itself. */
export const SUPPORT_MESSAGES: Record<string, string> = {
	sent: "Sent. The site's admin will answer here, and by email.", replied: "Sent. The site's admin will see it straight away.",
};

const topics = ASK_CHOICES.map((t) => ({ value: t, label: ASK_LABELS[t] }));
const firstLine = (text: string) => { const line = text.split("\n")[0] ?? ""; return line.length > 100 ? `${line.slice(0, 99)}…` : line; };

type Values = { topic: string; message: string; contact: string };

/** The form itself: on Support, and at the bottom of a team manager's Help. Their email is there already. */
export function supportForm(frame: PageFrame, values?: Values, error?: string): SafeHtml {
	const v = values ?? { topic: "other", message: "", contact: frame.member.email };
	return html`<form class="panel stack" method="post" action="/support">
<p class="small">For anything Help doesn't answer, or an idea for the site (choose Feature request). It goes to the site's admin, who answers on your <a href="/support">Support</a> page and by email.</p>
${error ? html`<div class="note warn" role="alert">${error}</div>` : ""}
<label>What's it about?<select name="topic">${selectOptions(topics, v.topic)}</select></label>
<label>Your question or idea<textarea name="message" rows="6" required maxlength="2000">${v.message}</textarea></label>
<label>How to reach you<input name="contact" type="text" required maxlength="200" value="${v.contact}"><span class="small">Your email is there already: add a phone number if you like.</span></label>
<div class="row-actions"><button class="btn primary">Send</button></div></form>`;
}

function myRequests(tickets: MyTicket[]): SafeHtml | "" {
	if (!tickets.length) return "";
	const item = (t: MyTicket) => { const s = standing(t); return html`<li><a class="trow" href="/support/${t.id}"><span class="tstat s-${s.cls}">${s.label}</span>
<span class="tmain"><b>${s.name}</b><span class="tline">${firstLine(t.message)}</span></span><span class="small">${formatGameDate(localTime(new Date(t.updatedAt)))}</span></a></li>`; };
	return html`<section class="stack"><h2>Your requests</h2><ol class="tickets mine">${tickets.map(item)}</ol></section>`;
}

export function supportPage(p: { frame: PageFrame; tickets: MyTicket[]; message?: string | null; values?: Values; error?: string }): SafeHtml {
	return layout({ title: "Contact support", frame: p.frame, current: "help" }, html`${pageHead("Team managers", "Contact support")}
${notice(p.message)}${supportForm(p.frame, p.values, p.error)}${myRequests(p.tickets)}`);
}
