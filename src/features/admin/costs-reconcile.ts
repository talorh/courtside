// The model's month put right by Cloudflare's bill (costs-bill-summary.ts billedMonths): for the days the bill covers,
// what Cloudflare charged for watching and for R2 stands in place of the model's own, shared out between the teams as the
// model shares them (by minutes watched, by GB of originals); what else it charged (the database, the Worker, Workers AI,
// emails) is shared like the fixed costs, by the days each team ran. The days it doesn't cover yet keep the model's
// figures. Storage bought and the plan's fees aren't in the bill: they stay at their price.
import type { BilledMonth } from "./costs-bill-summary.ts";
import type { MonthCost } from "./costs-model.ts";

const sum = (costs: MonthCost[], f: (c: MonthCost) => number) => costs.reduce((s, c) => s + f(c), 0);

/** `elapsedDays`: the month's days so far (all of a past month's). */
export function reconcile(month: Map<string, MonthCost>, billed: BilledMonth | undefined, elapsedDays: number): Map<string, MonthCost> {
	if (!billed || !billed.days) return month;
	const costs = [...month.values()];
	const cover = Math.min(1, billed.days / Math.max(1, elapsedDays)), rest = 1 - cover;
	const viewing = sum(costs, (c) => c.viewing), uploads = sum(costs, (c) => c.uploads), shared = sum(costs, (c) => c.shared);
	// What's charged with nothing of the model's to share it by goes with the shared costs (or evenly, with none of those).
	const byShared = (c: MonthCost) => (shared ? c.shared / shared : 1 / costs.length);
	const out = new Map<string, MonthCost>();
	for (const [team, c] of month) {
		const v = viewing ? billed.watching * (c.viewing / viewing) : 0, u = uploads ? billed.uploads * (c.uploads / uploads) : 0;
		const extra = (billed.other + (viewing ? 0 : billed.watching) + (uploads ? 0 : billed.uploads)) * byShared(c);
		const next = { ...c, viewing: v + c.viewing * rest, uploads: u + c.uploads * rest, shared: c.shared + extra, billed: cover, billedDays: billed.days };
		out.set(team, { ...next, total: next.storage + next.viewing + next.uploads + next.shared });
	}
	return out;
}
