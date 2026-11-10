import { describe, expect, it } from "vitest";
import { allocate, type MonthCost, type Usage } from "../../../src/features/admin/costs-model.ts";
import { reconcile } from "../../../src/features/admin/costs-reconcile.ts";

// The model put right by Cloudflare's bill: for the days the bill covers, what Cloudflare charged for watching and for
// R2 stands in place of the model's own (shared out as the model shares them), and the rest it charged is shared like
// the fixed costs; the days it doesn't cover yet keep the model's figure. The plan's free watching comes off too.

const use = (o: Partial<Usage>): Usage => ({ stored: 0, gbMonths: 0, watched: 0, ...o });
const month = (uses: Record<string, Partial<Usage>>, o: { freeMinutes?: number } = {}) => allocate("2026-10", {
	uses: new Map(Object.entries(uses).map(([k, v]) => [k, use(v)])), running: new Map(Object.keys(uses).map((k) => [k, 1])), unmatched: 0, minutesBought: null, estimate: false, ...o,
});
const pick = (m: Map<string, MonthCost>, team: string) => { const c = m.get(team)!; return { viewing: c.viewing, uploads: c.uploads, shared: c.shared, billed: c.billed, total: c.total }; };

describe("the model put right by Cloudflare's bill", () => {
	it("leaves a month the bill doesn't cover as the model has it, marked not billed", () => {
		const m = month({ a: { watched: 2000 } });
		expect(reconcile(m, undefined, 31).get("a")).toMatchObject({ viewing: 2, billed: 0 });
	});

	it("puts what Cloudflare charged for watching and R2 in place of the model's, by each team's share", () => {
		const m = month({ a: { watched: 3000, gbMonths: 30 }, b: { watched: 1000, gbMonths: 10 } });
		const r = reconcile(m, { watching: 0.4, uploads: 0.06, other: 0, days: 31 }, 31);
		expect(pick(r, "a").viewing).toBeCloseTo(0.3);
		expect(pick(r, "a").uploads).toBeCloseTo(0.045);
		expect(pick(r, "a").billed).toBe(1);
		expect(pick(r, "b").viewing).toBeCloseTo(0.1);
		expect(pick(r, "b").uploads).toBeCloseTo(0.015);
		expect(r.get("a")!.total).toBeCloseTo(r.get("a")!.shared + r.get("a")!.storage + 0.3 + 0.045);
	});

	it("keeps the model's figure for the days the bill doesn't reach yet (this month, the bill a day behind)", () => {
		const m = month({ a: { watched: 2000 } });
		// 4 of 5 days so far billed, at nothing: a fifth of the model's watching is left.
		const r = reconcile(m, { watching: 0, uploads: 0, other: 0, days: 4 }, 5);
		expect(r.get("a")!.viewing).toBeCloseTo(0.4);
		expect(r.get("a")!.billed).toBeCloseTo(0.8);
	});

	it("shares the rest Cloudflare charged (the database, the Worker, Workers AI) like the fixed costs", () => {
		const m = allocate("2026-10", { uses: new Map([["a", use({})], ["b", use({})]]), running: new Map([["a", 1], ["b", 0.5]]), unmatched: 0, minutesBought: null, estimate: false });
		const before = m.get("a")!.shared;
		const r = reconcile(m, { watching: 0, uploads: 0, other: 0.3, days: 31 }, 31);
		expect(r.get("a")!.shared - before).toBeCloseTo(0.2);
		expect(r.get("b")!.shared - m.get("b")!.shared).toBeCloseTo(0.1);
	});

	it("puts watching no team's videos had, and charged, with the shared costs", () => {
		const m = month({ a: {}, b: {} });
		const r = reconcile(m, { watching: 0.2, uploads: 0, other: 0, days: 31 }, 31);
		expect(r.get("a")!.shared - m.get("a")!.shared).toBeCloseTo(0.1);
	});

	it("takes the plan's free watching off before it prices the rest", () => {
		expect(month({ a: { watched: 3000 }, b: { watched: 1000 } }, { freeMinutes: 1000 }).get("a")!.viewing).toBeCloseTo(2.25);
		expect(month({ a: { watched: 800 } }, { freeMinutes: 1000 }).get("a")!.viewing).toBe(0);
	});
});
