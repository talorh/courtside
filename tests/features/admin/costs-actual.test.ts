import { describe, expect, it } from "vitest";
import type { BilledRow } from "../../../src/platform/cloudflare-billing.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { addTeam } from "../../helpers/two-teams.ts";

// Costs says plainly what's actual (Cloudflare's own bill) and what's estimated, on every figure, and shows Cloudflare's
// bill for the billing period: what it charged, the plan's fees, and each product's free allowance, how much of it is used.

const NOW = "2026-11-15T00:00:00.000Z";
const row = (o: Partial<BilledRow>): BilledRow => ({ day: "2026-11-02", service: "Workers Standard Requests (first 10M are included)", family: "Workers", quantity: 40_026, billable: 0, unit: "Count", billed: 0, periodStart: "2026-10-16", ...o });
const BILL: BilledRow[] = [
	row({}),
	row({ service: "Stream Bundle Basic Minutes of Video Viewed (in thousands)", family: "Stream", quantity: 1150, billable: 1150, day: "2026-11-14" }),
	row({ service: "Email Service - Emails Sent (First 3,000 emails included)", family: "Email", quantity: 2700, day: "2026-10-20" }),
	row({ service: "R2 Data Storage (First 10GB-Month included)", family: "R2", quantity: 12, billable: 2, billed: 0.03, day: "2026-11-10" }),
];

async function page(billing: BilledRow[] | null, path = "/admin/costs") {
	const deps = { ...createTestDeps(), now: () => new Date(NOW) };
	await deps.db.prepare("UPDATE teams SET created_at = '2026-10-01T00:00:00.000Z'").run();
	await addTeam(deps.db);
	return (await makeClient({ ...deps, billing: billing && { usage: async () => billing } })(path)).text();
}

const tile = (html: string, label: string) => html.match(new RegExp(`<span>${label}</span><span class="pill (\\w+)">([^<]+)</span>`))?.slice(1);

describe("Costs: actual and estimated", () => {
	it("says on every figure whether it's actual, Cloudflare's own bill, or estimated", async () => {
		const html = await page(BILL);
		expect(tile(html, "This month, every team")).toEqual(["actual", "Actual"]);
		expect(tile(html, "This season so far")).toEqual(["actual", "Actual"]);
		expect(tile(html, "Stream storage")).toEqual(["actual", "Actual"]);
		expect(tile(html, "The season, estimated")).toEqual(["est", "Estimated"]);
		expect(tile(html, "Budgets, 2 teams")).toEqual(["est", "Estimated"]);
		// A player a season is the season's estimate over the squads, so it's estimated even once the bill is read.
		expect(tile(html, "A player a season")).toEqual(["est", "Estimated"]);
		expect(html).toMatch(/<span class="delta">\$[\d.]+ actual and \$[\d,.]+ estimated<\/span>/);
	});

	it("calls no dollar figure actual before Cloudflare's bill has been read", async () => {
		const html = await page(null);
		expect(tile(html, "This season so far")).toEqual(["est", "Not billed"]);
		expect(tile(html, "This month, every team")).toEqual(["est", "Not billed"]);
		// Stream's own count of minutes stored is actual, bill or no bill.
		expect(tile(html, "Stream storage")).toEqual(["actual", "Actual"]);
		expect(html).toContain("Cloudflare's bill hasn't been read: it needs the read-only token");
	});

	it("marks each month actual (Cloudflare's bill) or estimated, on the chart and in its words", async () => {
		const html = await page(BILL);
		expect(html).toContain('<li><span class="sw solid" aria-hidden="true"></span>Actual: Cloudflare&#39;s bill</li><li><span class="sw light" aria-hidden="true"></span>Estimated</li>');
		expect(html).toMatch(/<title>Oct 2026 \(actual, Cloudflare&#39;s bill for 1 of its 31 days\): \$/);
		expect(html).toMatch(/<title>Dec 2026 \(estimated\): \$/);
	});

	it("shows Cloudflare's bill for the billing period: what it charged, the plan's fees, and each product against its free allowance", async () => {
		const html = await page(BILL, "/admin/costs?cur=usd");
		const bill = html.slice(html.indexOf("<b>Cloudflare's bill</b>"), html.indexOf("</figure>", html.indexOf("<b>Cloudflare's bill</b>")));
		expect(bill).toContain("Billing period from 16 Oct, billed to 14 Nov");
		expect(bill).toMatch(/<b>\$0\.03<\/b><span>Usage charged<\/span>/);
		expect(bill).toMatch(/<b>\$15\.00<\/b><span>Plan fees, each period<\/span>/);
		// Workers Paid and the bundle, and the fake Stream's 1,100 minutes bought (one block past the bundle's 1,000).
		// Each product: its use against its allowance, as a meter, and what it cost; nearest its allowance first.
		expect(bill).toMatch(/Emails Sent<\/b>[^]*?2,700 of 3,000 free[^]*?class="fill warn"/);
		expect(bill).toMatch(/R2 Data Storage<\/b><\/span><span class="kval">12 of 10 free<\/span><span class="kval billed">\$0\.03<\/span>[^]*?class="fill over"/);
		expect(bill).toMatch(/Emails Sent<\/b><\/span><span class="kval">2,700 of 3,000 free<\/span><svg/);
		expect(bill).toMatch(/Standard Requests<\/b>[^]*?40,026 of 10,000,000 free/);
		expect(bill).toMatch(/Minutes of Video Viewed<\/b>[^]*?1,150, charged nothing so far/);
		expect(bill.indexOf("R2 Data Storage")).toBeLessThan(bill.indexOf("Emails Sent"));
		expect(bill.indexOf("Emails Sent")).toBeLessThan(bill.indexOf("Standard Requests"));
	});

	it("shows Cloudflare's dollars as Australian ones by default", async () => {
		const html = await page(BILL);
		const bill = html.slice(html.indexOf("<b>Cloudflare's bill</b>"));
		expect(bill).toMatch(/<b>\$22\.50<\/b><span>Plan fees, each period<\/span>/);
	});
});
