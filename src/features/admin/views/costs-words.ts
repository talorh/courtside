import { CLUB } from "../../../club.ts";
// Costs' words and small pieces, for its pages: a team's standing against its budget, the change on last month, the
// switch between the club's currency and US dollars with the rate it's at, where minutes watched came from, and how it's all
// worked out (folded away under the charts).
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, formatShortDate, localTime } from "../../../shared/time.ts";
import { type BudgetLevel, budgetLevel } from "../budget-checks.ts";
import { type Currency, money } from "../costs-currency.ts";
import type { TeamCosts } from "../costs-estimate.ts";
import { changeOnLastMonth, type MonthBar } from "../costs-summary.ts";
import { BASELINE, DEFAULT_BUDGET_LOCAL, fixedAMonth, monthName, monthOf, monthSpan, PRICES } from "../costs-prices.ts";
import type { Rate } from "../costs-rate.ts";
import type { Viewing } from "../costs-viewing.ts";

export const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const us = money("usd");

const BADGES: Record<BudgetLevel, SafeHtml> = {
	none: html`<span class="t">Season over</span>`, ok: html`<span class="t src">Within budget</span>`,
	warn: html`<span class="t warn">On track to go over</span>`, urgent: html`<span class="t urgent">Over budget</span>`,
};
export const budgetBadge = (c: TeamCosts) => BADGES[budgetLevel(c)];

export const lastMonthOf = (month: string) => monthOf(new Date(Date.parse(monthSpan(month).start) - 1).toISOString());

/** A team's month against its last: as changeWords, unless it was onboarded this month or partway through last month,
 * when there's nothing fair to compare with. */
export function teamChangeWords(c: TeamCosts, bars: MonthBar[], thisMonth: string, cur: Currency): string {
	const last = lastMonthOf(thisMonth);
	if (c.team.createdAt >= monthSpan(thisMonth).start) return "Its first month";
	if (c.team.createdAt > monthSpan(last).start) return "Its first full month";
	return changeWords(changeOnLastMonth(bars, thisMonth), last, cur);
}

/** "once", "twice", "3 times". */
export const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** "Up $1.20 (12%) on October", or nothing to compare with. */
export function changeWords(change: { dollars: number; share: number } | null, lastMonth: string, cur: Currency): string {
	if (!change) return "Nothing to compare with last month";
	const name = monthName(lastMonth).split(" ")[0];
	if (Math.abs(change.dollars) < 0.005) return `The same as ${name}`;
	return `${change.dollars > 0 ? "Up" : "Down"} ${money(cur)(Math.abs(change.dollars))} (${Math.round(Math.abs(change.share) * 100)}%) on ${name}`;
}

/** Under or over its budget, estimated: "$12.00 under budget, estimated". */
export const againstBudget = (estimate: number, budget: number, cur: Currency) =>
	estimate > budget ? `${money(cur)(estimate - budget)} over budget, estimated` : `${money(cur)(budget - estimate)} under budget, estimated`;

/** A cost a player (a season's or a month's): "$1.25", or why there isn't one. */
export const perPlayer = (dollars: number, players: number, cur: Currency) => (players ? money(cur)(dollars / players) : "No squad yet");

const rateWords = (r: Rate) => (r.source === "set" ? `${r.localPerUsd.toFixed(2)} ${CLUB.currency.code}, a set rate until the day's can be read`
	: `${r.localPerUsd.toFixed(4)} ${CLUB.currency.code}, the European Central Bank's rate for ${r.date ? formatShortDate(`${r.date}T00:00`) : "the day"}`);

/** The club's currency or $USD, as two chips, with the rate under them. */
export function currencySwitch(cur: Currency, path: string, r: Rate): SafeHtml {
	const chip = (c: Currency, label: string) => html`<a class="chip" href="${c === "local" ? path : `${path}${path.includes("?") ? "&" : "?"}cur=usd`}"${c === cur ? html` aria-current="true"` : ""}>${label}</a>`;
	return html`<div class="cursw"><nav class="chips" aria-label="Currency">${chip("local", `$${CLUB.currency.code}`)}${chip("usd", "$USD")}</nav><p class="small">1 USD = ${rateWords(r)}.</p></div>`;
}

export function readLine(v: Viewing): string {
	const at = v.savedAt ? formatGameDate(localTime(new Date(v.savedAt))) : null;
	if (v.read === "off") return "Minutes watched need the read-only token (CF_INSIGHTS_TOKEN), so none are counted here.";
	if (v.read === "failed") return `Cloudflare's analytics couldn't be read just now, so minutes watched are as last read${at ? ` (${at})` : ": none yet"}.`;
	return `Minutes watched are from Cloudflare's analytics, by video, read ${at}.`;
}

export function workings(v: Viewing, bought: number | null, r: Rate): SafeHtml {
	return html`<details class="panel workings"><summary>How it's worked out</summary><ul class="costnotes">
<li><b>Currency</b>: Cloudflare bills in US dollars ($USD shows its own figures); $${CLUB.currency.code} shows each at 1 USD = ${rateWords(r)}, read a few times a day (a card's own rate and fees differ a little). Its prices below are in US dollars. Budgets are in ${CLUB.currency.name}: $${DEFAULT_BUDGET_LOCAL} a team until one's set on its page.</li>
<li><b>Shared</b> between the teams running each month, by the days each ran in it (one onboarded on the 31st shares a day's worth): Workers Paid ${us(PRICES.workersPaid)}, the Images and Stream bundle ${us(PRICES.bundle)} (the first ${thousands(PRICES.bundleMinutes)} minutes of storage, and 100,000 photos), and the domain, about ${us(PRICES.domainAYear)} a year: ${us(fixedAMonth())} a month in all. Minutes watched of videos no team has go in it too.</li>
<li><b>Video storage</b>: Stream's storage past the bundle is ${us(PRICES.streamStoredPer1000)} a month for each ${thousands(PRICES.bundleMinutes)} minutes, shared out by the minutes each team stores (its videos and clips).${bought === null ? " Stream didn't say how much is bought just now." : ` ${thousands(bought)} minutes are bought now.`}</li>
<li><b>Actual and estimated</b>: actual is Cloudflare's own bill, read every night from the records its invoices are made from: for every day it has billed, what it charged for watching and for R2 is each team's (shared out by minutes watched and GB of originals), and what else it charged is shared like the fees. The plan's fees and the storage bought are charged as they're priced. Everything else is estimated: the days the bill hasn't reached yet (it runs a day behind) and the months to come.</li>
<li><b>Watching</b>: ${us(PRICES.streamDeliveredPer1000)} for every ${thousands(1000)} minutes watched, live or later, downloads too, past what the plan includes: the estimate takes off as many minutes a period as Cloudflare's bill shows it charged nothing for. ${readLine(v)}</li>
<li><b>Uploads (R2)</b>: each original is kept 30 days; past the free ${PRICES.r2FreeGb} GB, $${PRICES.r2GbMonth} a GB a month, by each team's share. A game streamed from an external app has no original: Stream records it, so it costs video storage and watching like any other video, and nothing in R2. Sending a stream in costs nothing either way.</li>
<li><b>Free allowances</b>: the database, the Worker's requests, Workers AI and the emails are within what Workers Paid includes, and photos within the bundle's 100,000. Cloudflare's bill shows each against its allowance; past one, it charges.</li>
<li><b>A player a season</b>: a team's season (estimated, or spent once it's over) over the players in its squad now (Players). <b>A player a month</b> is a twelfth of it, and <b>a player this month</b> this month's costs over the same squad. The tile's are the running teams with a squad, over all their players.</li>
<li><b>The estimate</b>: a season of ${BASELINE.games} games, the games left spread evenly over the months left (to September), each adding to what the team stores, which is kept all season: ${BASELINE.gameMinutes} minutes of video, ${BASELINE.clipsAGame} clips, ${BASELINE.families} families each watching it ${times(BASELINE.viewsPerFamily)}, until a team has 3 games of its own to go on (videos still on the site).</li>
<li><b>Budgets</b>: a team over its season's budget so far is an urgent alert, and one whose season is estimated to go over is a warning, each a ticket on Support. A month's share of a budget is a twelfth.</li>
</ul><p class="small">Months are UTC months; Cloudflare's billing period runs from the 16th. Its invoices, in US dollars, are under Billing on the Cloudflare dashboard.</p></details>`;
}
