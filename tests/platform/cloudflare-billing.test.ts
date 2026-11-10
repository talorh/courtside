import { describe, expect, it } from "vitest";
import { createCloudflareBilling } from "../../src/platform/cloudflare-billing.ts";
import { fakeFetch } from "../helpers/fake-fetch.ts";

// Cloudflare's own bill, day by day (its billable usage: the system its invoices come from), with the read-only token's
// Billing Read: each day's use of each product, what of it was billable past the free allowance, and what it cost.

const record = (o: Record<string, unknown>) => ({
	ServiceName: "R2 Storage Class A Operations (First 1M included)", ServiceFamilyName: "R2", ChargePeriodStart: "2026-10-16T00:00:00Z",
	BillingPeriodStart: "2026-10-16T00:00:00Z", ConsumedQuantity: 19, PricingQuantity: 0, PricingUnit: "Count", BilledCost: 0, ...o,
});

describe("Cloudflare's bill", () => {
	it("reads the billing period's usage day by day with the read-only token", async () => {
		const { calls, fetch } = fakeFetch({ body: { success: true, result: [record({}), record({ ServiceName: "Stream Bundle Basic Minutes of Video Viewed (in thousands)", ServiceFamilyName: "Stream", ChargePeriodStart: "2026-11-02T00:00:00Z", ConsumedQuantity: 300, PricingQuantity: 300, BilledCost: 0.05 })] } });
		const rows = await createCloudflareBilling({ accountId: "acct", token: "tok", fetch }).usage();
		expect(rows).toEqual([
			{ day: "2026-10-16", service: "R2 Storage Class A Operations (First 1M included)", family: "R2", quantity: 19, billable: 0, unit: "Count", billed: 0, periodStart: "2026-10-16" },
			{ day: "2026-11-02", service: "Stream Bundle Basic Minutes of Video Viewed (in thousands)", family: "Stream", quantity: 300, billable: 300, unit: "Count", billed: 0.05, periodStart: "2026-10-16" },
		]);
		expect(calls[0]!.url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/billable-usage");
		expect(new Headers(calls[0]!.init.headers).get("Authorization")).toBe("Bearer tok");
	});

	it("reads an earlier billing period when asked, by its days", async () => {
		const { calls, fetch } = fakeFetch({ body: { success: true, result: [] } });
		await createCloudflareBilling({ accountId: "acct", token: "tok", fetch }).usage({ from: "2026-10-16", to: "2026-11-15" });
		expect(calls[0]!.url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/billable-usage?from=2026-10-16&to=2026-11-15");
	});

	it("says why when Cloudflare refuses (the token without Billing Read, say)", async () => {
		const { fetch } = fakeFetch({ status: 403, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } });
		await expect(createCloudflareBilling({ accountId: "acct", token: "tok", fetch }).usage()).rejects.toThrow("Cloudflare's bill (403): Authentication error");
	});

	it("leaves out a record it can't read rather than count it wrong", async () => {
		const { fetch } = fakeFetch({ body: { success: true, result: [record({ ChargePeriodStart: null }), record({ BilledCost: "lots" }), record({})] } });
		expect(await createCloudflareBilling({ accountId: "acct", token: "tok", fetch }).usage()).toHaveLength(1);
	});
});
