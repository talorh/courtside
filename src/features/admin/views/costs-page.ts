// The admin area's Costs page, a dashboard as cloud cost tools lay theirs out: the figures as a row of tiles, each saying
// whether it's actual (Cloudflare's own bill) or estimated (costs-tiles.ts), every team's months stacked by kind of cost
// beside where the money goes and what the teams used, Cloudflare's bill for the billing period with each product's free
// allowance, the season's running total against the budgets beside every team's season on one scale, every team month
// by month in one grid, then each team: its months, its budget used, what a player costs a season and a month. The
// season's report for Excel is beside the seasons.
// For site admins only, in the club's currency or Cloudflare's own US dollars. A team's own storage, watching and
// uploads are its own; the site's fixed costs are shared by the days each team ran in the month.
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { seasonLabel } from "../../../shared/time.ts";
import { teamLabel } from "../../teams/team-code.ts";
import { type Currency, money } from "../costs-currency.ts";
import type { TeamCosts } from "../costs-estimate.ts";
import type { Bill } from "../costs-bill.ts";
import { BASELINE, monthOf, seasonMonths } from "../costs-prices.ts";
import type { Rate } from "../costs-rate.ts";
import { monthBars } from "../costs-summary.ts";
import type { Viewing } from "../costs-viewing.ts";
import { adminLayout } from "./admin-layout.ts";
import { budgetUse, burnUp, kindBars, monthSpark } from "./costs-burnup.ts";
import { billWidget } from "./costs-bill-widget.ts";
import { monthsChart, shortMonth } from "./costs-charts.ts";
import { budgetBadge, currencySwitch, perPlayer, teamChangeWords, workings } from "./costs-words.ts";
import { teamMonths } from "./costs-team-months.ts";
import { costTiles, teamMonth } from "./costs-tiles.ts";
import { teamSeasons, tiles, usedThisMonth } from "./costs-widgets.ts";

const sum = (costs: TeamCosts[], f: (c: TeamCosts) => number) => costs.reduce((s, c) => s + f(c), 0);

function teamRow(c: TeamCosts, thisMonth: string, cur: Currency): SafeHtml {
	const m = money(cur), bars = monthBars([c], seasonMonths(c.team.seasonStart), thisMonth), b = c.team.budget;
	const use = html`${budgetUse(c.soFar, c.estimate, b)}<span class="sub">${b ? Math.round((c.soFar / b) * 100) : 0}% used of ${m(b)}${c.team.budgetDefault ? " (the default)" : ""}; ${b ? Math.round((c.estimate / b) * 100) : 0}% estimated</span>`;
	const href = `/admin/costs/${c.team.id}${cur === "usd" ? "?cur=usd" : ""}`;
	return html`<tr${c.team.status === "active" ? "" : html` class="past"`}><td class="c-team"><a href="${href}"><b>${teamLabel(c.team, { season: true })}</b></a><span class="sub">${c.team.status === "active" ? `${c.games} of ${BASELINE.games} games, ${c.team.players} ${c.team.players === 1 ? "player" : "players"}` : "Season over"}</span></td>
<td class="c-month">${m(teamMonth(c, thisMonth)?.total ?? 0)}<span class="sub">${teamChangeWords(c, bars, thisMonth, cur)}</span></td><td class="c-spark">${monthSpark(bars, thisMonth)}</td><td class="c-est">${m(c.estimate)}</td>
<td class="c-use">${use}</td><td class="c-game">${c.team.players ? html`${perPlayer(c.estimate, c.team.players, cur)} a season<span class="sub">${perPlayer(c.estimate / 12, c.team.players, cur)} a month</span>` : "No squad yet"}</td><td class="c-state">${budgetBadge(c)}</td></tr>`;
}

/** The season's teams (`costs`), among the seasons any team was onboarded for (`seasons`, newest first). */
export function costsPage(p: { frame: AdminFrame; costs: TeamCosts[]; viewing: Viewing; minutesBought: number | null; now: Date; season: number; seasons: number[]; cur: Currency; rate: Rate; bill: Bill }): SafeHtml {
	const months = seasonMonths(p.season), nowMonth = monthOf(p.now.toISOString());
	// A past season's months are all spent: its last month stands where this month does, and every team's budget counts.
	const past = nowMonth > months[11]!, thisMonth = past ? months[11]! : nowMonth;
	const bars = monthBars(p.costs, months, thisMonth);
	// The running teams' budgets, against their own costs (a team closed mid-season has no budget to keep to).
	const budgeted = past ? p.costs : p.costs.filter((c) => c.team.status === "active");
	const budget = budgeted.length ? sum(budgeted, (c) => c.team.budget) : null;
	const board = costTiles({ costs: p.costs, budgeted, bars, thisMonth, past, cur: p.cur, minutesBought: p.minutesBought, billed: p.bill.rows.length > 0 });
	const seasonHref = (s: number) => `/admin/costs${s === p.seasons[0] ? "" : `?season=${s}`}`;
	const report = `/admin/costs/report.xlsx?season=${p.season}${p.cur === "usd" ? "&cur=usd" : ""}`;
	const seasons = html`<div class="costbar"><nav class="chips" aria-label="Season">${p.seasons.map((s) => html`<a class="chip" href="${seasonHref(s)}${p.cur === "usd" ? `${seasonHref(s).includes("?") ? "&" : "?"}cur=usd` : ""}"${s === p.season ? html` aria-current="true"` : ""}>${seasonLabel(s)}</a>`)}</nav>
<a class="btn" href="${report}" download>Download for Excel</a></div>`;
	const teams = p.costs.length ? html`<section class="panel stack"><h2>Each team</h2><div class="tablewrap cards"><table class="costs"><thead><tr><th>Team</th><th>This month</th><th>Its months</th><th>Season, estimated</th><th>Budget used</th><th>A player</th><th>Against budget</th></tr></thead>
<tbody>${p.costs.map((c) => teamRow(c, thisMonth, p.cur))}</tbody></table></div><p class="small">Its months: spent months solid, this month darkest, estimated months light. Budget used: the bar is spent so far, the tick where the season's estimate lands. A player: the season's estimate over the players in its squad, and a twelfth of that a month.</p></section>`
		: html`<div class="panel empty"><b>No teams this season.</b><p>A team's costs show here once it's onboarded.</p></div>`;
	return adminLayout({ title: "Costs", current: "costs", frame: p.frame, head: currencySwitch(p.cur, seasonHref(p.season), p.rate), lede: "What the teams cost on Cloudflare, a season at a time: month by month, against their budgets, a player a season and a month, and where it goes. Open a team for its own." },
		html`${seasons}${tiles(board)}<div class="costdash"><div class="cd-main">${monthsChart("Every team, month by month", bars, thisMonth, null, p.cur)}</div>
<div class="cd-side">${kindBars(bars, p.cur, thisMonth)}${usedThisMonth(p.costs, thisMonth, past ? `Used in ${shortMonth(thisMonth)}` : "Used this month")}</div>
<div class="cd-full">${billWidget(p.bill, { cur: p.cur, localPerUsd: p.rate.localPerUsd, bought: p.minutesBought })}</div>
<div class="cd-half">${burnUp(past ? "The teams against their budgets" : "The running teams against their budgets", monthBars(budgeted, months, thisMonth), budget, p.cur)}</div>
<div class="cd-half">${teamSeasons(p.costs, p.cur)}</div>
<div class="cd-full">${teamMonths(p.costs, bars, thisMonth, p.cur)}</div></div>${teams}${workings(p.viewing, p.minutesBought, p.rate)}`);
}
