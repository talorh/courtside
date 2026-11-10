// The Costs page's figures, a tile each, each saying whether it's actual (Cloudflare's bill, once it's been read) or
// estimated: this month and its change, the season so far and estimated (what's actual and what's estimated of it), the
// running teams' budgets, a player a season (and a month, and this month), and Stream's storage. A past season's are all
// spent: its last month, the season, and a player over it.
import type { Currency } from "../costs-currency.ts";
import { money } from "../costs-currency.ts";
import type { TeamCosts } from "../costs-estimate.ts";
import type { MonthCost } from "../costs-model.ts";
import { monthName } from "../costs-prices.ts";
import { changeOnLastMonth, type MonthBar } from "../costs-summary.ts";
import { monthSpark } from "./costs-burnup.ts";
import { shortMonth } from "./costs-charts.ts";
import { againstBudget, changeWords, lastMonthOf, perPlayer } from "./costs-words.ts";
import { ACTUAL, ESTIMATED, meter, NOT_BILLED, storageTile, type Tile } from "./costs-widgets.ts";

const sum = (costs: TeamCosts[], f: (c: TeamCosts) => number) => costs.reduce((s, c) => s + f(c), 0);

/** A team's month (`month`, 'YYYY-MM'), when it ran in it: a past season's last month, as well as this one. */
export const teamMonth = (c: TeamCosts, month: string): MonthCost | undefined => c.months.find((m) => m.month === month);

export function costTiles(o: { costs: TeamCosts[]; budgeted: TeamCosts[]; bars: MonthBar[]; thisMonth: string; past: boolean; cur: Currency; minutesBought: number | null; billed: boolean }): Tile[] {
	const m = money(o.cur), spent = o.billed ? ACTUAL : NOT_BILLED;
	const month = sum(o.costs, (c) => teamMonth(c, o.thisMonth)?.total ?? 0), soFar = sum(o.costs, (c) => c.soFar), estimate = sum(o.costs, (c) => c.estimate);
	const budget = o.budgeted.length ? sum(o.budgeted, (c) => c.team.budget) : null, budgetEstimate = sum(o.budgeted, (c) => c.estimate);
	// A player's figures are the teams with a squad, over their players: a team with none yet isn't put on another's.
	const squads = o.budgeted.filter((c) => c.team.players > 0), players = sum(squads, (c) => c.team.players);
	const squadsSeason = sum(squads, (c) => (o.past ? c.soFar : c.estimate)), squadsMonth = sum(squads, (c) => teamMonth(c, o.thisMonth)?.total ?? 0);
	const peak = o.bars.reduce((a, b) => (b.total > a.total ? b : a), o.bars[0]!);
	const first: Tile = { value: m(month), label: o.past ? `${monthName(o.thisMonth)}, its last month` : "This month, every team", pill: spent, note: changeWords(changeOnLastMonth(o.bars, o.thisMonth), lastMonthOf(o.thisMonth), o.cur), pic: monthSpark(o.bars, o.thisMonth) };
	const budgets: Tile = budget === null ? { value: "None", label: "Budgets", note: "No team is running" }
		: { value: m(budget), label: `Budgets, ${o.budgeted.length} ${o.budgeted.length === 1 ? "team" : "teams"}`, pill: ESTIMATED, note: againstBudget(budgetEstimate, budget, o.cur), pic: meter(budget ? budgetEstimate / budget : 1, budgetEstimate > budget ? "over" : "ok") };
	if (o.past) {
		return [first, { value: m(soFar), label: "The season", pill: spent, note: `Its biggest month: ${shortMonth(peak.month)}, ${m(peak.total)}` }, budgets,
			{ value: perPlayer(squadsSeason, players, o.cur), label: "A player, the season", pill: spent, note: players ? `${perPlayer(squadsSeason / 12, players, o.cur)} a month over twelve months` : "No team had a squad" }];
	}
	return [first,
		{ value: m(soFar), label: "This season so far", pill: spent, note: `${estimate ? Math.round((soFar / estimate) * 100) : 0}% of the season's estimate`, pic: meter(estimate ? soFar / estimate : 0) },
		{ value: m(estimate), label: "The season, estimated", pill: ESTIMATED, note: `${m(soFar)} ${o.billed ? "actual" : "spent"} and ${m(estimate - soFar)} estimated` },
		budgets,
		{ value: perPlayer(squadsSeason, players, o.cur), label: "A player a season", pill: ESTIMATED, note: players ? `${perPlayer(squadsSeason / 12, players, o.cur)} a month, ${perPlayer(squadsMonth, players, o.cur)} this month` : "Once a running team has a squad" },
		storageTile(o.costs, o.minutesBought),
	];
}
