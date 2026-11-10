// The support desk's queues, as service desks lay theirs out: support questions and feature requests as two tabs (each
// with how many need an answer), the queue's figures (desk-figures-repository.ts), a chip for each view with how many are
// in it, a filter bar (team, owner, words), then a table: each ticket's number, what it's about, its status (a feature
// request's stage), team, who asked, owner and when it last changed, flagged once it has waited a day for an answer.
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatShortDate, localTime } from "../../../shared/time.ts";
import type { FeatureStage, TicketKind, TicketStatus } from "../../support/support-repository.ts";
import { teamLabel } from "../../teams/team-code.ts";
import type { DeskFigures } from "../desk-figures-repository.ts";
import { type QueueFilters, QUEUE_VIEWS, type QueueView, type Ticket } from "../support-desk-repository.ts";
import { ticketTitle } from "../support-emails.ts";
import { adminLayout } from "./admin-layout.ts";
import { deskFigures, queueFilters } from "./support-queue-parts.ts";

const VIEWS: Record<QueueView, { label: string; empty: string }> = {
	attention: { label: "Needs an answer", empty: "Nothing needs an answer." }, mine: { label: "Yours", empty: "Nothing of yours is open." },
	waiting: { label: "Waiting for a reply", empty: "Nothing is waiting for a reply." }, resolved: { label: "Resolved", empty: "Nothing resolved yet." },
	considering: { label: "Under consideration", empty: "Nothing is under consideration." }, planned: { label: "Planned", empty: "Nothing is planned." },
	shipped: { label: "Shipped", empty: "Nothing shipped yet." }, declined: { label: "Not planned", empty: "Nothing turned down." },
	all: { label: "All", empty: "No tickets yet." },
};
export const STATUS_LABELS: Record<TicketStatus, string> = { new: "New", open: "Open", waiting: "Waiting", resolved: "Resolved" };
export const STAGE_LABELS: Record<FeatureStage, string> = { considering: "Under consideration", planned: "Planned", shipped: "Shipped", declined: "Not planned" };
export const KIND_LABELS: Record<TicketKind, string> = { support: "Support questions", feature: "Feature requests" };

/** The queue's address: support questions needing an answer is plain /admin/support. */
export function queueHref(kind: TicketKind, view: QueueView, f: QueueFilters = { team: "", owner: "", q: "" }): string {
	const q = new URLSearchParams([["type", kind === "feature" ? "feature" : ""], ["view", view === "attention" ? "" : view], ["team", f.team], ["owner", f.owner], ["q", f.q]].filter(([, v]) => v));
	return `/admin/support${q.size ? `?${q.toString()}` : ""}`;
}
export const firstLine = (text: string) => { const line = text.split("\n")[0] ?? ""; return line.length > 110 ? `${line.slice(0, 109)}…` : line; };

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", then the day. */
export function ago(iso: string, now: Date): string {
	const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
	const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"} ago`;
	if (minutes < 1) return "just now";
	if (minutes < 60) return unit(minutes, "minute");
	if (minutes < 24 * 60) return unit(Math.floor(minutes / 60), "hour");
	return minutes < 7 * 24 * 60 ? unit(Math.floor(minutes / (24 * 60)), "day") : formatShortDate(localTime(new Date(iso)));
}

const DAY_MS = 86_400_000;
const needsAnswer = (t: Ticket) => t.status === "new" || t.status === "open";

/** What the ticket's about, and under it a line of what was asked (a feature request's next line, as its first is its name). */
function about(t: Ticket): SafeHtml {
	const line = t.kind === "feature" ? firstLine(t.message.split("\n").slice(1).join(" ").trim()) : firstLine(t.message);
	return html`<a href="/admin/support/${t.id}"><b>${ticketTitle(t)}</b></a>${line ? html`<span class="tline">${line}</span>` : ""}`;
}

function standing(t: Ticket): SafeHtml {
	if (t.kind === "support") return html`<span class="tstat s-${t.status}">${STATUS_LABELS[t.status]}</span>`;
	const stage = html`<span class="stage s-${t.stage ?? "new"}">${t.stage ? STAGE_LABELS[t.stage] : "New"}</span>`;
	return t.stage && t.status === "open" ? html`${stage}<span class="sub">Replied since</span>` : stage;
}

function row(t: Ticket, now: Date): SafeHtml {
	const who = t.source === "site" ? "The site" : t.member?.name || t.member?.email || "Someone";
	const late = needsAnswer(t) && now.getTime() - Date.parse(t.updatedAt) > DAY_MS;
	return html`<tr class="tk${late ? " late" : ""}" data-href="/admin/support/${t.id}"><td class="k-num">#${t.id}</td><td class="k-main">${about(t)}</td><td class="k-stat">${standing(t)}</td>
<td class="k-team"><span class="teamtag">${t.team ? teamLabel(t.team) : "The site"}</span></td><td class="k-who">${who}</td><td class="k-owner">${t.assignedTo ?? html`<span class="muted">Nobody's yet</span>`}</td>
<td class="k-when"><time datetime="${t.updatedAt}">${ago(t.updatedAt, now)}</time>${late ? html`<span class="t warn">Over a day</span>` : ""}</td></tr>`;
}

export interface QueuePage {
	frame: AdminFrame; kind: TicketKind; view: QueueView; filters: QueueFilters; counts: Record<QueueView, number>; tabs: Record<TicketKind, number>;
	figures: DeskFigures; tickets: Ticket[]; teams: Array<{ id: string; code: string; seasonStart: number }>; admins: string[]; now: Date;
}

export function supportQueuePage(p: QueuePage): SafeHtml {
	const tab = (k: TicketKind) => html`<a class="tab" href="${queueHref(k, "attention")}"${k === p.kind ? html` aria-current="page"` : ""}>${KIND_LABELS[k]} <span class="n">${p.tabs[k]}</span></a>`;
	const chip = (v: QueueView) => html`<a class="chip" href="${queueHref(p.kind, v, p.filters)}"${v === p.view ? html` aria-current="true"` : ""}>${VIEWS[v].label} <span class="n">${p.counts[v]}</span></a>`;
	const filtered = Boolean(p.filters.team || p.filters.owner || p.filters.q);
	const empty = filtered ? "No tickets match these filters." : VIEWS[p.view].empty;
	const list = p.tickets.length ? html`<div class="tablewrap cards"><table class="queue"><thead><tr><th scope="col">#</th><th scope="col">${p.kind === "feature" ? "Idea" : "Ticket"}</th><th scope="col">${p.kind === "feature" ? "Stage" : "Status"}</th>
<th scope="col">Team</th><th scope="col">Asked by</th><th scope="col">Owner</th><th scope="col">Updated</th></tr></thead><tbody>${p.tickets.map((t) => row(t, p.now))}</tbody></table></div>`
		: html`<div class="panel empty"><b>${empty}</b>${filtered ? html`<p><a href="${queueHref(p.kind, p.view)}">Clear the filters</a></p>` : ""}</div>`;
	const lede = "Team managers' questions and ideas, and the site's own alerts, as tickets. Answer on a ticket: it's emailed, and kept there. How the site stands is at the top of Insights.";
	return adminLayout({ title: "Support", current: "support", frame: p.frame, lede },
		html`<nav class="tabs" aria-label="Ticket types">${tab("support")}${tab("feature")}</nav>${deskFigures(p.kind, p.figures, p.counts, p.now)}
<nav class="chips" aria-label="Which tickets">${QUEUE_VIEWS[p.kind].map(chip)}</nav>${queueFilters(p)}${list}`);
}
