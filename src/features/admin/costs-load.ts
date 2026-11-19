// Every team's costs as they stand, in US dollars, for Costs, Insights' Alerts and the 3am job's budget check: the
// database, Stream's storage bought (noted as this month's, for when it's over), Cloudflare's minutes watched (costs-viewing.ts), the day's exchange rate,
// Cloudflare's own bill (costs-bill.ts), which puts the months it has billed right, and the months saved once over
// (costs-saved.ts).
import { type AppDeps, afterwards } from "../../app/deps.ts";
import { seasonOf } from "../../shared/time.ts";
import { type Bill, loadBill } from "./costs-bill.ts";
import { billedMonths, freeWatchMinutes } from "./costs-bill-summary.ts";
import { type TeamCosts, teamCosts } from "./costs-estimate.ts";
import { inCurrency } from "./costs-currency.ts";
import { monthOf } from "./costs-prices.ts";
import { type Rate, dayRate } from "./costs-rate.ts";
import { boughtByMonth, costTeams, noteBought, savedMonths, storedItems } from "./costs-repository.ts";
import { byMonth } from "./costs-saved.ts";
import { type Viewing, viewing } from "./costs-viewing.ts";
import { streamStorage } from "./platform-routes.ts";

/** `saved`: the months saved once they were over (costs-saved.ts). */
export interface Costs { costs: TeamCosts[]; viewing: Viewing; minutesBought: number | null; rate: Rate; bill: Bill; saved: Set<string> }

/** Every team's costs in the club's currency, as its budget is set: what the budget alert checks. */
export const inLocal = (c: Costs) => inCurrency(c.costs, "local", c.rate.localPerUsd);

export async function loadCosts(deps: AppDeps): Promise<Costs> {
	const now = deps.now();
	const [teams, items, storage, watched, rate, bill, kept, bought] = await Promise.all([costTeams(deps.db), storedItems(deps.db), streamStorage(deps), viewing(deps, seasonOf(now).start), dayRate(deps), loadBill(deps), savedMonths(deps.db), boughtByMonth(deps.db)]);
	const minutesBought = storage?.limitMinutes ?? null;
	// A note that fails is logged, never failing the page: the month's next view notes it.
	if (minutesBought !== null) {
		await afterwards(deps, noteBought(deps.db, monthOf(now.toISOString()), minutesBought, now.toISOString())
			.catch((err: unknown) => console.error(JSON.stringify({ event: "stream_bought_failed", teamId: null, error: String(err) }))));
	}
	const billed = bill.rows.length ? { months: billedMonths(bill.rows), freeMinutes: freeWatchMinutes(bill.rows) } : undefined;
	const saved = byMonth(kept);
	return { viewing: watched, minutesBought, rate, bill, saved: new Set(saved.keys()), costs: teamCosts({ teams, items, views: watched.views, now, minutesBoughtNow: minutesBought, bought, bill: billed, saved }) };
}
