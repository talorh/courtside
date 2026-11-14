// Cloudflare's bill (platform/cloudflare-billing.ts) as Costs reads it: each product's free allowance, from its name as
// Cloudflare words it; the billing period's use of each product against that, and what it was billed; the bill summed
// by calendar month (watching, R2 and the rest, and the days it covers), to put in place of the model's own figures; and
// the watching the plan includes, learned from what Cloudflare charged for it. Pure.
import type { BilledRow } from "../../platform/cloudflare-billing.ts";
import { PRICES } from "./costs-prices.ts";

const SCALE: Record<string, number> = { k: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };

/** "(first 10M are included)", "(First 3,000 emails included)", "(6000 minutes included per month)", "(GB*S, First
 * 400,000 GB*S is included)": 10,000,000, 3,000, 6,000, 400,000. Null when the name says no allowance. */
export function allowanceOf(service: string): number | null {
	const m = /\(\s*(?:[^()]*?\bfirst\s+)?([\d,.]+)\s*(?:(k|m|million|b|billion)\b)?[^)]*?\bincluded\b/i.exec(service);
	if (!m) return null;
	const n = Number(m[1]!.replace(/,/g, ""));
	return Number.isFinite(n) ? n * (SCALE[(m[2] ?? "").toLowerCase()] ?? 1) : null;
}

/** A product's name without its allowance or its unit in brackets: "Workers Standard Requests". */
const nameOf = (service: string) => service.replace(/\s*\([^)]*\)\s*$/, "").trim();

const SECONDS: Record<string, number> = { second: 1, minute: 60, hour: 3600 };
const timeIn = (text: string) => /\b(?:GiB|GB|vCPU)?[- ]?(second|minute|hour)s?\b/i.exec(text)?.[1]?.toLowerCase();

/** How many of the product's own units its allowance's one is: a product counted in GiB-seconds with an allowance in
 * GiB-hours (containers) is 3,600; 1 where they're the same, or either names no time. */
function allowanceScale(service: string, unit: string): number {
	const allowed = timeIn(/\(([^)]*)\)\s*$/.exec(service)?.[1] ?? ""), counted = timeIn(unit) ?? timeIn(nameOf(service));
	return allowed && counted ? SECONDS[allowed]! / SECONDS[counted]! : 1;
}

export interface Product { service: string; name: string; family: string; used: number; allowance: number | null; unit: string; billed: number }

/** The newest billing period's products, in the order Cloudflare first listed them; and the period's first and last day. */
export function periodProducts(rows: BilledRow[]): { periodStart: string | null; lastDay: string | null; products: Product[] } {
	const periodStart = rows.reduce<string | null>((p, r) => (p && p > r.periodStart ? p : r.periodStart), null);
	const mine = rows.filter((r) => r.periodStart === periodStart);
	const products = new Map<string, Product>();
	for (const r of mine) {
		const allowance = allowanceOf(r.service);
		const p = products.get(r.service) ?? { service: r.service, name: nameOf(r.service), family: r.family, used: 0, allowance: allowance === null ? null : allowance * allowanceScale(r.service, r.unit), unit: r.unit, billed: 0 };
		p.used += r.quantity;
		p.billed += r.billed;
		products.set(r.service, p);
	}
	const lastDay = mine.reduce<string | null>((d, r) => (d && d > r.day ? d : r.day), null);
	return { periodStart, lastDay, products: [...products.values()] };
}

/** Stream's minutes watched (as the bill names them). */
export const isWatching = (r: { family: string; service: string }) => r.family === "Stream" && /minutes of video viewed/i.test(r.service);

/** What Cloudflare billed in a calendar month (US$): for watching, for R2 (the originals), and everything else; and on
 * how many of the month's days. */
export interface BilledMonth { watching: number; uploads: number; other: number; days: number }

export function billedMonths(rows: BilledRow[]): Map<string, BilledMonth> {
	const months = new Map<string, BilledMonth & { seen: Set<string> }>();
	for (const r of rows) {
		const key = r.day.slice(0, 7);
		const m = months.get(key) ?? { watching: 0, uploads: 0, other: 0, days: 0, seen: new Set<string>() };
		if (isWatching(r)) m.watching += r.billed;
		else if (r.family === "R2") m.uploads += r.billed;
		else m.other += r.billed;
		m.seen.add(r.day);
		months.set(key, m);
	}
	return new Map([...months].map(([k, { seen, ...m }]) => [k, { ...m, days: seen.size }]));
}

/** The minutes of watching a billing period includes, as far as the bill shows: a period's minutes less the ones it
 * charged for (at Stream's price), the most of any period. While nothing's been charged it's at least what was watched. */
export function freeWatchMinutes(rows: BilledRow[]): number {
	const periods = new Map<string, { minutes: number; billed: number }>();
	for (const r of rows.filter(isWatching)) {
		const p = periods.get(r.periodStart) ?? { minutes: 0, billed: 0 };
		p.minutes += r.quantity;
		p.billed += r.billed;
		periods.set(r.periodStart, p);
	}
	const perMinute = PRICES.streamDeliveredPer1000 / 1000;
	return Math.max(0, ...[...periods.values()].map((p) => Math.round(p.minutes - p.billed / perMinute)));
}
