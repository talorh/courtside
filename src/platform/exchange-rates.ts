import { CLUB } from "../club.ts";
// The day's exchange rate, US dollars to the club's currency, for Costs: the European Central Bank's reference rate, from
// Frankfurter (free, no key; a working day's rate, published each afternoon in Europe). Thin, like every platform client.

interface ExchangeRate { localPerUsd: number; date: string }
export interface ExchangeRates { usdToLocal(): Promise<ExchangeRate> }

const urlLatest = () => `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${CLUB.currency.code}`;

export function createExchangeRates(o: { fetch?: typeof fetch } = {}): ExchangeRates {
	const doFetch = o.fetch ?? fetch;
	return {
		async usdToLocal() {
			const res = await doFetch(urlLatest(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
			const body = (await res.json().catch(() => ({}))) as { date?: unknown; rates?: Record<string, unknown> };
			const rate = body.rates?.[CLUB.currency.code], date = body.date;
			// A rate far from any the currency has had (a tenth of a US dollar to five) is a broken answer, not a rate.
			if (!res.ok || typeof rate !== "number" || rate < 0.1 || rate > 5 || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
				throw new Error(`Frankfurter: no USD to ${CLUB.currency.code} rate (HTTP ${res.status})`);
			}
			return { localPerUsd: rate, date };
		},
	};
}
