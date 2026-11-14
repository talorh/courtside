import { describe, expect, it } from "vitest";
import { allowanceOf, billedMonths, freeWatchMinutes, periodProducts } from "../../../src/features/admin/costs-bill-summary.ts";
import type { BilledRow } from "../../../src/platform/cloudflare-billing.ts";

// Cloudflare's bill as Costs reads it: each product's free allowance (from its name, as Cloudflare words it), the billing
// period's use of each against it, the bill by calendar month (what it charged for watching, for R2, and for the rest),
// and how many minutes of watching the plan includes, learned from what it charged.

const row = (o: Partial<BilledRow>): BilledRow => ({ day: "2026-10-16", service: "x", family: "Workers", quantity: 1, billable: 0, unit: "Count", billed: 0, periodStart: "2026-10-16", ...o });
const WATCH = "Stream Bundle Basic Minutes of Video Viewed (in thousands)";

describe("Cloudflare's bill, summed up", () => {
	it("reads each product's free allowance from its name, as Cloudflare words it", () => {
		expect(allowanceOf("Workers Standard Requests (first 10M are included)")).toBe(10_000_000);
		expect(allowanceOf("D1 - Rows Read (first 25 billion included)")).toBe(25_000_000_000);
		expect(allowanceOf("R2 Data Storage (First 10GB-Month included)")).toBe(10);
		expect(allowanceOf("Email Service - Emails Sent (First 3,000 emails included)")).toBe(3000);
		expect(allowanceOf("Worker Build Minutes (6000 minutes included per month)")).toBe(6000);
		expect(allowanceOf("D1 - Storage GB-mo (first 5GB included)")).toBe(5);
		expect(allowanceOf("R2 Storage Class A Operations (First 1M included)")).toBe(1_000_000);
		expect(allowanceOf("Durable Objects Compute Duration (GB*S, First 400,000 GB*S is included)")).toBe(400_000);
		expect(allowanceOf(WATCH)).toBeNull();
		expect(allowanceOf("Regular Twitch Neurons (RTN)")).toBeNull();
	});

	it("puts an allowance in hours or minutes in the seconds the product is counted in, so the two compare", () => {
		const products = periodProducts([
			row({ service: "Container Memory, per GiB-Second (First 25 GiB-hours included)", quantity: 42_288 }),
			row({ service: "Container Disk, per GB second (First 200 GB hours included)", quantity: 90_433 }),
			row({ service: "Container vCPU (First 375 vCPU-minutes included)", quantity: 252, unit: "vCPU-seconds" }),
			row({ service: "Durable Objects Compute Duration (GB*S, First 400,000 GB*S is included)", quantity: 1555, unit: "GB-seconds" }),
			row({ service: "Worker Build Minutes (6000 minutes included per month)", quantity: 207 }),
		]).products.map((p) => [p.name, p.allowance]);
		expect(products).toEqual([
			["Container Memory, per GiB-Second", 90_000],
			["Container Disk, per GB second", 720_000],
			["Container vCPU", 22_500],
			["Durable Objects Compute Duration", 400_000],
			["Worker Build Minutes", 6000],
		]);
	});

	it("adds up the billing period's use of each product, against its allowance, with what it was billed", () => {
		const rows = [
			row({ service: "Workers Standard Requests (first 10M are included)", quantity: 30_000, day: "2026-10-20" }),
			row({ service: "Workers Standard Requests (first 10M are included)", quantity: 10_026, day: "2026-10-21" }),
			row({ service: WATCH, family: "Stream", quantity: 1150, billable: 1150, billed: 0 }),
			// An earlier period's row isn't this period's.
			row({ service: WATCH, family: "Stream", quantity: 9999, periodStart: "2026-09-16", day: "2026-09-20" }),
		];
		const p = periodProducts(rows);
		expect(p.periodStart).toBe("2026-10-16");
		expect(p.lastDay).toBe("2026-10-21");
		expect(p.products).toEqual([
			{ service: "Workers Standard Requests (first 10M are included)", name: "Workers Standard Requests", family: "Workers", used: 40_026, allowance: 10_000_000, unit: "Count", billed: 0 },
			{ service: WATCH, name: "Stream Bundle Basic Minutes of Video Viewed", family: "Stream", used: 1150, allowance: null, unit: "Count", billed: 0 },
		]);
		expect(periodProducts([]).products).toEqual([]);
	});

	it("sums the bill by calendar month: watching, R2 and the rest, and the days it covers", () => {
		const months = billedMonths([
			row({ day: "2026-10-30", service: WATCH, family: "Stream", billed: 0.4 }),
			row({ day: "2026-10-31", family: "R2", billed: 0.1 }), row({ day: "2026-10-31", family: "Workers", billed: 0.02 }),
			row({ day: "2026-11-01", service: WATCH, family: "Stream", billed: 0.3 }),
			row({ day: "2026-11-01", service: "Stream Bundle Basic Images Delivered (in hundred thousands)", family: "Stream", billed: 0.05 }),
		]);
		expect(months.get("2026-10")).toEqual({ watching: 0.4, uploads: 0.1, other: 0.02, days: 2 });
		expect(months.get("2026-11")).toEqual({ watching: 0.3, uploads: 0, other: 0.05, days: 1 });
	});

	it("learns the watching the plan includes from what Cloudflare charged: all of it while it charged nothing, less what it charged past it", () => {
		expect(freeWatchMinutes([])).toBe(0);
		expect(freeWatchMinutes([row({ service: WATCH, family: "Stream", quantity: 700 }), row({ service: WATCH, family: "Stream", quantity: 450, day: "2026-10-17" })])).toBe(1150);
		// A period with 6,000 minutes watched and US$1 charged ($1 a thousand): 5,000 were included.
		const charged = [row({ service: WATCH, family: "Stream", quantity: 6000, billed: 1, periodStart: "2026-09-16", day: "2026-09-20" })];
		expect(freeWatchMinutes([...charged, row({ service: WATCH, family: "Stream", quantity: 1150 })])).toBe(5000);
	});
});
