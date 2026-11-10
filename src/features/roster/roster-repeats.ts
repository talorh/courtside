// A family doing the same duty in two weeks running: the planner gives the duty to another family instead whenever
// that's as fair (it never costs a family an extra duty).
import type { Duty, Slot } from "./roster-plan.ts";

export function repeats(weeks: string[]): { add: (s: Slot) => void; again: (familyId: number, week: string, duty: Duty) => boolean } {
	const sorted = [...new Set(weeks)].sort(), at = new Map(sorted.map((w, i) => [w, i])), done = new Set<string>();
	return {
		add: (s) => void done.add(`${s.week}|${s.familyId}|${s.duty}`),
		again: (familyId, week, duty) => {
			const i = at.get(week);
			return i !== undefined && [sorted[i - 1], sorted[i + 1]].some((w) => w !== undefined && done.has(`${w}|${familyId}|${duty}`));
		},
	};
}
