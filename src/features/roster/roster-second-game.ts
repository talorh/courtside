// A weekend with more slots than families (a tournament): a family takes a second game. Never the same game twice, and
// not a game straight before or after one of its own while another family can take it; then the fewest duties, the
// fewest of this duty, the one whose own game is furthest from this one, and the longest since its last duty.
import { compareIso } from "../../shared/time.ts";
import type { Slot, Tally, Wanted } from "./roster-plan.ts";

/** Each game's games either side of it in its week's playing order, by `week|gameId`. */
export function neighbours(order: number[], week: string, into = new Map<string, number[]>()): Map<string, number[]> {
	order.forEach((g, i) => into.set(`${week}|${g}`, [order[i - 1], order[i + 1]].filter((n): n is number => n !== undefined)));
	return into;
}

/** Whether `familyId` is on a game next to `gameId` in `week`, among `slots` (leaving out `except`, the slot it gives up). */
export function nextToOwn(familyId: number, week: string, gameId: number, slots: Slot[], next: Map<string, number[]>, except?: Slot): boolean {
	const near = next.get(`${week}|${gameId}`);
	return !!near?.length && slots.some((s) => s !== except && s.familyId === familyId && s.week === week && near.includes(s.gameId));
}

/** Who takes `x`: `order`, its week's games in playing order; `week`, every slot of its week so far; `pending`, those
 * not yet in `tally`. */
export function secondGame(x: Wanted & { week: string }, order: number[], families: number[], week: Slot[], pending: Slot[], tally: Map<number, Tally>, next: Map<string, number[]>): number | undefined {
	const here = new Set(week.filter((s) => s.gameId === x.gameId).map((s) => s.familyId));
	const extra = (f: number, duty?: string) => pending.filter((s) => s.familyId === f && (!duty || s.duty === duty)).length;
	const at = order.indexOf(x.gameId);
	const nearest = (f: number) => Math.min(...week.filter((s) => s.familyId === f).map((s) => Math.abs(order.indexOf(s.gameId) - at)), order.length);
	const rank = (f: number) => [nextToOwn(f, x.week, x.gameId, week, next) ? 1 : 0, tally.get(f)!.total + extra(f), tally.get(f)!.duty[x.duty] + extra(f, x.duty), -nearest(f)];
	return families.filter((f) => !here.has(f)).sort((a, b) => {
		const ra = rank(a), rb = rank(b);
		return ra[0]! - rb[0]! || ra[1]! - rb[1]! || ra[2]! - rb[2]! || ra[3]! - rb[3]! || compareIso(tally.get(a)!.last, tally.get(b)!.last) || a - b;
	})[0];
}
