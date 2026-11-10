// The roster planner's search (roster-plan.ts fillWeeks): the cheapest way to give a week's open slots to the families
// tied on fewest duties, trying every ordering of a small pool.

export const POOL = 5; // families tried at once: 5 × 4 × 3 × 2 = 120 ways a week at most, so a season's fill stays a few ms of CPU

/**
 * The cheapest ordered choice of `k` of `pool` (the i-th takes the i-th open slot) that includes every `forced`
 * family. Cost: `slotCost`, each family's count of its duty after this week squared (one family two ahead costs more
 * than two families one ahead) and half a point for the same duty as the week before or after, plus a little for a
 * family higher in `pool` (who had a duty more recently). Tries every choice
 * in order, building nothing as it goes and dropping one once it can't beat the best so far (a whole season's fill
 * ran 12 ms in a fresh Worker when it made an array for every way); ties keep the first.
 */
export function cheapest(pool: number[], k: number, forced: number[], slotCost: (family: number, slot: number) => number): number[] | null {
	const order: number[] = [], used = pool.map(() => false);
	let best: number[] | null = null, bestCost = Infinity;
	const extend = (cost: number) => {
		if (cost >= bestCost) return;
		if (order.length === k) {
			if (forced.every((f) => order.includes(f))) { best = [...order]; bestCost = cost; }
			return;
		}
		for (let i = 0; i < pool.length; i++) {
			if (used[i]) continue;
			used[i] = true;
			order.push(pool[i]!);
			extend(cost + slotCost(pool[i]!, order.length - 1) + i / 1000);
			order.pop();
			used[i] = false;
		}
	};
	extend(0);
	return best;
}
