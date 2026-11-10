import { CLUB } from "../../../club.ts";
// A team's own Costs page, laid out as the Costs page is: its headline figures, its months stacked by kind of cost
// against a twelfth of its budget beside where its money goes and what a player costs a season and a month (and a game), its running
// total beside its budget (set here; the default until it is) with how much is used, and its months as a table (spent
// to date against budget to date).
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { notice } from "../../../ui/components.ts";
import { teamLabel } from "../../teams/team-code.ts";
import { type Currency, money } from "../costs-currency.ts";
import type { TeamCosts } from "../costs-estimate.ts";
import type { MonthCost } from "../costs-model.ts";
import { BASELINE, DEFAULT_BUDGET_LOCAL, monthName, monthOf, seasonMonths } from "../costs-prices.ts";
import type { Rate } from "../costs-rate.ts";
import { monthBars } from "../costs-summary.ts";
import type { Viewing } from "../costs-viewing.ts";
import { adminLayout } from "./admin-layout.ts";
import { budgetUse, burnUp, kindBars } from "./costs-burnup.ts";
import { monthsChart } from "./costs-charts.ts";
import { againstBudget, budgetBadge, currencySwitch, perPlayer, readLine, teamChangeWords, thousands, times } from "./costs-words.ts";
import { ACTUAL, ESTIMATED, NOT_BILLED, tiles } from "./costs-widgets.ts";

function monthRow(m: MonthCost, spent: number, budgetToDate: number, cur: Currency): SafeHtml {
	const d = money(cur);
	const diff = html`<span class="sub${spent > budgetToDate ? " over" : ""}">${spent > budgetToDate ? `${d(spent - budgetToDate)} over` : `${d(budgetToDate - spent)} under`}</span>`;
	return html`<tr${m.estimate ? html` class="est"` : ""}><td>${monthName(m.month)}${m.estimate ? html`<span class="sub">Estimate</span>` : ""}</td>
<td>${d(m.storage)}<span class="sub">${thousands(m.use.stored)} min</span></td><td>${d(m.viewing)}<span class="sub">${thousands(m.use.watched)} min</span></td>
<td>${d(m.uploads)}<span class="sub">${m.use.gbMonths.toFixed(1)} GB</span></td><td>${d(m.shared)}</td><td><b>${d(m.total)}</b></td>
<td>${d(spent)}</td><td>${d(budgetToDate)}${diff}</td></tr>`;
}

/** What a change just did (`?done=`): fixed words only. */
export const COST_MESSAGES: Record<string, string> = { budget: "Budget saved." };

/** `budgetAud`: the budget as it's set, in the club's currency, for the box whichever currency the page is in. */
function budgetPanel(c: TeamCosts, cur: Currency, budgetAud: number): SafeHtml {
	const b = c.team.budget, d = money(cur);
	return html`<section class="panel stack"><div class="panelhead"><h2>Season's budget</h2>${budgetBadge(c)}</div>
<div class="budgetuse">${budgetUse(c.soFar, c.estimate, b)}<p class="small"><b>${d(c.soFar)}</b> spent of ${d(b)}${c.team.budgetDefault ? " (the default)" : ""} (${b ? Math.round((c.soFar / b) * 100) : 0}%). The season, estimated: <b>${d(c.estimate)}</b>, ${againstBudget(c.estimate, b, cur)}. The tick is where the estimate lands.</p></div>
<form method="post" action="/admin/costs/${c.team.id}/budget" class="budgetform">${cur === "usd" ? html`<input type="hidden" name="cur" value="usd">` : ""}<label>Budget for the season, in ${CLUB.currency.name} <input name="budget" type="text" inputmode="decimal" maxlength="12" autocomplete="off" placeholder="${DEFAULT_BUDGET_LOCAL} (the default)" value="${c.team.budgetDefault ? "" : budgetAud.toFixed(2)}"></label><button class="btn primary">Save budget</button></form>
<p class="small">Every team starts at $${DEFAULT_BUDGET_LOCAL} (${CLUB.currency.name}); leave it empty to go back to that. Over it so far is an urgent alert; estimated to go over is a warning.</p></section>`;
}

function unitCosts(c: TeamCosts, cur: Currency): SafeHtml {
	const tile = (value: string, label: string, sub: string) => html`<div class="unit"><b>${value}</b><span>${label}</span><span class="sub">${sub}</span></div>`;
	const squad = `${c.team.players} ${c.team.players === 1 ? "player" : "players"} in its squad`;
	return html`<section class="panel stack"><h2>What it costs</h2><div class="units">
${tile(perPlayer(c.estimate, c.team.players, cur), "A player a season", `The season's estimate over ${squad}`)}
${tile(perPlayer(c.estimate / 12, c.team.players, cur), "A player a month", "The season's estimate over twelve months")}
${tile(perPlayer(c.thisMonth?.total ?? 0, c.team.players, cur), "A player, this month", squad)}
${tile(money(cur)(c.estimate / BASELINE.games), "A game", `The season's estimate over ${BASELINE.games} games`)}
</div></section>`;
}

/** `billed`: Cloudflare's bill has been read, so what's spent is actual. */
export function costTeamPage(p: { frame: AdminFrame; costs: TeamCosts; viewing: Viewing; now: Date; cur: Currency; rate: Rate; message: string | null; billed: boolean }): SafeHtml {
	const c = p.costs, b = c.team.budget, d = money(p.cur), thisMonth = monthOf(p.now.toISOString());
	const bars = monthBars([c], seasonMonths(c.team.seasonStart), thisMonth);
	let spent = 0;
	const rows = c.months.map((m, i) => { spent += m.total; return monthRow(m, spent, (b * (i + 1)) / c.months.length, p.cur); });
	const g = c.perGame;
	const basis = `Each game left: ${thousands(g.minutes)} minutes of video (${g.own.length ? "its own so far" : "the baseline"}), ${BASELINE.clipsAGame} clips, ${thousands(g.watched)} minutes watched (${g.own.watched ? "its own so far" : `the baseline: ${BASELINE.families} families each watching it ${times(BASELINE.viewsPerFamily)}`}) and a ${g.gb.toFixed(1)} GB original.`;
	const status = p.billed ? ACTUAL : NOT_BILLED;
	const board = tiles([
		{ value: d(c.thisMonth?.total ?? 0), label: "This month", pill: status, note: teamChangeWords(c, bars, thisMonth, p.cur) },
		{ value: d(c.soFar), label: "This season so far", pill: status, note: `A player this month: ${perPlayer(c.thisMonth?.total ?? 0, c.team.players, p.cur)}` },
		{ value: d(c.estimate), label: "The season, estimated", pill: ESTIMATED, note: `${d(c.soFar)} ${p.billed ? "actual" : "spent"} and ${d(c.estimate - c.soFar)} estimated` },
		{ value: d(b), label: c.team.budgetDefault ? "Budget (the default)" : "Budget", pill: ESTIMATED, note: againstBudget(c.estimate, b, p.cur) },
	]);
	return adminLayout({ title: teamLabel(c.team, { season: true }), current: "costs", frame: p.frame, back: { href: `/admin/costs${p.cur === "usd" ? "?cur=usd" : ""}`, label: "Costs" }, head: currencySwitch(p.cur, `/admin/costs/${c.team.id}`, p.rate), lede: c.team.status === "active" ? "What this team costs on Cloudflare." : "Its season is over: it's no longer sharing the site's costs." },
		html`${notice(p.message)}${board}<div class="costdash"><div class="cd-main">${monthsChart("Month by month", bars, thisMonth, b / 12, p.cur)}</div>
<div class="cd-side">${kindBars(bars, p.cur, thisMonth)}${unitCosts(c, p.cur)}</div>
<div class="cd-half">${burnUp("The season against its budget", bars, b, p.cur)}</div><div class="cd-half">${budgetPanel(c, p.cur, p.cur === "local" ? b : b * p.rate.localPerUsd)}</div></div>
<details class="panel costtable" open><summary>The months as a table</summary><div class="tablewrap"><table class="datatable costmonths"><thead><tr><th>Month</th><th>Video storage</th><th>Watching</th><th>Uploads (R2)</th><th>Shared</th><th>Month's total</th><th>Spent to date</th><th>Budget to date</th></tr></thead>
<tbody>${rows}</tbody></table></div><p class="small">${basis}</p><p class="small">${readLine(p.viewing)}</p></details>`);
}
