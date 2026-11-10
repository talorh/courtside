import { CLUB } from "../../club.ts";
// Costs' report for Excel: the season the page shows, in its currency, as a workbook of numbers Excel can add up: the
// figures (as the tiles have them, each actual or estimated), each team (as its row), each team's months by kind of
// cost (a row a month, to sort and pivot), the teams month by month (as Team by team), and Cloudflare's bill's days in
// the season (in US dollars, as it bills).
import { formatGameDate, formatShortDate, localTime, seasonLabel } from "../../shared/time.ts";
import type { Sheet } from "../../shared/xlsx.ts";
import { teamLabel } from "../teams/team-code.ts";
import { budgetLevel, type BudgetLevel } from "./budget-checks.ts";
import type { Bill } from "./costs-bill.ts";
import type { Currency } from "./costs-currency.ts";
import type { TeamCosts } from "./costs-estimate.ts";
import type { MonthCost } from "./costs-model.ts";
import { monthName, monthOf, seasonMonths } from "./costs-prices.ts";
import type { Rate } from "./costs-rate.ts";

export interface ReportInput { costs: TeamCosts[]; season: number; cur: Currency; rate: Rate; bill: Bill; now: Date }

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const STANDING: Record<BudgetLevel, string> = { none: "Season over", ok: "Within budget", warn: "On track to go over", urgent: "Over budget" };
const monthOfTeam = (c: TeamCosts, month: string): MonthCost | undefined => c.months.find((m) => m.month === month);

/** A month as Costs sees it: to come (estimated), billed by Cloudflare (all of it or part), or spent but not billed. */
function kind(m: MonthCost): string {
	if (m.estimate) return "Estimated";
	if (m.billed >= 0.999) return "Actual";
	return m.billed > 0 ? "Partly actual" : "Spent, not billed";
}

function lines(p: ReportInput): string[] {
	const money = p.cur === "usd" ? "In US dollars, as Cloudflare bills"
		: `In ${CLUB.currency.name}: 1 USD = ${p.rate.localPerUsd.toFixed(4)} ${CLUB.currency.code}${p.rate.date ? `, the European Central Bank's rate for ${formatShortDate(`${p.rate.date}T00:00`)} ${p.rate.date.slice(0, 4)}` : ", a set rate"}`;
	return [`${money}.`, `Made ${formatGameDate(localTime(p.now))}, local time.`,
		"Actual: Cloudflare's own bill. Estimated: the site's estimate, for the months to come. A team's own storage, watching and uploads are its own; the site's fixed costs are shared by the days each team ran in the month."];
}

function summary(p: ReportInput, past: boolean, thisMonth: string): Sheet {
	const billed = p.bill.rows.length > 0, spent = billed ? "Actual" : "Spent, not billed";
	const budgeted = past ? p.costs : p.costs.filter((c) => c.team.status === "active");
	const squads = budgeted.filter((c) => c.team.players > 0), players = sum(squads, (c) => c.team.players);
	const squadsSeason = sum(squads, (c) => (past ? c.soFar : c.estimate)), budget = sum(budgeted, (c) => c.team.budget);
	const each = (n: number) => (players ? n / players : Number.NaN);
	const month = sum(p.costs, (c) => monthOfTeam(c, thisMonth)?.total ?? 0), estimate = sum(p.costs, (c) => c.estimate);
	const rows: Array<[string, number, string, string]> = [
		[past ? `${monthName(thisMonth)}, its last month` : "This month, every team", month, spent, ""],
		[past ? "The season" : "This season so far", sum(p.costs, (c) => c.soFar), spent, ""],
		...(past ? [] : [["The season, estimated", estimate, "Estimated", "What's spent so far and the estimate of the months to come"] as [string, number, string, string]]),
		[`Budgets, ${budgeted.length} ${budgeted.length === 1 ? "team" : "teams"}`, budget, "Set", past ? "Every team's" : "The running teams'"],
		["Against the budgets", sum(budgeted, (c) => c.estimate) - budget, past ? spent : "Estimated", "Over the budgets when more than nothing, under when less"],
		[past ? "A player, the season" : "A player a season", each(squadsSeason), past ? spent : "Estimated", `${players} players in the teams with a squad`],
		["A player a month", each(squadsSeason / 12), past ? spent : "Estimated", "A twelfth of a player's season"],
	];
	if (!past) rows.push(["A player, this month", each(sum(squads, (c) => monthOfTeam(c, thisMonth)?.total ?? 0)), spent, ""]);
	return { name: "Summary", title: `${CLUB.siteName} costs, ${seasonLabel(p.season)} season`, details: lines(p),
		columns: [{ title: "Figure", width: 30 }, { title: "Amount", width: 14, format: "money" }, { title: "Actual or estimated", width: 20 }, { title: "Note", width: 60 }], rows };
}

function teams(p: ReportInput, thisMonth: string): Sheet {
	const money = (title: string) => ({ title, width: 14, format: "money" as const }), share = (title: string) => ({ title, width: 14, format: "percent" as const });
	const rows = p.costs.map((c) => {
		const b = c.team.budget, players = c.team.players;
		return [teamLabel(c.team), c.team.status === "active" ? "Running" : "Season over", c.games, players, monthOfTeam(c, thisMonth)?.total ?? 0, c.soFar, c.estimate, b,
			b ? c.soFar / b : Number.NaN, b ? c.estimate / b : Number.NaN, players ? c.estimate / players : Number.NaN, players ? c.estimate / 12 / players : Number.NaN, STANDING[budgetLevel(c)]];
	});
	return { name: "Teams", title: `Each team, ${seasonLabel(p.season)}`, details: ["A player: the season's estimate over the players in its squad, and a twelfth of that a month."],
		columns: [{ title: "Team", width: 18 }, { title: "Status", width: 12 }, { title: "Games with a video", width: 10, format: "count" }, { title: "Players", width: 9, format: "count" },
			money("This month"), money("Season so far"), money("Season, estimated"), money("Budget"), share("Budget used so far"), share("Budget used, estimated"),
			money("A player a season"), money("A player a month"), { title: "Against budget", width: 20 }], rows };
}

function months(p: ReportInput): Sheet {
	const money = (title: string) => ({ title, width: 12, format: "money" as const });
	const rows = p.costs.flatMap((c) => c.months.map((m) => [teamLabel(c.team), `${monthName(m.month)}`, kind(m), m.storage, m.viewing, m.uploads, m.shared, m.total, m.use.stored, m.use.watched]));
	return { name: "Months", title: `Each team's months, ${seasonLabel(p.season)}`, details: ["A row a team's month, to sort, filter or pivot. Minutes stored: in Stream at any time in the month."],
		columns: [{ title: "Team", width: 18 }, { title: "Month", width: 12 }, { title: "Actual or estimated", width: 18 }, money("Storage"), money("Watching"), money("Uploads"), money("Shared"), money("Total"),
			{ title: "Minutes stored", width: 12, format: "count" }, { title: "Minutes watched", width: 12, format: "count" }], rows };
}

function grid(p: ReportInput, thisMonth: string): Sheet {
	const season = seasonMonths(p.season), sorted = [...p.costs].sort((a, b) => b.estimate - a.estimate);
	const total = (c: TeamCosts, m: string) => monthOfTeam(c, m)?.total ?? 0;
	const rows = [...sorted.map((c) => [teamLabel(c.team), ...season.map((m) => total(c, m)), c.estimate]),
		["Every team", ...season.map((m) => sum(p.costs, (c) => total(c, m))), sum(p.costs, (c) => c.estimate)]];
	return { name: "Team by team", title: `Team by team, ${seasonLabel(p.season)}`, details: [`Months after ${monthName(thisMonth)} are estimated.`],
		columns: [{ title: "Team", width: 18 }, ...season.map((m) => ({ title: monthName(m), width: 11, format: "money" as const })), { title: "Season", width: 12, format: "money" }], rows };
}

function bill(p: ReportInput): Sheet {
	const season = seasonMonths(p.season);
	const rows = p.bill.rows.filter((r) => season.includes(r.day.slice(0, 7))).sort((a, b) => a.day.localeCompare(b.day) || a.service.localeCompare(b.service))
		.map((r) => [r.day, r.service, r.family, r.quantity, r.billable, r.unit, r.billed, r.periodStart]);
	const read = p.bill.savedAt ? `Read from Cloudflare ${formatGameDate(localTime(new Date(p.bill.savedAt)))}.` : "Not read from Cloudflare yet.";
	return { name: "Cloudflare bill", title: "Cloudflare's bill, a row a day and product", details: [`${read} In US dollars. Usage only: the plans' fees aren't in it.`],
		columns: [{ title: "Day", width: 12 }, { title: "Product", width: 22 }, { title: "Kind", width: 22 }, { title: "Used", width: 12, format: "decimal" }, { title: "Charged for", width: 12, format: "decimal" },
			{ title: "Unit", width: 14 }, { title: "Charged (US$)", width: 13, format: "money" }, { title: "Billing period from", width: 14 }], rows };
}

/** The workbook's sheets, in order. */
export function costReport(p: ReportInput): Sheet[] {
	const season = seasonMonths(p.season), nowMonth = monthOf(p.now.toISOString());
	const past = nowMonth > season[11]!, thisMonth = past ? season[11]! : nowMonth;
	return [summary(p, past, thisMonth), teams(p, thisMonth), months(p), grid(p, thisMonth), bill(p)];
}
