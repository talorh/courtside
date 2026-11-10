// The Costs pages' figures for their charts: months added up across teams (each kind of cost on its own), the season
// running total, the season by kind of cost, and the change on last month. Pure: from costs-estimate.ts's months.
import type { TeamCosts } from "./costs-estimate.ts";
import type { MonthCost } from "./costs-model.ts";

/** The kinds of cost, in the order they stack (bottom first), and their names. */
export const KINDS = [
	{ key: "shared", name: "Shared" }, { key: "storage", name: "Video storage" }, { key: "viewing", name: "Watching" }, { key: "uploads", name: "Uploads (R2)" },
] as const;
export type Kind = (typeof KINDS)[number]["key"];

/** A month's dollars by kind, its total, whether it's estimated, and on how many of its days Cloudflare's bill stands. */
export interface MonthBar { month: string; estimate: boolean; parts: Record<Kind, number>; total: number; billedDays: number }

const bar = (m: MonthCost): MonthBar => ({ month: m.month, estimate: m.estimate, total: m.total, billedDays: m.billedDays, parts: { shared: m.shared, storage: m.storage, viewing: m.viewing, uploads: m.uploads } });

/** One team's months, or every team's added up, in `months` order (a month no team has is nothing). */
export function monthBars(costs: TeamCosts[], months: string[], thisMonth: string): MonthBar[] {
	return months.map((month) => {
		const all = costs.flatMap((c) => c.months.filter((m) => m.month === month)).map(bar);
		const parts = { shared: 0, storage: 0, viewing: 0, uploads: 0 };
		for (const b of all) for (const k of KINDS) parts[k.key] += b.parts[k.key];
		return { month, estimate: month > thisMonth, parts, total: all.reduce((s, b) => s + b.total, 0), billedDays: Math.max(0, ...all.map((b) => b.billedDays)) };
	});
}

/** The running total at each month's end. */
export function runningTotal(bars: MonthBar[]): number[] {
	let sum = 0;
	return bars.map((b) => (sum += b.total));
}

/** The season by kind of cost, biggest first. */
export function byKind(bars: MonthBar[]): Array<{ key: Kind; name: string; dollars: number; share: number }> {
	const total = bars.reduce((s, b) => s + b.total, 0);
	return KINDS.map((k) => {
		const dollars = bars.reduce((s, b) => s + b.parts[k.key], 0);
		return { key: k.key, name: k.name, dollars, share: total ? dollars / total : 0 };
	}).sort((a, b) => b.dollars - a.dollars);
}

/** This month against last month: null when last month cost nothing (or isn't in the season). */
export function changeOnLastMonth(bars: MonthBar[], thisMonth: string): { dollars: number; share: number } | null {
	const i = bars.findIndex((b) => b.month === thisMonth);
	const now = bars[i], last = bars[i - 1];
	if (!now || !last || !last.total) return null;
	return { dollars: now.total - last.total, share: (now.total - last.total) / last.total };
}
