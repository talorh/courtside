import type { Slot, Tally } from "./roster-plan.ts";
import { nextToOwn } from "./roster-second-game.ts";

/**
 * Week by week can't see ahead, so afterwards two families swap duties whenever that evens the duties out: in the
 * same week, or in two weeks when each is free in the other's week. Each keeps the same number of duties, so totals
 * stay as they were. Only the new slots move, and never onto a game straight before or after one of the family's own.
 */
export function evenOut(added: Slot[], held: Slot[], tally: Map<number, Tally>, next = new Map<string, number[]>()): void {
	const all = [...held, ...added];
	const busy = new Set([...held, ...added].map((s) => `${s.week}|${s.familyId}`));
	// A family on a game already (a tournament weekend with more slots than families) can't swap onto it again.
	const onGame = new Set([...held, ...added].filter((s) => s.gameId).map((s) => `${s.week}|${s.gameId}|${s.familyId}`));
	for (let pass = 0, swapped = true; swapped && pass < 50; pass++) {
		swapped = false;
		for (let i = 0; i < added.length; i++) {
			for (let j = i + 1; j < added.length; j++) {
				const a = added[i]!, b = added[j]!;
				if (a.duty === b.duty || a.familyId === b.familyId) continue;
				const sameWeek = a.week === b.week;
				if (!sameWeek && (busy.has(`${b.week}|${a.familyId}`) || busy.has(`${a.week}|${b.familyId}`))) continue;
				if ((b.gameId && onGame.has(`${b.week}|${b.gameId}|${a.familyId}`)) || (a.gameId && onGame.has(`${a.week}|${a.gameId}|${b.familyId}`))) continue;
				if (nextToOwn(a.familyId, b.week, b.gameId, all, next, a) || nextToOwn(b.familyId, a.week, a.gameId, all, next, b)) continue;
				const ta = tally.get(a.familyId)!.duty, tb = tally.get(b.familyId)!.duty;
				// The change in the sum of squared counts if they swap.
				const gain = ta[a.duty] ** 2 + ta[b.duty] ** 2 + tb[a.duty] ** 2 + tb[b.duty] ** 2
					- ((ta[a.duty] - 1) ** 2 + (ta[b.duty] + 1) ** 2 + (tb[a.duty] + 1) ** 2 + (tb[b.duty] - 1) ** 2);
				if (gain <= 0) continue;
				ta[a.duty]--; ta[b.duty]++; tb[b.duty]--; tb[a.duty]++;
				if (!sameWeek) {
					for (const k of [`${a.week}|${a.familyId}`, `${b.week}|${b.familyId}`]) busy.delete(k);
					busy.add(`${a.week}|${b.familyId}`).add(`${b.week}|${a.familyId}`);
				}
				for (const s of [a, b]) if (s.gameId) onGame.delete(`${s.week}|${s.gameId}|${s.familyId}`);
				[a.familyId, b.familyId] = [b.familyId, a.familyId];
				for (const s of [a, b]) if (s.gameId) onGame.add(`${s.week}|${s.gameId}|${s.familyId}`);
				swapped = true;
			}
		}
	}
}
