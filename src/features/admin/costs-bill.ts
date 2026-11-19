// Cloudflare's bill for Costs: read from Cloudflare (platform/cloudflare-billing.ts) when the copy saved is 20 hours old, or
// whenever the 3am job asks, and saved; in a new billing period's first three days the period before is read again too,
// as its last days come in late. Cloudflare's own read reaches back into the period before as well, so a day either read
// brings is taken from the first read that has it, never added up from both. When Cloudflare doesn't answer, the copy
// saved, and it's asked again 15 minutes later, not on every page in between. A page waits 5 seconds for it at most;
// the 3am job as long as each call takes (15 seconds each, platform/cloudflare-billing.ts).
import { logProblem } from "./problem-log.ts";
import { lastSiteProblemAt } from "./problems-repository.ts";
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
const RETRY_MS = 15 * 60_000;
const FAILED = "Cloudflare's bill couldn't be read (Costs shows the copy saved)";

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
/** The same date a month before ('YYYY-MM-DD'), the month's last day where it's shorter: when the period before a
 * billing period began. */
function monthBefore(day: string): string {
	const [y, m, d] = day.split("-").map(Number) as [number, number, number];
	return dayOf(new Date(Date.UTC(y, m - 2, Math.min(d, new Date(Date.UTC(y, m - 1, 0)).getUTCDate()))));
}

async function read(deps: AppDeps & { billing: NonNullable<AppDeps["billing"]> }): Promise<BilledRow[]> {
	const now = deps.now();
	const rows = await deps.billing.usage();
	const start = rows.reduce<string | null>((p, r) => (p && p > r.periodStart ? p : r.periodStart), null);
	if (!start || dayOf(now) > dayOf(addDays(new Date(`${start}T00:00:00Z`), LATE_DAYS))) return rows;
	// `to` is the day after the last one Cloudflare returns: the new period's first day.
	const before = await deps.billing.usage({ from: monthBefore(start), to: start });
	const have = new Set(rows.map((r) => r.day));
	return [...rows, ...before.filter((r) => !have.has(r.day))];
}

export async function loadBill(deps: AppDeps, o: { force?: boolean } = {}): Promise<Bill> {
	const saved = await savedBill(deps.db);
	const billing = deps.billing;
	if (!billing) return { ...saved, read: "off" };
	const now = deps.now();
	if (!o.force && saved.savedAt && now.getTime() - Date.parse(saved.savedAt) < FRESH_MS) return { ...saved, read: "saved" };
	const failedAt = o.force ? null : await lastSiteProblemAt(deps.db, FAILED);
	if (failedAt && now.getTime() - Date.parse(failedAt) < RETRY_MS) return { ...saved, read: "failed" };
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const reading = read({ ...deps, billing });
		const rows = o.force ? await reading
			: await Promise.race([reading, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Cloudflare's bill took more than ${WAIT_MS} ms`)), WAIT_MS); })]);
		await saveBill(deps.db, rows, now.toISOString(), dayOf(addDays(now, -KEEP_DAYS)));
		return { ...(await savedBill(deps.db)), read: "now" };
	} catch (err) {
		console.error(JSON.stringify({ event: "costs_bill_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "site_problem", teamId: null, what: FAILED, error: err });
		return { ...saved, read: "failed" };
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}
