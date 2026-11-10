// Cloudflare's bill for Costs: read from Cloudflare (platform/cloudflare-billing.ts) when the copy saved is 20 hours old, or
// whenever the 3am job asks, and saved; in a new billing period's first three days the period before is read again too,
// as its last days come in late. When Cloudflare doesn't answer, the copy saved. Costs waits 5 seconds for it at most.
import { logProblem } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import type { BilledRow } from "../../platform/cloudflare-billing.ts";
import { addDays } from "../../shared/time.ts";
import { savedBill, saveBill } from "./costs-bill-repository.ts";

/** "now": just read; "saved": as read in the last day; "failed": Cloudflare didn't answer, so as saved; "off": no
 * read-only token (local dev), so no bill. */
export interface Bill { rows: BilledRow[]; read: "now" | "saved" | "failed" | "off"; savedAt: string | null }

const FRESH_MS = 20 * 3_600_000;
const WAIT_MS = 5_000;
const KEEP_DAYS = 400;
const LATE_DAYS = 3;

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
/** The same day a month before ('YYYY-MM-DD'): when the period before a billing period began. */
const monthBefore = (day: string) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return dayOf(d); };

async function read(deps: AppDeps & { billing: NonNullable<AppDeps["billing"]> }): Promise<BilledRow[]> {
	const now = deps.now();
	const rows = await deps.billing.usage();
	const start = rows.reduce<string | null>((p, r) => (p && p > r.periodStart ? p : r.periodStart), null);
	if (!start || dayOf(now) > dayOf(addDays(new Date(`${start}T00:00:00Z`), LATE_DAYS))) return rows;
	return [...rows, ...await deps.billing.usage({ from: monthBefore(start), to: dayOf(addDays(new Date(`${start}T00:00:00Z`), -1)) })];
}

export async function loadBill(deps: AppDeps, o: { force?: boolean } = {}): Promise<Bill> {
	const saved = await savedBill(deps.db);
	const billing = deps.billing;
	if (!billing) return { ...saved, read: "off" };
	const now = deps.now();
	if (!o.force && saved.savedAt && now.getTime() - Date.parse(saved.savedAt) < FRESH_MS) return { ...saved, read: "saved" };
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Cloudflare's bill took more than ${WAIT_MS} ms`)), WAIT_MS); });
		const rows = await Promise.race([read({ ...deps, billing }), late]);
		await saveBill(deps.db, rows, now.toISOString(), dayOf(addDays(now, -KEEP_DAYS)));
		return { ...(await savedBill(deps.db)), read: "now" };
	} catch (err) {
		console.error(JSON.stringify({ event: "costs_bill_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "site_problem", teamId: null, what: "Cloudflare's bill couldn't be read (Costs shows the copy saved)", error: err });
		return { ...saved, read: "failed" };
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}
