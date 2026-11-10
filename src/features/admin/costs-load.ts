// Every team's costs as they stand, in US dollars, for Costs, Insights' Alerts and the 3am job's budget check: the
// database, Stream's storage bought, Cloudflare's minutes watched (costs-viewing.ts), the day's exchange rate, and
// Cloudflare's own bill (costs-bill.ts), which puts the months it has billed right.
import type { AppDeps } from "../../app/deps.ts";
import { seasonOf } from "../../shared/time.ts";
import { type Bill, loadBill } from "./costs-bill.ts";
import { billedMonths, freeWatchMinutes } from "./costs-bill-summary.ts";
import { type TeamCosts, teamCosts } from "./costs-estimate.ts";
import { inCurrency } from "./costs-currency.ts";
import { type Rate, dayRate } from "./costs-rate.ts";
import { costTeams, storedItems } from "./costs-repository.ts";
import { type Viewing, viewing } from "./costs-viewing.ts";
import { streamStorage } from "./platform-routes.ts";

export interface Costs { costs: TeamCosts[]; viewing: Viewing; minutesBought: number | null; rate: Rate; bill: Bill }

/** Every team's costs in the club's currency, as its budget is set: what the budget alert checks. */
export const inLocal = (c: Costs) => inCurrency(c.costs, "local", c.rate.localPerUsd);

export async function loadCosts(deps: AppDeps): Promise<Costs> {
	const now = deps.now();
	const [teams, items, storage, watched, rate, bill] = await Promise.all([costTeams(deps.db), storedItems(deps.db), streamStorage(deps), viewing(deps, seasonOf(now).start), dayRate(deps), loadBill(deps)]);
	const minutesBought = storage?.limitMinutes ?? null;
	const billed = bill.rows.length ? { months: billedMonths(bill.rows), freeMinutes: freeWatchMinutes(bill.rows) } : undefined;
	return { viewing: watched, minutesBought, rate, bill, costs: teamCosts({ teams, items, views: watched.views, now, minutesBoughtNow: minutesBought, bill: billed }) };
}
