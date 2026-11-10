// What each team costs a month. A team's own use is priced at Cloudflare's rates: Stream storage the
// account buys past the bundle (shared out by the minutes each team stores), minutes watched, and R2 for its originals
// past the free 10 GB (by each team's share). The site's fixed costs (Workers Paid, the bundle, the domain) and minutes
// watched that no team has are shared between the teams running that month, by the days each ran in it.
import { addMs, fixedAMonth, PRICES, shareOfMonth } from "./costs-prices.ts";
import type { CostTeam, SavedViews, StoredItem } from "./costs-repository.ts";

/** One team's use in a month: minutes stored at any time in it, GB-months of originals, minutes watched. */
export interface Usage { stored: number; gbMonths: number; watched: number }

/** `billed`: how much of the month so far Cloudflare's bill covers, 0 to 1, and `billedDays` its days (costs-reconcile.ts):
 * those days' figures are its own; the rest are the model's. */
export interface MonthCost { month: string; estimate: boolean; storage: number; viewing: number; uploads: number; shared: number; total: number; billed: number; billedDays: number; use: Usage }

const GB = 1024 ** 3;
/** R2 keeps an original 30 days (its lifecycle rule). */
const ORIGINAL_DAYS = 30;

function usageIn(month: string, teamId: string, items: StoredItem[], views: SavedViews[]): Usage {
	let stored = 0, gbMonths = 0;
	for (const i of items) {
		if (i.teamId !== teamId) continue;
		if (shareOfMonth(month, i.createdAt, i.deletedAt) > 0) stored += i.minutes;
		if (i.bytes) {
			const gone = addMs(i.createdAt, ORIGINAL_DAYS);
			gbMonths += (i.bytes / GB) * shareOfMonth(month, i.createdAt, i.deletedAt && i.deletedAt < gone ? i.deletedAt : gone);
		}
	}
	const watched = views.filter((v) => v.month === month && v.teamId === teamId).reduce((s, v) => s + v.minutes, 0);
	return { stored, gbMonths, watched };
}

/** How much of `month` the team ran in, 0 to 1: from when it was onboarded to when it closed. */
export const runningShare = (month: string, t: CostTeam) => shareOfMonth(month, t.createdAt, t.closedAt);

/**
 * A month's bill shared out. `uses`: each team's use; `running`: the teams that share the fixed costs, each by how much
 * of the month it ran (1: all of it); `unmatched`: minutes watched no team has; `minutesBought`: Stream's storage bought
 * (null: as much as the month's minutes need); `freeMinutes`: minutes of watching the plan includes a month (as
 * Cloudflare's bill shows them, costs-bill-summary.ts), which cost nothing.
 */
export function allocate(month: string, o: { uses: Map<string, Usage>; running: Map<string, number>; unmatched: number; minutesBought: number | null; estimate: boolean; freeMinutes?: number }): Map<string, MonthCost> {
	const all = [...o.uses.values()];
	const stored = all.reduce((s, u) => s + u.stored, 0), gb = all.reduce((s, u) => s + u.gbMonths, 0);
	const blocks = Math.max(1, Math.ceil((o.minutesBought ?? stored) / PRICES.bundleMinutes));
	const extraStorage = (blocks - 1) * PRICES.streamStoredPer1000;
	const r2 = Math.max(0, gb - PRICES.r2FreeGb) * PRICES.r2GbMonth;
	const days = [...o.running.values()].reduce((s, w) => s + w, 0);
	// The plan's free watching comes off every minute watched alike, a team's and those no team has.
	const watchedAll = all.reduce((s, u) => s + u.watched, 0) + o.unmatched;
	const paid = watchedAll && o.freeMinutes ? Math.max(0, watchedAll - o.freeMinutes) / watchedAll : 1;
	const shared = days ? (fixedAMonth() + (o.unmatched * paid * PRICES.streamDeliveredPer1000) / 1000) / days : 0;
	const out = new Map<string, MonthCost>();
	for (const [teamId, use] of o.uses) {
		const storage = stored ? (extraStorage * use.stored) / stored : 0;
		const uploads = gb ? (r2 * use.gbMonths) / gb : 0;
		const viewing = (use.watched * paid * PRICES.streamDeliveredPer1000) / 1000;
		const share = shared * (o.running.get(teamId) ?? 0);
		out.set(teamId, { month, estimate: o.estimate, storage, viewing, uploads, shared: share, total: storage + viewing + uploads + share, billed: 0, billedDays: 0, use });
	}
	return out;
}

/** Each team's months so far, from the first month any team's season has to this one. */
export function actualMonths(p: { months: string[]; teams: CostTeam[]; items: StoredItem[]; views: SavedViews[]; thisMonth: string; minutesBoughtNow: number | null; freeMinutes?: number }): Map<string, MonthCost>[] {
	return p.months.map((month) => {
		const uses = new Map(p.teams.map((t) => [t.id, usageIn(month, t.id, p.items, p.views)]));
		// A deleted team's minutes stay its own (and off the page); only those no team ever had are shared.
		const unmatched = p.views.filter((v) => v.month === month && v.teamId === "").reduce((s, v) => s + v.minutes, 0);
		return allocate(month, {
			uses, unmatched, estimate: false, running: new Map(p.teams.map((t) => [t.id, runningShare(month, t)] as const).filter(([, w]) => w > 0)),
			minutesBought: month === p.thisMonth ? p.minutesBoughtNow : null, freeMinutes: p.freeMinutes ?? 0,
		});
	});
}
