// The 3am job's two records on Platform: the nightly database backup and the clean-up of Stream (videos) and Images
// (photos), each with a warning when it's missing, old or didn't finish.
import type { StoredObject } from "../../../platform/r2-originals.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime } from "../../../shared/time.ts";

// The backup runs every night, so one older than this means a night was missed (or its checks failed).
const STALE_HOURS = 36;

const when = (iso: string) => formatGameDate(localTime(new Date(iso)));
const stale = (iso: string, now: Date) => now.getTime() - Date.parse(iso) > STALE_HOURS * 3_600_000;

export function backupLine(b: StoredObject | null, now: Date): SafeHtml {
	if (!b) return html`<p class="note warn" role="status">No database backup yet. The first one is made at 3am.</p>`;
	const tables = b.custom.tables ? Object.keys(JSON.parse(b.custom.tables) as object).length : 0;
	const text = `Database backup: ${when(b.uploaded)}, ${b.custom.rows ?? "?"} rows in ${tables} tables. Kept 14 days.`;
	if (b.custom.problems) return html`<p class="note warn" role="status">${text} It failed its checks (${b.custom.problems}): check the Worker logs for <b>db_backup</b>.</p>`;
	if (stale(b.uploaded, now)) return html`<p class="note warn" role="status">${text} That's more than a day old: check the Worker logs for <b>db_backup</b>.</p>`;
	return html`<p class="small">${text} Checked: every row is in it, and it was stored intact.</p>`;
}

/** What the clean-up removed that no team uses, or that it didn't finish. */
export function sweepLine(s: StoredObject | null, now: Date): SafeHtml {
	if (!s?.custom.at) return html`<p class="small">Video and photo clean-up: not run yet. It runs at 3am, after the backup.</p>`;
	const text = `Video and photo clean-up: ${when(s.custom.at)}.`;
	if (s.custom.ok !== "yes") return html`<p class="note warn" role="status">${text} It didn't finish (${s.custom.problem}): check the Worker logs for <b>orphan_sweep</b>.</p>`;
	if (stale(s.custom.at, now)) return html`<p class="note warn" role="status">${text} That's more than a day old: check the Worker logs for <b>orphan_sweep</b>.</p>`;
	const [found, removed] = [Number(s.custom.found), Number(s.custom.removed)];
	const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;
	const what = removed === 0 ? "Nothing to remove." : found > removed
		? `Removed ${removed} of ${things(found)} nothing on the site uses; the rest go the next night.`
		: `Removed ${things(removed)} nothing on the site uses.`;
	return html`<p class="small">${text} ${what}</p>`;
}
