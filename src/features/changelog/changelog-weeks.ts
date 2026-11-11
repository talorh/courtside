// The Changelog's activity: each day's changes counted by kind and laid out as the weeks of a rolling twelve months
// (the 53 weeks ending this week, Monday to Sunday, up to today), for the heatmap at the top of the page.
import { MONTHS, mondayOf } from "../../shared/time.ts";
import { CHANGE_KINDS, type ChangeKind, type ChangelogDay } from "./changelog.ts";

export const WEEKS = 53;
const DAY_MS = 86_400_000;

export interface DayCell { date: string; counts: Record<ChangeKind, number> }

/** A day as the changelog writes it, "24 Oct 2026", as 'YYYY-MM-DD'; null when it isn't one. */
export function isoDate(written: string): string | null {
	const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(written.trim());
	const month = m ? MONTHS.indexOf(m[2]!) : -1;
	return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
}

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const zero = (): Record<ChangeKind, number> => ({ feature: 0, enhancement: 0, fix: 0 });

/** The weeks, oldest first, each Monday to Sunday: a cell a day with its changes counted, null for a day after today. */
export function weeksOfChanges(days: ChangelogDay[], today: string): Array<Array<DayCell | null>> {
	const counts = new Map<string, Record<ChangeKind, number>>();
	for (const day of days) {
		const date = isoDate(day.date);
		if (!date) continue;
		const c = counts.get(date) ?? zero();
		for (const change of day.changes) c[change.kind] += 1;
		counts.set(date, c);
	}
	const start = shift(mondayOf(today), -(WEEKS - 1) * 7);
	return Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => {
		const date = shift(start, w * 7 + d);
		return date > today ? null : { date, counts: counts.get(date) ?? zero() };
	}));
}

/** How many of a cell's changes count: one kind, or all of them. */
export const countOf = (cell: DayCell, only: ChangeKind | null) => (only ? cell.counts[only] : CHANGE_KINDS.reduce((n, k) => n + cell.counts[k], 0));
