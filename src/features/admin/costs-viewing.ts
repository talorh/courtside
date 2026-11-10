// Minutes watched by month and team, for Costs: Cloudflare's analytics by video, each video's minutes put to its team
// ('' when no team has it), saved by month. Read again when they're over an hour old: this month and last always
// (last month's last days come in late), and any month of the season not saved yet. One query a month.
import { logProblem } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import { monthOf, monthSpan, seasonMonths } from "./costs-prices.ts";
import { type SavedViews, saveViews, savedViews, streamUidTeams } from "./costs-repository.ts";

const FRESH_MS = 60 * 60_000;
const WAIT_MS = 5_000;

/** "now": just read; "saved": as saved, read in the last hour; "failed": Cloudflare didn't answer, so as saved; "off": no
 * read-only token (local dev), so nothing watched is known. */
export interface Viewing { views: SavedViews[]; read: "now" | "saved" | "failed" | "off"; savedAt: string | null }

const latest = (rows: SavedViews[]) => rows.reduce<string | null>((a, r) => (a && a > r.savedAt ? a : r.savedAt), null);

export async function viewing(deps: AppDeps, seasonStart: number): Promise<Viewing> {
	const saved = await savedViews(deps.db);
	const now = deps.now(), month = monthOf(now.toISOString());
	if (!deps.cloudflare) return { views: saved, read: "off", savedAt: latest(saved) };
	const thisMonth = latest(saved.filter((r) => r.month === month));
	if (thisMonth && now.getTime() - Date.parse(thisMonth) < FRESH_MS) return { views: saved, read: "saved", savedAt: thisMonth };
	const last = monthOf(new Date(Date.parse(monthSpan(month).start) - 1).toISOString());
	const known = new Set(saved.map((r) => r.month));
	const months = [...new Set([last, month, ...seasonMonths(seasonStart).filter((m) => m < month && !known.has(m))])];
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Cloudflare took more than ${WAIT_MS} ms`)), WAIT_MS); });
		const cf = deps.cloudflare;
		const [teams, ...read] = await Promise.race([Promise.all([streamUidTeams(deps.db), ...months.map((m) => {
			const { start, end } = monthSpan(m);
			return cf.minutesByVideo(start.slice(0, 10), new Date(Date.parse(end) - 1).toISOString().slice(0, 10));
		})]), late]);
		// Each month read keeps a row, so a month with nothing watched yet is known to be read (not read again for an hour).
		const sums = new Map<string, number>(months.map((m) => [`${m}|`, 0]));
		for (const g of read.flat()) {
			const key = `${monthOf(g.date)}|${teams.get(g.uid) ?? ""}`;
			sums.set(key, (sums.get(key) ?? 0) + g.minutes);
		}
		const rows = [...sums].map(([key, minutes]) => ({ month: key.slice(0, 7), teamId: key.slice(8), minutes }));
		await saveViews(deps.db, months, rows, now.toISOString());
		return { views: [...saved.filter((r) => !months.includes(r.month)), ...rows.map((r) => ({ ...r, savedAt: now.toISOString() }))], read: "now", savedAt: now.toISOString() };
	} catch (err) {
		console.error(JSON.stringify({ event: "costs_viewing_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "site_problem", teamId: null, what: "Stream's minutes watched couldn't be read for Costs (it shows the copy saved)", error: err });
		return { views: saved, read: "failed", savedAt: latest(saved) };
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}
