// Cloudflare's own bill, day by day: its billable usage (the same records its invoices are made from), with the read-only
// account token courtside-insights-read and its Billing Read. Each day's use of each product, how much of that was billable
// past the product's free allowance, and what it cost, in US dollars. Fixed plan fees aren't in it. Thin, like every
// platform client.

/** One product's use on one UTC day, in the billing period starting `periodStart`. `quantity`: all it used;
 * `billable`: the part past its free allowance; `billed`: what that cost (US$). */
export interface BilledRow { day: string; service: string; family: string; quantity: number; billable: number; unit: string; billed: number; periodStart: string }

export interface CloudflareBilling {
	/** The current billing period's days so far, or the days `from` to `to` ('YYYY-MM-DD', a whole period). */
	usage(range?: { from: string; to: string }): Promise<BilledRow[]>;
}

const API = "https://api.cloudflare.com/client/v4";

interface Raw {
	ServiceName?: unknown; ServiceFamilyName?: unknown; ChargePeriodStart?: unknown; BillingPeriodStart?: unknown;
	ConsumedQuantity?: unknown; PricingQuantity?: unknown; PricingUnit?: unknown; BilledCost?: unknown;
}

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toRow(r: Raw): BilledRow | null {
	const d = day(r.ChargePeriodStart), period = day(r.BillingPeriodStart), quantity = num(r.ConsumedQuantity), billable = num(r.PricingQuantity), billed = num(r.BilledCost);
	if (!d || !period || quantity === null || billable === null || billed === null || typeof r.ServiceName !== "string") return null;
	return { day: d, service: r.ServiceName, family: typeof r.ServiceFamilyName === "string" ? r.ServiceFamilyName : "", quantity, billable, unit: typeof r.PricingUnit === "string" ? r.PricingUnit : "", billed, periodStart: period };
}

export function createCloudflareBilling(o: { accountId: string; token: string; fetch?: typeof fetch }): CloudflareBilling {
	const doFetch = o.fetch ?? fetch;
	return {
		async usage(range) {
			const query = range ? `?from=${range.from}&to=${range.to}` : "";
			const res = await doFetch(`${API}/accounts/${o.accountId}/billable-usage${query}`, { headers: { Authorization: `Bearer ${o.token}` }, signal: AbortSignal.timeout(15_000) });
			const body = (await res.json().catch(() => ({}))) as { success?: boolean; result?: unknown; errors?: Array<{ message?: string }> };
			if (!res.ok || !body.success || !Array.isArray(body.result)) throw new Error(`Cloudflare's bill (${res.status}): ${body.errors?.map((e) => e.message).join("; ") || "no details"}`);
			return (body.result as Raw[]).map(toRow).filter((r): r is BilledRow => r !== null);
		},
	};
}
