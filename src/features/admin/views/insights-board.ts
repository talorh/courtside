// The top of Insights (a landing page, more graphical): what needs an admin, then the whole site on
// one scoreboard, the club's arena board (admin.css), each number with its last 12 weeks where it has them.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { ICON_CHECK } from "../../../ui/icons.ts";
import type { Attention } from "../insights-attention.ts";
import { sparkline } from "./insights-chart.ts";

export function attentionList(items: Attention[]): SafeHtml {
	if (!items.length) return html`<p class="allclear">${ICON_CHECK}All clear: nothing needs an admin right now.</p>`;
	return html`<ul class="attention" aria-label="Needs attention">${items.map((a) => html`<li class="att ${a.level}"><p>${a.text}</p><a class="btn" href="${a.href}">${a.action}</a></li>`)}</ul>`;
}

/** One number on the board: its value, what it counts, and its weeks (oldest first) when it has them; `trend` says what
 * the weeks count when it isn't the number itself ("added": the number is what's there now); `note`, a line under it. */
export interface Score { value: SafeHtml | string | number; label: string; weekly?: number[]; trend?: string; note?: string }

function score(s: Score): SafeHtml {
	// Twelve weeks of nothing say nothing: no line, no words.
	const weeks = s.weekly?.some((n) => n > 0) ? s.weekly : undefined;
	const trend = weeks ? html`${sparkline(weeks)}<span class="delta">${weeks.at(-1) ?? 0}${s.trend ? ` ${s.trend}` : ""} this week, ${weeks.at(-2) ?? 0} last week</span>` : "";
	return html`<div class="sb"><b>${s.value}</b><span>${s.label}</span>${trend}${s.note ? html`<span class="delta">${s.note}</span>` : ""}</div>`;
}

/** One board of numbers, with no heading of its own (Insights' Mobile and desktop). */
export const scoreboard = (scores: Score[]) => html`<section class="scoreboard" aria-label="The figures">${scores.map(score)}</section>`;

/** The site's numbers in a few boards, each a side of the site with its heading. */
export const scoreboards = (boards: Array<{ title: string; scores: Score[] }>) =>
	html`<div class="boards" aria-label="The whole site in numbers">${boards.map((b) => html`<section class="scoreboard" aria-label="${b.title}"><h2 class="sbhead">${b.title}</h2>${b.scores.map(score)}</section>`)}</div>`;
