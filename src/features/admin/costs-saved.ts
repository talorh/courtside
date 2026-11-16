// Costs' spent months, saved once they're over (cost_months), so a month stays as Costs showed it: a video deleted
// later takes nothing out of the months it was stored in, and a team deleted moves none of its share onto the others.
// The 3am job saves a month once it's been over a week (Cloudflare's last minutes watched and its bill for the month's
// last days come in late), from a read of both that worked; from then on Costs reads the month from the table.
import type { AppDeps } from "../../app/deps.ts";
import type { Costs } from "./costs-load.ts";
import type { MonthCost } from "./costs-model.ts";
import { monthSpan } from "./costs-prices.ts";
import { type CostTeam, type SavedMonth, saveMonths } from "./costs-repository.ts";

/** The months saved, each its teams' months by team id. */
export type SavedMonths = Map<string, Map<string, MonthCost>>;

const WEEK_MS = 7 * 86_400_000;

/** Whether `month` has been over a week at `now`. */
export const settled = (month: string, now: Date) => Date.parse(monthSpan(month).end) + WEEK_MS <= now.getTime();

const toCost = (r: SavedMonth): MonthCost => ({
	month: r.month, estimate: false, storage: r.storage, viewing: r.viewing, uploads: r.uploads, shared: r.shared,
	total: r.storage + r.viewing + r.uploads + r.shared, billed: r.billed, billedDays: r.billedDays, use: { stored: r.stored, gbMonths: r.gbMonths, watched: r.watched },
});

export function byMonth(rows: SavedMonth[]): SavedMonths {
	const out: SavedMonths = new Map();
	for (const r of rows) out.set(r.month, (out.get(r.month) ?? new Map()).set(r.teamId, toCost(r)));
	return out;
}

const nothing = (month: string): MonthCost => ({ month, estimate: false, storage: 0, viewing: 0, uploads: 0, shared: 0, total: 0, billed: 0, billedDays: 0, use: { stored: 0, gbMonths: 0, watched: 0 } });

/** A saved month for the teams there are now: each its own row, or nothing in it when it has none or was onboarded
 * after the month (a deleted team's id can be given to a new one). */
export function savedFor(month: string, teams: CostTeam[], rows: Map<string, MonthCost>): Map<string, MonthCost> {
	const end = monthSpan(month).end;
	return new Map(teams.map((t) => [t.id, (t.createdAt < end && rows.get(t.id)) || nothing(month)]));
}

/** Every team's spent months over a week ago and not saved yet, saved; how many team months. Not from a read of
 * Cloudflare that failed (or with no token to read it), which would keep a month without its minutes watched or bill. */
export async function saveSpentMonths(deps: AppDeps, c: Costs): Promise<number> {
	if (c.viewing.read === "failed" || c.viewing.read === "off" || c.bill.read === "failed") return 0;
	const now = deps.now();
	const rows = c.costs.flatMap((t) => t.months.filter((m) => !m.estimate && settled(m.month, now) && !c.saved.has(m.month)).map((m): SavedMonth => ({
		month: m.month, teamId: t.team.id, storage: m.storage, viewing: m.viewing, uploads: m.uploads, shared: m.shared, billed: m.billed, billedDays: m.billedDays,
		stored: m.use.stored, gbMonths: m.use.gbMonths, watched: m.use.watched,
	})));
	await saveMonths(deps.db, rows, now.toISOString());
	return rows.length;
}
