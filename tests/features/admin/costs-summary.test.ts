import { describe, expect, it } from "vitest";
import type { TeamCosts } from "../../../src/features/admin/costs-estimate.ts";
import type { MonthCost } from "../../../src/features/admin/costs-model.ts";
import { byKind, changeOnLastMonth, monthBars, runningTotal } from "../../../src/features/admin/costs-summary.ts";
import { axisDollars, niceScale } from "../../../src/features/admin/views/costs-charts.ts";

// Costs' chart figures: months added up across teams by kind, the running total, the season by kind, the change on
// last month, and the dollar axis's round steps.

const month = (m: string, o: Partial<MonthCost> = {}): MonthCost => {
	const parts = { storage: 0, viewing: 0, uploads: 0, shared: 0, ...o };
	return { month: m, estimate: m > "2026-11", billed: 0, billedDays: 0, ...parts, total: parts.storage + parts.viewing + parts.uploads + parts.shared, use: { stored: 0, gbMonths: 0, watched: 0 } };
};
const team = (months: MonthCost[]) => ({ months }) as unknown as TeamCosts;

describe("Costs' chart figures", () => {
	const costs = [team([month("2026-10", { shared: 5, storage: 1 }), month("2026-11", { shared: 5, viewing: 2 })]), team([month("2026-11", { shared: 5 }), month("2026-12", { uploads: 3 })])];
	const bars = monthBars(costs, ["2026-10", "2026-11", "2026-12"], "2026-11");

	it("adds every team's months up, each kind on its own, marking the months to come as estimates", () => {
		expect(bars.map((b) => [b.month, b.total, b.estimate])).toEqual([["2026-10", 6, false], ["2026-11", 12, false], ["2026-12", 3, true]]);
		expect(bars[1]!.parts).toEqual({ shared: 10, storage: 0, viewing: 2, uploads: 0 });
	});

	it("keeps a running total, and says how the season splits by kind, biggest first", () => {
		expect(runningTotal(bars)).toEqual([6, 18, 21]);
		expect(byKind(bars).map((k) => [k.key, k.dollars, Math.round(k.share * 100)])).toEqual([["shared", 15, 71], ["uploads", 3, 14], ["viewing", 2, 10], ["storage", 1, 5]]);
	});

	it("compares this month with last, when last month cost something", () => {
		expect(changeOnLastMonth(bars, "2026-11")).toEqual({ dollars: 6, share: 1 });
		expect(changeOnLastMonth(bars, "2026-10")).toBeNull();
	});

	it("puts the dollar axis on round steps", () => {
		expect(niceScale(11.18)).toEqual({ top: 12, ticks: [0, 3, 6, 9, 12] });
		expect(niceScale(228)).toEqual({ top: 240, ticks: [0, 60, 120, 180, 240] });
		expect(niceScale(0).top).toBe(1);
		expect([axisDollars(0), axisDollars(12.6), axisDollars(1500), axisDollars(2000)]).toEqual(["$0", "$13", "$1.5k", "$2k"]);
	});
});
