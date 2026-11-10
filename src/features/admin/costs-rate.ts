import { CLUB } from "../../club.ts";
// The exchange rate Costs shows the club's currency at: the day's rate (platform/exchange-rates.ts), saved and read again
// when it's over six hours old; the one last saved when Frankfurter doesn't answer (asked again 15 minutes later), which
// is a problem only once what's saved is days old; a set rate before any's been read.
import { logProblem } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import { SET_LOCAL_PER_USD } from "./costs-prices.ts";
import { savedRate, saveRate } from "./costs-repository.ts";

/** `source` "now": just read; "saved": as last read (in the last six hours, or Frankfurter didn't answer); "set": none
 * read yet, so the set rate. */
export interface Rate { localPerUsd: number; date: string | null; source: "now" | "saved" | "set" }

const FRESH_MS = 6 * 3_600_000;
/** After Frankfurter doesn't answer, how long before it's asked again (meanwhile, the rate last saved). */
const RETRY_MS = 15 * 60_000;
/** A saved rate younger than this still does when Frankfurter doesn't answer (the rate moves little in days, and the
 * reference rate isn't set at weekends): a line in the Worker's logs, not a problem. */
const KEPT_MS = 3 * 86_400_000;

export async function dayRate(deps: AppDeps): Promise<Rate> {
	const saved = await savedRate(deps.db);
	const now = deps.now();
	if (saved && now.getTime() - Date.parse(saved.fetchedAt) < FRESH_MS) return { localPerUsd: saved.rate, date: saved.date, source: "saved" };
	try {
		const { localPerUsd, date } = await deps.rates.usdToLocal();
		await saveRate(deps.db, localPerUsd, date, now.toISOString());
		return { localPerUsd, date, source: "now" };
	} catch (err) {
		const kept = saved !== null && now.getTime() - Date.parse(saved.fetchedAt) < KEPT_MS;
		console.error(JSON.stringify({ event: kept ? "exchange_rate_kept" : "exchange_rate_failed", teamId: null, savedAt: saved?.fetchedAt ?? null, error: String(err) }));
		if (!kept) await logProblem(deps, { kind: "site_problem", teamId: null, what: `The day's exchange rate (US dollars to ${CLUB.currency.name}) couldn't be read for Costs`, error: err });
		// The saved rate counts as read a little before six hours ago, so the next ask is in 15 minutes, not every page.
		if (saved) await saveRate(deps.db, saved.rate, saved.date, new Date(now.getTime() - FRESH_MS + RETRY_MS).toISOString());
		return saved ? { localPerUsd: saved.rate, date: saved.date, source: "saved" } : { localPerUsd: SET_LOCAL_PER_USD, date: null, source: "set" };
	}
}
