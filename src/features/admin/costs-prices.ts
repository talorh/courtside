import { CLUB, onSubdomain } from "../../club.ts";
// What the Costs page charges with: Cloudflare's list prices for what the site has (the account's subscriptions:
// Workers Paid, the Images and Stream bundle, R2, and the domain), in US dollars; the baseline a team's season is
// estimated from; and the months it counts in (UTC months, as Cloudflare bills them).
import { MONTHS } from "../../shared/time.ts";

/** Cloudflare's list prices, in US dollars (what it bills in, and what the model counts in). The bundle includes the
 * first 1,000 minutes of Stream storage and 100,000 photos in Images. */
export const PRICES = {
	workersPaid: 5, bundle: 5, domainAYear: 14.2,
	streamStoredPer1000: 5, bundleMinutes: 1000, streamDeliveredPer1000: 1,
	r2GbMonth: 0.015, r2FreeGb: 10,
} as const;

/** Every team's season budget, in the club's currency, until one's set for it on its Costs page. */
export const DEFAULT_BUDGET_LOCAL = 200;

/** the club's currency to the US dollar until a day's rate has been read. */
export const SET_LOCAL_PER_USD = CLUB.currency.perUsd;

/** A team's season until its own figures say otherwise: 30 games of about an hour, nine families each watching each game
 * twice, three highlight clips a game. */
export const BASELINE = { games: 30, gameMinutes: 60, families: 9, viewsPerFamily: 2, clipsAGame: 3, clipMinutes: 0.5, originalGb: 5 } as const;

/** The domain's yearly fee: none on a subdomain of the club's own domain, which the club pays for anyway. */
export const domainAYear = () => (onSubdomain() ? 0 : PRICES.domainAYear);

/** The site's own fixed costs a month, shared between the teams running that month by the days each ran in it. */
export const fixedAMonth = () => PRICES.workersPaid + PRICES.bundle + domainAYear() / 12;

/** "2026-11" for the UTC month `iso` is in. */
export const monthOf = (iso: string) => iso.slice(0, 7);

/** The month's first instant, and the next month's. */
export function monthSpan(month: string): { start: string; end: string } {
	const [y = 0, m = 1] = month.split("-").map(Number);
	return { start: new Date(Date.UTC(y, m - 1, 1)).toISOString(), end: new Date(Date.UTC(y, m, 1)).toISOString() };
}

/** A season's twelve months: October of the year it starts to the September after. */
export const seasonMonths = (start: number) =>
	Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(start, 9 + i, 1)).toISOString().slice(0, 7));

const DAY_MS = 86_400_000;

/** How much of `month` the span from `from` to `to` (null: still going) covers, 0 to 1. */
export function shareOfMonth(month: string, from: string, to: string | null): number {
	const { start, end } = monthSpan(month);
	const a = Math.max(Date.parse(from), Date.parse(start)), b = Math.min(to ? Date.parse(to) : Infinity, Date.parse(end));
	return b > a ? (b - a) / (Date.parse(end) - Date.parse(start)) : 0;
}

export const addMs = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY_MS).toISOString();

/** "Nov 2026". */
export function monthName(month: string): string {
	const [y, m = 1] = month.split("-");
	return `${MONTHS[Number(m) - 1]} ${y}`;
}
