// Time off the roster. A family taken off for a while (away, or injured) and put back, or added partway through the
// season, has had fewer duties than the rest only because it wasn't there. Each week it was off counts as its fair share
// of that week's duties (the week's duties over the families on the roster then), so when it's back it takes turns
// like everyone else rather than being given duty after duty to catch up. Pure: the roster's service supplies who was
// on it when (roster-repository.ts).
import { ALL_DUTIES, type RosterDuties, standingFamily } from "./roster-duties.ts";
import type { Duty, Slot } from "./roster-plan.ts";

/** Periods off the roster: [from week, back week) (Mondays); back is null while it's still off. */
export type AwayPeriods = Array<[string, string | null]>;

/** A family's time on the roster: from the week it was added, less its periods away. */
export interface Presence { id: number; joined: string; away: AwayPeriods }

export const onRoster = (f: Presence, week: string) =>
	week >= f.joined && !f.away.some(([from, back]) => week >= from && (back === null || week < back));

/** What a family is counted as having done while it was off, and for how many weeks with duties: `before` it was
 * added, and `off` the roster after. */
export interface Credit { duty: Record<Duty, number>; total: number; before: number; off: number }

/**
 * Each of `ids`' share of the weeks in `held` it wasn't on the roster for: per duty, the week's count of it over the
 * families on the roster that week. A family on one duty every week (`duties`) isn't sharing, so neither it nor its
 * slots are counted. A week nobody was on gives nothing, nor one the family had a duty in. Rounded, so shares that add up to a whole duty are one.
 */
export function awayCredit(held: Slot[], all: Presence[], ids: number[], duties: RosterDuties = ALL_DUTIES): Map<number, Credit> {
	const regulars = new Set((["lollies", "video"] as const).map((d) => standingFamily(d, duties)));
	const sharing = all.filter((f) => !regulars.has(f.id));
	const credit = new Map(ids.map((id) => [id, { duty: { scoring: 0, lollies: 0, video: 0 }, total: 0, before: 0, off: 0 } as Credit]));
	const byWeek = new Map<string, Slot[]>();
	for (const s of held.filter((x) => !regulars.has(x.familyId))) byWeek.set(s.week, [...(byWeek.get(s.week) ?? []), s]);
	for (const [week, slots] of byWeek) {
		const present = sharing.filter((f) => onRoster(f, week)).length;
		if (!present) continue;
		for (const id of ids) {
			const f = sharing.find((x) => x.id === id);
			// On a duty that week anyway (put on it by hand): it did its share.
			if (!f || onRoster(f, week) || slots.some((s) => s.familyId === id)) continue;
			const c = credit.get(id)!;
			for (const s of slots) c.duty[s.duty] += 1 / present;
			c.total += slots.length / present;
			if (week < f.joined) c.before++;
			else c.off++;
		}
	}
	const round = (x: number) => Math.round(x * 1000) / 1000;
	for (const c of credit.values()) {
		c.total = round(c.total);
		for (const d of Object.keys(c.duty) as Duty[]) c.duty[d] = round(c.duty[d]);
	}
	return credit;
}

/** `away` with its open period closed at `back`; a family taken off before periods were kept (`removedWeek`) gets one. */
export function closeAway(away: AwayPeriods, removedWeek: string, back: string): AwayPeriods {
	const last = away.at(-1);
	if (last && last[1] === null) return [...away.slice(0, -1), [last[0], back]];
	return [...away, [removedWeek, back]];
}
