// Cloudflare's bill as last read, day by day (billed_usage). The account's, belonging to no team, so a CROSS_TEAM
// exception in scripts/rules.mjs.
import type { BilledRow } from "../../platform/cloudflare-billing.ts";

export async function savedBill(db: D1Database): Promise<{ rows: BilledRow[]; savedAt: string | null }> {
	const { results } = await db.prepare(`SELECT day, service, family, quantity, billable, unit, billed, period_start AS periodStart, saved_at AS savedAt
		FROM billed_usage ORDER BY day, rowid`).all<BilledRow & { savedAt: string }>();
	const savedAt = results.reduce<string | null>((a, r) => (a && a > r.savedAt ? a : r.savedAt), null);
	return { rows: results.map(({ savedAt: _, ...r }) => r), savedAt };
}

/** The days in `rows` replaced, whole, by them; and days before `keepFrom` gone. */
export async function saveBill(db: D1Database, rows: BilledRow[], savedAt: string, keepFrom: string): Promise<void> {
	const days = [...new Set(rows.map((r) => r.day))];
	await db.batch([
		...days.map((d) => db.prepare("DELETE FROM billed_usage WHERE day = ?").bind(d)),
		...rows.map((r) => db.prepare(`INSERT INTO billed_usage (day, service, family, quantity, billable, unit, billed, period_start, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (day, service) DO UPDATE SET quantity = quantity + excluded.quantity, billable = billable + excluded.billable, billed = billed + excluded.billed`)
			.bind(r.day, r.service, r.family, r.quantity, r.billable, r.unit, r.billed, r.periodStart, savedAt)),
		db.prepare("DELETE FROM billed_usage WHERE day < ?").bind(keepFrom),
	]);
}
