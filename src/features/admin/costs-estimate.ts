// Each team's season: its months so far (costs-model.ts), then an estimate of the months left. A running team's games
// left (30 a season, less those with a video) are spread evenly over its months left, each adding its video and three
// clips to what it stores, its minutes watched and its original in R2. The team's own figures stand in for the baseline
// once it has three games with a video (one short test isn't a season): its videos' and clips' length, its originals'
// size, and minutes watched a game. Cloudflare's bill, when there is one, puts the months it has billed right
// (costs-reconcile.ts), and the plan's free watching it shows comes off the months to come.
import type { BilledMonth } from "./costs-bill-summary.ts";
import { BASELINE, monthOf, monthSpan, seasonMonths } from "./costs-prices.ts";
import { actualMonths, allocate, type MonthCost, runningShare, type Usage } from "./costs-model.ts";
import { reconcile } from "./costs-reconcile.ts";
import type { CostTeam, SavedViews, StoredItem } from "./costs-repository.ts";

export interface TeamCosts {
	team: CostTeam; months: MonthCost[]; thisMonth: MonthCost | null; soFar: number; estimate: number;
	/** Games with a video this season, and what a game left is estimated at. */
	games: number; perGame: { minutes: number; clipMinutes: number; watched: number; gb: number; own: { length: boolean; watched: boolean } };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
/** Games with a video before a team's own figures replace the baseline. */
const OWN_AFTER = 3;
const GB = 1024 ** 3;

function perGame(t: CostTeam, items: StoredItem[], views: SavedViews[], season: string[], thisMonth: string) {
	const own = items.filter((i) => i.teamId === t.id && season.includes(monthOf(i.createdAt)));
	// Its games: videos still on the site (a test, or one deleted, isn't a game; it still counted while it was stored).
	const videos = own.filter((i) => i.kind === "video" && i.deletedAt === null);
	const enough = videos.length >= OWN_AFTER;
	const length = enough ? avg(videos.map((v) => v.minutes)) : null, clip = enough ? avg(own.filter((i) => i.kind === "clip" && i.deletedAt === null).map((c) => c.minutes)) : null;
	const watchedSoFar = views.filter((v) => v.teamId === t.id && season.includes(v.month) && v.month <= thisMonth).reduce((s, v) => s + v.minutes, 0);
	const minutes = length ?? BASELINE.gameMinutes;
	const ownWatched = enough && watchedSoFar > 0;
	const watched = ownWatched ? watchedSoFar / videos.length : minutes * BASELINE.families * BASELINE.viewsPerFamily;
	const gb = (enough ? avg(videos.filter((v) => v.bytes).map((v) => v.bytes / GB)) : null) ?? BASELINE.originalGb;
	return { games: videos.length, perGame: { minutes, clipMinutes: clip ?? BASELINE.clipMinutes, watched, gb, own: { length: length !== null, watched: ownWatched } } };
}

/** Cloudflare's bill by calendar month, and the minutes of watching a month it shows the plan includes. */
export interface BillForCosts { months: Map<string, BilledMonth>; freeMinutes: number }

/** A month's days so far: all of a past month's; this month's to today (UTC, as Cloudflare bills). */
const daysSoFar = (month: string, thisMonth: string, now: Date) =>
	month < thisMonth ? Math.round((Date.parse(monthSpan(month).end) - Date.parse(monthSpan(month).start)) / 86_400_000) : now.getUTCDate();

export function teamCosts(p: { teams: CostTeam[]; items: StoredItem[]; views: SavedViews[]; now: Date; minutesBoughtNow: number | null; bill?: BillForCosts }): TeamCosts[] {
	const thisMonth = monthOf(p.now.toISOString());
	const months = [...new Set(p.teams.flatMap((t) => seasonMonths(t.seasonStart)))].sort();
	const past = months.filter((m) => m <= thisMonth);
	const freeMinutes = p.bill?.freeMinutes ?? 0;
	const actual = actualMonths({ months: past, teams: p.teams, items: p.items, views: p.views, thisMonth, minutesBoughtNow: p.minutesBoughtNow, freeMinutes })
		.map((m, i) => reconcile(m, p.bill?.months.get(past[i]!), daysSoFar(past[i]!, thisMonth, p.now)));
	const basis = new Map(p.teams.map((t) => [t.id, perGame(t, p.items, p.views, seasonMonths(t.seasonStart), thisMonth)]));
	// Each running team's games left, a month, over its months left; and what it stores this month, to build on.
	const ahead = new Map(p.teams.map((t) => {
		const left = seasonMonths(t.seasonStart).filter((m) => m > thisMonth);
		const games = t.status === "active" && left.length ? Math.max(0, BASELINE.games - basis.get(t.id)!.games) / left.length : 0;
		return [t.id, { left, games, stored: actual.at(-1)?.get(t.id)?.use.stored ?? 0 }];
	}));
	const future = months.filter((m) => m > thisMonth).map((month) => {
		const uses = new Map<string, Usage>();
		for (const t of p.teams) {
			const a = ahead.get(t.id)!, b = basis.get(t.id)!.perGame;
			const n = a.left.indexOf(month) + 1;
			if (!n) continue;
			uses.set(t.id, { stored: a.stored + a.games * n * (b.minutes + BASELINE.clipsAGame * b.clipMinutes), watched: a.games * b.watched, gbMonths: a.games * b.gb });
		}
		// A month to come is a whole month for every team running now.
		const running = new Map(p.teams.filter((t) => t.status === "active" && uses.has(t.id) && runningShare(thisMonth, t) > 0).map((t) => [t.id, 1] as const));
		return allocate(month, { uses, running, unmatched: 0, minutesBought: null, estimate: true, freeMinutes });
	});
	return p.teams.map((t) => {
		const season = seasonMonths(t.seasonStart);
		const mine = [...actual, ...future].map((m) => m.get(t.id)).filter((m): m is MonthCost => m !== undefined && season.includes(m.month));
		const soFar = mine.filter((m) => !m.estimate).reduce((s, m) => s + m.total, 0);
		return {
			team: t, months: mine, thisMonth: mine.find((m) => m.month === thisMonth) ?? null, soFar,
			estimate: soFar + mine.filter((m) => m.estimate).reduce((s, m) => s + m.total, 0), ...basis.get(t.id)!,
		};
	});
}
