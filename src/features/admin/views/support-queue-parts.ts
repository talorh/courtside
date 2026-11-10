// The support queue's figures and its filter bar. Support questions: how many need an answer (and how many are nobody's),
// how long the oldest has waited, how many wait on team managers, how many closed this week, and a typical first reply.
// Feature requests: how many need an answer, then how many are under consideration, planned and shipped. The filter bar
// narrows the queue to a team, an owner (or nobody's) and words, and applies as each changes (admin.js).
import { html, type SafeHtml } from "../../../shared/html.ts";
import type { TicketKind } from "../../support/support-repository.ts";
import { teamLabel } from "../../teams/team-code.ts";
import type { DeskFigures } from "../desk-figures-repository.ts";
import type { QueueView } from "../support-desk-repository.ts";
import type { QueuePage } from "./support-page.ts";

/** A wait in words: "12 minutes", "3 hours", "2 days". */
export function wait(minutes: number): string {
	const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
	if (minutes < 60) return unit(Math.max(1, Math.round(minutes)), "minute");
	return minutes < 48 * 60 ? unit(Math.round(minutes / 60), "hour") : unit(Math.round(minutes / (24 * 60)), "day");
}

const stat = (value: string | number, label: string, note = "", warn = false) =>
	html`<div class="lstat${warn ? " warn" : ""}"><b>${typeof value === "number" ? value.toLocaleString("en-AU") : value}</b><span>${label}</span>${note ? html`<span class="lnote">${note}</span>` : ""}</div>`;

export function deskFigures(kind: TicketKind, f: DeskFigures, counts: Record<QueueView, number>, now: Date): SafeHtml {
	const oldest = f.oldestWaiting ? wait((now.getTime() - Date.parse(f.oldestWaiting)) / 60_000) : "None";
	const answer = stat(f.attention, "need an answer", f.unowned ? `${f.unowned} nobody's yet` : f.attention ? "Every one has an owner" : "", f.unowned > 0);
	const first = stat(f.firstReplyMinutes === null ? "None yet" : wait(f.firstReplyMinutes), "typical first reply", f.replied ? `Over ${f.replied} asked in the last 30 days` : "Nothing answered in the last 30 days");
	const tiles = kind === "support"
		? [answer, stat(oldest, "oldest waiting", "Since it last changed", f.oldestWaiting !== null && now.getTime() - Date.parse(f.oldestWaiting) > 86_400_000),
			stat(f.waiting, "waiting on team managers"), stat(f.closedWeek, "resolved this week"), first]
		: [answer, stat(counts.considering, "under consideration"), stat(counts.planned, "planned"), stat(counts.shipped, "shipped", f.closedWeek ? `${f.closedWeek} closed this week` : ""), first];
	return html`<section class="statrow deskstats" aria-label="The queue's figures">${tiles}</section>`;
}

export function queueFilters(p: QueuePage): SafeHtml {
	const f = p.filters, option = (value: string, label: string, on: string) => html`<option value="${value}"${value === on ? html` selected` : ""}>${label}</option>`;
	const teams = p.teams.map((t) => option(t.id, teamLabel(t, { season: true }), f.team));
	const owners = [option("none", "Nobody's yet", f.owner), ...p.admins.map((a) => option(a.toLowerCase(), a === p.frame.viewer.email ? `${a} (you)` : a, f.owner))];
	const keep = [["type", p.kind === "feature" ? "feature" : ""], ["view", p.view === "attention" ? "" : p.view]].filter(([, v]) => v);
	const clear = `/admin/support${keep.length ? `?${new URLSearchParams(keep).toString()}` : ""}`;
	return html`<form method="get" action="/admin/support" class="panel queuefilters" data-autosubmit>${keep.map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
<label>Team<select name="team"><option value="">Any team</option>${teams}</select></label><label>Owner<select name="owner"><option value="">Anyone</option>${owners}</select></label>
<label class="qf-q">Search<input type="search" name="q" value="${f.q}" maxlength="100" placeholder="Words, a name, an email or #12"></label>
<span class="qf-acts">${f.team || f.owner || f.q ? html`<a class="btn" href="${clear}">Clear</a>` : ""}<button class="btn primary">Apply</button></span></form>`;
}
