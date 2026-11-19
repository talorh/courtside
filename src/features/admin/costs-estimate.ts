// Each team's season: its months so far (costs-model.ts), then an estimate of the months left; and, spent, any month
// outside its season it has something in (footage kept after it, an upload before it), and, once its season's over, the
// kept months still to come at what it stores now (nothing new, its watching not guessed at). A running team's games
// left (30 a season, less those with a video) are spread evenly over its months left, each adding its video and three
// clips to what it stores, its minutes watched and its original in R2. The team's own figures stand in for the baseline
// once it has three games with a video (one short test isn't a season): its videos' and clips' length, its originals'
// size, and minutes watched a game. Until then it takes the other teams' own figures, averaged game for game, and the
// baseline only while no team has any. Cloudflare's bill, when there is one, puts the months it has billed right
// (costs-reconcile.ts), and the plan's free watching it shows comes off the months to come.
import type { BilledMonth } from "./costs-bill-summary.ts";
import { BASELINE, keptMonths, monthOf, monthSpan, seasonMonths } from "./costs-prices.ts";
import { actualMonths, allocate, type MonthCost, runningShare, type Usage } from "./costs-model.ts";
import { reconcile } from "./costs-reconcile.ts";
import type { CostTeam, SavedViews, StoredItem } from "./costs-repository.ts";
import { type SavedMonths, savedFor } from "./costs-saved.ts";

/** Where a game's figure comes from: the team's own games, the other teams' average, or the baseline. */
export type FigureFrom = "own" | "teams" | "baseline";
export interface PerGame { minutes: number; clipMinutes: number; watched: number; gb: number; from: { length: FigureFrom; watched: FigureFrom } }

export interface TeamCosts {
	team: CostTeam; months: MonthCost[]; thisMonth: MonthCost | null; soFar: number; estimate: number;
	/** Games with a video this season, and what a game left is estimated at. */
	games: number; perGame: PerGame;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
/** Games with a video before a team's own figures are used. */
const OWN_AFTER = 3;
const GB = 1024 ** 3;

/** A team's own figures a game (null: not enough games yet, or none of that kind), and how many games each is over. */
interface Own { games: number; length: number | null; clip: number | null; clips: number; watched: number | null; gb: number | null; withBytes: number }

function ownFigures(t: CostTeam, items: StoredItem[], views: SavedViews[], season: string[], thisMonth: string): Own {
	const own = items.filter((i) => i.teamId === t.id && season.includes(monthOf(i.createdAt)));
	// Its games: videos still on the site (a test, or one deleted, isn't a game; it still counted while it was stored).
	const videos = own.filter((i) => i.kind === "video" && i.deletedAt === null);
	const enough = videos.length >= OWN_AFTER;
	const watchedSoFar = views.filter((v) => v.teamId === t.id && season.includes(v.month) && v.month <= thisMonth).reduce((s, v) => s + v.minutes, 0);
	const sized = enough ? videos.filter((v) => v.bytes).map((v) => v.bytes / GB) : [];
	const clips = enough ? own.filter((i) => i.kind === "clip" && i.deletedAt === null).map((c) => c.minutes) : [];
	return {
		games: videos.length, length: enough ? avg(videos.map((v) => v.minutes)) : null, clip: avg(clips), clips: clips.length,
		watched: enough && watchedSoFar > 0 ? watchedSoFar / videos.length : null, gb: avg(sized), withBytes: sized.length,
	};
}

/** The teams' own figures averaged game for game (clips clip for clip, sizes over the videos with one); null where none
 * has it. */
function teamsAverage(all: Own[]) {
	const mean = (pick: (o: Own) => number | null, weight: (o: Own) => number) => {
		const has = all.filter((o) => pick(o) !== null && weight(o) > 0), n = has.reduce((s, o) => s + weight(o), 0);
		return n ? has.reduce((s, o) => s + pick(o)! * weight(o), 0) / n : null;
	};
	return { length: mean((o) => o.length, (o) => o.games), clip: mean((o) => o.clip, (o) => o.clips), watched: mean((o) => o.watched, (o) => o.games), gb: mean((o) => o.gb, (o) => o.withBytes) };
}

/** A game left: the team's own figure, else the other teams' average, else the baseline. */
function perGame(own: Own, teams: ReturnType<typeof teamsAverage>): PerGame {
	const from = (mine: number | null, theirs: number | null): FigureFrom => (mine !== null ? "own" : theirs !== null ? "teams" : "baseline");
	const minutes = own.length ?? teams.length ?? BASELINE.gameMinutes;
	const watched = own.watched ?? teams.watched ?? minutes * BASELINE.families * BASELINE.viewsPerFamily;
	return {
		minutes, clipMinutes: own.clip ?? teams.clip ?? BASELINE.clipMinutes, watched, gb: own.gb ?? teams.gb ?? BASELINE.originalGb,
		from: { length: from(own.length, teams.length), watched: from(own.watched, teams.watched) },
	};
}

/** Cloudflare's bill by calendar month, and the minutes of watching a month it shows the plan includes. */
export interface BillForCosts { months: Map<string, BilledMonth>; freeMinutes: number }

/** A month's days so far: all of a past month's; this month's to today (UTC, as Cloudflare bills). */
const daysSoFar = (month: string, thisMonth: string, now: Date) =>
	month < thisMonth ? Math.round((Date.parse(monthSpan(month).end) - Date.parse(monthSpan(month).start)) / 86_400_000) : now.getUTCDate();

/** `bought`: Stream's storage bought, each month Costs saw it (costs-repository.ts boughtByMonth). */
type CostsInput = { teams: CostTeam[]; items: StoredItem[]; views: SavedViews[]; now: Date; minutesBoughtNow: number | null; bought?: Map<string, number>; bill?: BillForCosts; saved?: SavedMonths };

/** The months so far: each saved once it was over (costs-saved.ts) as it was saved; the rest worked out, and put right
 * by Cloudflare's bill. */
function spentMonths(p: CostsInput, past: string[], thisMonth: string): Map<string, MonthCost>[] {
	const fresh = past.filter((m) => !p.saved?.has(m));
	const worked = actualMonths({ months: fresh, teams: p.teams, items: p.items, views: p.views, thisMonth, minutesBoughtNow: p.minutesBoughtNow, bought: p.bought, freeMinutes: p.bill?.freeMinutes ?? 0 })
		.map((m, i) => reconcile(m, p.bill?.months.get(fresh[i]!), daysSoFar(fresh[i]!, thisMonth, p.now)));
	const byMonth = new Map(fresh.map((m, i) => [m, worked[i]!]));
	return past.map((m) => byMonth.get(m) ?? savedFor(m, p.teams, p.saved!.get(m)!));
}

/** A month outside a team's season it has something in: an upload before it, or footage kept after it. */
const used = (m: MonthCost) => m.total > 0 || m.use.stored > 0 || m.use.gbMonths > 0 || m.use.watched > 0;

export function teamCosts(p: CostsInput): TeamCosts[] {
	const thisMonth = monthOf(p.now.toISOString());
	// Every season's months, and the months after a season while its footage is kept: spent to this month, estimated after.
	const months = [...new Set(p.teams.flatMap((t) => [...seasonMonths(t.seasonStart), ...keptMonths(t.seasonStart)]))].sort();
	const past = months.filter((m) => m <= thisMonth);
	const freeMinutes = p.bill?.freeMinutes ?? 0;
	const actual = spentMonths(p, past, thisMonth);
	const owns = new Map(p.teams.map((t) => [t.id, ownFigures(t, p.items, p.views, seasonMonths(t.seasonStart), thisMonth)]));
	const teams = teamsAverage([...owns.values()]);
	const basis = new Map([...owns].map(([id, own]) => [id, { games: own.games, perGame: perGame(own, teams) }]));
	// Each running team's games left, a month, over its months left; and what it keeps now, to build on (not what passed
	// through this month: a test video gone since isn't stored next month).
	const ahead = new Map(p.teams.map((t) => {
		const left = seasonMonths(t.seasonStart).filter((m) => m > thisMonth);
		const games = t.status === "active" && left.length ? Math.max(0, BASELINE.games - basis.get(t.id)!.games) / left.length : 0;
		const kept = p.items.filter((i) => i.teamId === t.id && !i.deletedAt).reduce((s, i) => s + i.minutes, 0);
		return [t.id, { left, games, stored: kept }];
	}));
	const future = months.filter((m) => m > thisMonth).map((month) => {
		const uses = new Map<string, Usage>();
		for (const t of p.teams) {
			const a = ahead.get(t.id)!, b = basis.get(t.id)!.perGame;
			// Its season over, its footage kept to December: stored as it is now, with nothing added.
			if (!a.left.length && keptMonths(t.seasonStart).includes(month)) uses.set(t.id, { stored: a.stored, watched: 0, gbMonths: 0 });
			const n = a.left.indexOf(month) + 1;
			if (!n) continue;
			uses.set(t.id, { stored: a.stored + a.games * n * (b.minutes + BASELINE.clipsAGame * b.clipMinutes), watched: a.games * b.watched, gbMonths: a.games * b.gb });
		}
		// A month to come is a whole month for every team running now in its own season.
		const running = new Map(p.teams.filter((t) => t.status === "active" && ahead.get(t.id)!.left.includes(month) && runningShare(thisMonth, t) > 0).map((t) => [t.id, 1] as const));
		// Storage bought is billed until it's lowered: at least that much, more once the minutes need it.
		const needed = [...uses.values()].reduce((s, u) => s + u.stored, 0);
		const minutesBought = p.minutesBoughtNow === null ? null : Math.max(p.minutesBoughtNow, needed);
		return allocate(month, { uses, running, unmatched: 0, minutesBought, estimate: true, freeMinutes });
	});
	return p.teams.map((t) => {
		const season = seasonMonths(t.seasonStart);
		const mine = [...actual, ...future].map((m) => m.get(t.id)).filter((m): m is MonthCost => m !== undefined && (season.includes(m.month) || used(m)));
		const soFar = mine.filter((m) => !m.estimate).reduce((s, m) => s + m.total, 0);
		return {
			team: t, months: mine, thisMonth: mine.find((m) => m.month === thisMonth) ?? null, soFar,
			estimate: soFar + mine.filter((m) => m.estimate).reduce((s, m) => s + m.total, 0), ...basis.get(t.id)!,
		};
	});
}
