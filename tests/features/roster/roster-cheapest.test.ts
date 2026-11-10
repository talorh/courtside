import { describe, expect, it } from "vitest";
import { cheapest, POOL } from "../../../src/features/roster/roster-cheapest.ts";

// The roster planner's search: the cheapest ordered choice of k families from a pool, the i-th taking the i-th slot.
describe("the roster planner's cheapest choice", () => {
	const flat = () => 1;
	it("picks the ordering with the lowest total cost, trying every way", () => {
		// Family 1 is dear on slot 0, cheap on slot 1; family 2 the other way round.
		const cost = (family: number, slot: number) => (family === 1 ? [10, 1][slot]! : [1, 10][slot]!);
		expect(cheapest([1, 2, 3], 2, [], cost)).toEqual([2, 1]);
	});
	it("ties keep the first in pool order (whoever had a duty longest ago)", () => {
		expect(cheapest([7, 8, 9], 2, [], flat)).toEqual([7, 8]);
	});
	it("always includes every forced family, and gives up when they can't all fit", () => {
		expect(cheapest([7, 8, 9], 2, [9], flat)).toEqual([7, 9]);
		expect(cheapest([7, 8, 9], 1, [8, 9], flat)).toBeNull();
	});
	it("tries a pool of five at most a week, so a season's fill stays a few milliseconds", () => {
		expect(POOL).toBe(5);
	});
});
