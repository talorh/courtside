import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBill } from "../../../src/features/admin/costs-bill.ts";
import type { BilledRow, CloudflareBilling } from "../../../src/platform/cloudflare-billing.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

// Cloudflare's bill as Costs keeps it: read from Cloudflare when the saved copy is 20 hours old (or the 3am job asks),
// saved day by day, each read replacing the days it brings back; the period before read too in a new period's first
// days, as its last days come in late; what's saved when Cloudflare doesn't answer.

afterEach(() => vi.restoreAllMocks());

const row = (o: Partial<BilledRow>): BilledRow => ({ day: "2026-11-03", service: "Workers Standard Requests (first 10M are included)", family: "Workers", quantity: 100, billable: 0, unit: "Count", billed: 0, periodStart: "2026-10-16", ...o });

function billing(...answers: BilledRow[][]) {
	const asked: Array<{ from: string; to: string } | undefined> = [];
	const port: CloudflareBilling = { usage: async (range) => { asked.push(range); return answers.length > 1 ? answers.shift()! : answers[0] ?? []; } };
	return { asked, port };
}

const at = (iso: string) => ({ ...createTestDeps(), now: () => new Date(iso) });

describe("Cloudflare's bill, kept for Costs", () => {
	it("says it's off without the read-only token", async () => {
		expect(await loadBill(at("2026-11-05T00:00:00Z"))).toEqual({ rows: [], read: "off", savedAt: null });
	});

	it("reads the bill, saves it, and uses what's saved for a day after", async () => {
		const deps = at("2026-11-05T00:00:00Z");
		const b = billing([row({}), row({ day: "2026-11-04", billed: 0.25 })]);
		const first = await loadBill({ ...deps, billing: b.port });
		expect(first.read).toBe("now");
		expect(first.rows.map((r) => [r.day, r.billed])).toEqual([["2026-11-03", 0], ["2026-11-04", 0.25]]);
		const later = { ...deps, billing: b.port, now: () => new Date("2026-11-05T19:00:00Z") };
		expect((await loadBill(later)).read).toBe("saved");
		expect(b.asked).toEqual([undefined]);
		// The 3am job reads it whatever, and so does Costs once that read is 20 hours old.
		expect((await loadBill(later, { force: true })).read).toBe("now");
		expect((await loadBill({ ...later, now: () => new Date("2026-11-06T14:00:00Z") })).read).toBe("saved");
		expect((await loadBill({ ...later, now: () => new Date("2026-11-06T15:00:00Z") })).read).toBe("now");
		expect(b.asked).toHaveLength(3);
	});

	it("replaces each day it reads again, whole, and keeps the days it didn't", async () => {
		const deps = at("2026-11-05T00:00:00Z");
		await loadBill({ ...deps, billing: billing([row({ day: "2026-11-02" }), row({ day: "2026-11-03" }), row({ day: "2026-11-03", service: "Gone" })]).port });
		const again = await loadBill({ ...deps, billing: billing([row({ day: "2026-11-03", quantity: 900 })]).port }, { force: true });
		expect(again.rows.map((r) => [r.day, r.service.slice(0, 7), r.quantity])).toEqual([["2026-11-02", "Workers", 100], ["2026-11-03", "Workers", 900]]);
	});

	it("reads the period before too in a new period's first three days, as its last days come in late", async () => {
		const b = billing([row({ day: "2026-11-16", periodStart: "2026-11-16" })], [row({ day: "2026-11-15" })]);
		await loadBill({ ...at("2026-11-17T00:00:00Z"), billing: b.port });
		expect(b.asked).toEqual([undefined, { from: "2026-10-16", to: "2026-11-16" }]);
		const quiet = billing([row({ day: "2026-11-20", periodStart: "2026-11-16" })]);
		await loadBill({ ...at("2026-11-21T00:00:00Z"), billing: quiet.port });
		expect(quiet.asked).toEqual([undefined]);
	});

	it("counts a day once when both reads bring it back: Cloudflare's own read goes back into the period before", async () => {
		const current = [row({ day: "2026-11-14", quantity: 0.5358 }), row({ day: "2026-11-15", quantity: 0.5358 }), row({ day: "2026-11-16", quantity: 0.563, periodStart: "2026-11-16" })];
		// Its `to` is the day after the last: the period before ends on 15 Nov.
		const before = [row({ day: "2026-11-13", quantity: 0.5358 }), row({ day: "2026-11-14", quantity: 0.5358 }), row({ day: "2026-11-15", quantity: 0.5358 })];
		const b = billing(current, before);
		const saved = await loadBill({ ...at("2026-11-18T16:00:00Z"), billing: b.port });
		expect(b.asked).toEqual([undefined, { from: "2026-10-16", to: "2026-11-16" }]);
		expect(saved.rows.map((r) => [r.day, r.quantity])).toEqual([["2026-11-13", 0.5358], ["2026-11-14", 0.5358], ["2026-11-15", 0.5358], ["2026-11-16", 0.563]]);
	});

	it("shows what's saved, and says so, when Cloudflare doesn't answer", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const deps = at("2026-11-05T00:00:00Z");
		await loadBill({ ...deps, billing: billing([row({})]).port });
		const down: CloudflareBilling = { usage: async () => { throw new Error("Cloudflare's bill (403): Authentication error"); } };
		const failed = await loadBill({ ...deps, billing: down }, { force: true });
		expect(failed).toMatchObject({ read: "failed", savedAt: "2026-11-05T00:00:00.000Z" });
		expect(failed.rows).toHaveLength(1);
	});

	it("gives the 3am job's read as long as Cloudflare takes, each call within its own time; a page waits 5 seconds", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const slow: CloudflareBilling = { usage: () => new Promise((done) => setTimeout(() => done([row({})]), 6_000)) };
			const night = loadBill({ ...at("2026-11-05T00:00:00Z"), billing: slow }, { force: true });
			await vi.advanceTimersByTimeAsync(6_000);
			expect((await night).read).toBe("now");
			vi.spyOn(console, "error").mockImplementation(() => {});
			const page = loadBill({ ...at("2026-11-06T09:00:00Z"), billing: slow });
			await vi.advanceTimersByTimeAsync(6_000);
			expect((await page).read).toBe("failed");
		} finally {
			vi.useRealTimers();
		}
	});

	it("asks Cloudflare again 15 minutes after it didn't answer, not on every page in between", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let asked = 0;
		const down: CloudflareBilling = { usage: async () => { asked++; throw new Error("Cloudflare's bill (503): busy"); } };
		const deps = at("2026-11-05T00:00:00Z");
		expect((await loadBill({ ...deps, billing: down })).read).toBe("failed");
		expect((await loadBill({ ...deps, now: () => new Date("2026-11-05T00:14:00Z"), billing: down })).read).toBe("failed");
		expect(asked).toBe(1);
		await loadBill({ ...deps, now: () => new Date("2026-11-05T00:16:00Z"), billing: down });
		expect(asked).toBe(2);
		// The 3am job asks whatever.
		await loadBill({ ...deps, now: () => new Date("2026-11-05T00:17:00Z"), billing: down }, { force: true });
		expect(asked).toBe(3);
	});

	it("asks for the period before from the same date a month back, the month's last day where it's shorter", async () => {
		const b = billing([row({ day: "2027-03-31", periodStart: "2027-03-31" })], []);
		await loadBill({ ...at("2027-04-01T00:00:00Z"), billing: b.port });
		expect(b.asked).toEqual([undefined, { from: "2027-02-28", to: "2027-03-31" }]);
	});

	it("keeps 400 days", async () => {
		const deps = at("2027-12-30T00:00:00Z");
		await loadBill({ ...deps, billing: billing([row({ day: "2026-11-03" }), row({ day: "2026-11-30" }), row({ day: "2027-12-29", periodStart: "2027-12-16" })]).port });
		const kept = await deps.db.prepare("SELECT day FROM billed_usage ORDER BY day").all<{ day: string }>();
		expect(kept.results.map((r) => r.day)).toEqual(["2026-11-30", "2027-12-29"]);
	});
});
