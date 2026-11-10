// Who does what, fairly. Every game needs two families scoring, and the team's other duties (roster-duties.ts: lollies
// and video unless its team manager switched them off; no video for a No video game) each game too (a
// tournament weekend's games each get their own pair of scorers, and their own lollies when the team has that duty).
// A family never has two duties in one week, unless a weekend has more slots than families: then a family may take a
// second game, never the same game twice nor straight after its own. Slots already held (earlier weeks, changes by hand)
// count towards it.

import { compareIso } from "../../shared/time.ts";
import { cheapest, POOL } from "./roster-cheapest.ts";
import { ALL_DUTIES, type RosterDuties, standingFamily } from "./roster-duties.ts";
import type { Credit } from "./roster-away.ts";
import { evenOut } from "./roster-even.ts";
import { repeats } from "./roster-repeats.ts";
import { neighbours, secondGame } from "./roster-second-game.ts";

export const DUTIES = ["scoring", "lollies", "video"] as const;
export type Duty = (typeof DUTIES)[number];

/** `gameId`: the game the slot is for. `byHand`: the team manager chose this family (Generate roster keeps it);
 * otherwise it's the roster's own pick. */
export interface Slot { week: string; duty: Duty; position: number; gameId: number; familyId: number; byHand?: boolean }
/** `games`: the week's games in playing order, each wanting its own duties (`video`: it can be filmed); `extra`: the
 * team's extra duty this week (false on a Scorers only week, and by default on a tournament weekend); `video`: whether
 * any of the week's games is filmed. */
export interface WeekNeed { week: string; video: boolean; extra?: boolean; games: Array<{ id: number; video: boolean }> }
export type Wanted = { duty: Duty; position: number; gameId: number };
export const sameSlot = (a: { duty: Duty; position: number; gameId: number }, b: { duty: Duty; position: number; gameId: number }) =>
	a.duty === b.duty && a.position === b.position && a.gameId === b.gameId;

/** The slots a week needs with the team's duties: for each game, video first (it's the one that needs the most
 * organising), two scorers, then the extra duty. */
export function slotsFor(need: WeekNeed, duties: RosterDuties = ALL_DUTIES): Wanted[] {
	return need.games.flatMap((g) => [
		...(g.video && duties.video ? [{ duty: "video" as const, position: 1, gameId: g.id }] : []),
		{ duty: "scoring" as const, position: 1, gameId: g.id }, { duty: "scoring" as const, position: 2, gameId: g.id },
		...(need.extra !== false && duties.lollies ? [{ duty: "lollies" as const, position: 1, gameId: g.id }] : []),
	]);
}

export interface Tally { duty: Record<Duty, number>; total: number; last: string }

/**
 * The new slots that fill `weeks` (in date order) from `families` (ids), around the ones already `held`.
 * Each week goes to the families with the fewest duties so far, so totals stay within one of each other. Where more
 * families are tied than there are duties, every way of choosing among them and sharing out the duties is tried,
 * and the one that leaves each duty most even wins (then the families whose last duty was longest ago). `credit`: what
 * a family is counted as having done while it was off the roster (roster-away.ts), so it isn't given extra to catch up.
 */
export function fillWeeks(weeks: WeekNeed[], families: number[], held: Slot[], duties: RosterDuties = ALL_DUTIES, credit = new Map<number, Credit>()): Slot[] {
	const tally = new Map<number, Tally>(families.map((f) => {
		const c = credit.get(f);
		return [f, { duty: { scoring: c?.duty.scoring ?? 0, lollies: c?.duty.lollies ?? 0, video: c?.duty.video ?? 0 }, total: c?.total ?? 0, last: "" }];
	}));
	const recent = repeats([...weeks.map((w) => w.week), ...held.map((s) => s.week)]);
	const count = (s: Slot) => {
		recent.add(s);
		const t = tally.get(s.familyId);
		if (!t) return;
		t.duty[s.duty]++;
		t.total++;
		if (s.week > t.last) t.last = s.week;
	};
	held.forEach(count);
	// A duty the team gives to one family every game is theirs first; that family gets no other duty.
	const standing = new Map(DUTIES.flatMap((d) => { const f = standingFamily(d, duties); return f !== null && families.includes(f) ? [[d, f] as const] : []; }));
	const regulars = new Set(standing.values());
	const added: Slot[] = [], fixed: Slot[] = [], next = new Map<string, number[]>();
	for (const need of [...weeks].sort((a, b) => compareIso(a.week, b.week))) {
		const thisWeek = held.filter((s) => s.week === need.week);
		const busy = new Set(thisWeek.map((s) => s.familyId));
		const taken: Slot[] = [];
		const onGame = (gameId: number) => new Set([...thisWeek, ...fixed, ...taken].filter((s) => s.week === need.week && s.gameId === gameId).map((s) => s.familyId));
		// A game at a time (a unit the planner can search quickly), the week's families shared across its games.
		const wanted = slotsFor(need, duties);
		const order = [...new Set(wanted.map((x) => x.gameId))];
		neighbours(order, need.week, next);
		for (const gameId of order) {
			let open = wanted.filter((x) => x.gameId === gameId && !thisWeek.some((s) => sameSlot(s, x)));
			for (const x of open.filter((x) => standing.has(x.duty) && !onGame(x.gameId).has(standing.get(x.duty)!))) {
				const slot = { week: need.week, duty: x.duty, position: x.position, gameId: x.gameId, familyId: standing.get(x.duty)! };
				count(slot);
				fixed.push(slot);
				busy.add(slot.familyId);
				open = open.filter((o) => o !== x);
			}
			if (!open.length) continue;
			const free = families.filter((f) => !busy.has(f) && !regulars.has(f)).sort((a, b) => {
				const ta = tally.get(a)!, tb = tally.get(b)!;
				return ta.total - tb.total || compareIso(ta.last, tb.last) || a - b;
			});
			// Families free this week take the slots, each at most one (none free: straight to the second pass).
			const k = Math.min(open.length, free.length);
			const cutoff = k ? tally.get(free[k - 1]!)!.total : 0;
			const forced = free.filter((f) => tally.get(f)!.total < cutoff);
			const pool = [...forced, ...free.filter((f) => tally.get(f)!.total === cutoff).slice(0, Math.max(k, POOL) - forced.length)];
			const cost = (f: number, slot: number) => (tally.get(f)!.duty[open[slot]!.duty] + 1) ** 2 + (recent.again(f, need.week, open[slot]!.duty) ? 0.5 : 0);
			const best = k ? (cheapest(pool, k, forced, cost) ?? free.slice(0, k)) : [];
			const now: Slot[] = best.map((familyId, i) => ({ week: need.week, duty: open[i]!.duty, position: open[i]!.position, gameId: open[i]!.gameId, familyId }));
			// More slots than families (a tournament weekend): a family takes a second game (roster-second-game.ts).
			const others = families.filter((f) => !regulars.has(f));
			for (const x of open.slice(k)) {
				const sofar = [...thisWeek, ...fixed.filter((s) => s.week === need.week), ...taken, ...now];
				const again = secondGame({ ...x, week: need.week }, order, others, sofar, now, tally, next);
				if (again !== undefined) now.push({ week: need.week, duty: x.duty, position: x.position, gameId: x.gameId, familyId: again });
			}
			for (const slot of now) {
				count(slot);
				busy.add(slot.familyId);
				taken.push(slot);
			}
		}
		added.push(...taken);
	}
	// Only the shared-out slots move: a family's every-game duty stays theirs.
	evenOut(added, [...held, ...fixed], tally, next);
	return [...fixed, ...added];
}

/** Monday of the week (Monday to Sunday) a 'YYYY-MM-DD' date falls in. */
export function weekOf(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
	return d.toISOString().slice(0, 10);
}
