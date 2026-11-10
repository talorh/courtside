// Costs in either currency: Cloudflare's own US dollars, or the club's currency at the day's rate. The model counts in
// US dollars; a page turns every dollar it shows into the one asked for, and a team's budget (set in Australian
// dollars) into the same, so the two are always compared like for like.
import type { TeamCosts } from "./costs-estimate.ts";
import type { MonthCost } from "./costs-model.ts";

export type Currency = "local" | "usd";

/** The currency a page asks for (`?cur=usd`); the club's currency unless it says US. */
export const currencyOf = (url: URL): Currency => (url.searchParams.get("cur") === "usd" ? "usd" : "local");

/** "$1,234.50", in whichever currency the page is in (its switch says which: no A or US before a figure). */
export const money = (_cur: Currency) => (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** Every team's costs in `cur`: US dollars as they are, or each dollar at `localPerUsd`; budgets (the club's currency) to
 * match. */
export function inCurrency(costs: TeamCosts[], cur: Currency, localPerUsd: number): TeamCosts[] {
	const k = cur === "local" ? localPerUsd : 1;
	const month = (m: MonthCost): MonthCost => ({ ...m, storage: m.storage * k, viewing: m.viewing * k, uploads: m.uploads * k, shared: m.shared * k, total: m.total * k });
	return costs.map((c) => ({
		...c, months: c.months.map(month), thisMonth: c.thisMonth && month(c.thisMonth), soFar: c.soFar * k, estimate: c.estimate * k,
		team: { ...c.team, budget: cur === "local" ? c.team.budget : c.team.budget / localPerUsd },
	}));
}
