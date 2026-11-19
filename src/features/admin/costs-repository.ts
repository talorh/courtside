// What the Costs page reads: every team that isn't deleted, what each stores in Stream and R2 (from its videos and clips),
// which team each Stream video and live input is, the minutes watched saved by month, and each team's months saved
// once they're over. Admins only, so it reads every team (a CROSS_TEAM exception in scripts/rules.mjs). Figures only:
// no names or emails. And the exchange rate saved.
import { CLUB } from "../../club.ts";
import { DEFAULT_BUDGET_LOCAL } from "./costs-prices.ts";

/** `budget`: its season's, in the club's currency (the default unless one's been set: `budgetDefault`); `players`: in its
 * squad now, for cost a player. */
export interface CostTeam {
	id: string; code: string; seasonStart: number; status: "active" | "closed"; createdAt: string; closedAt: string | null;
	budget: number; budgetDefault: boolean; players: number;
}

/** A video or clip in Stream: its minutes, its original's bytes in R2 (videos only), and when it was there (a clip's
 * goes with its video's, when that's first). */
export interface StoredItem { teamId: string; kind: "video" | "clip"; minutes: number; bytes: number; createdAt: string; deletedAt: string | null }

export interface SavedViews { month: string; teamId: string; minutes: number; savedAt: string }

export async function costTeams(db: D1Database): Promise<CostTeam[]> {
	const { results } = await db.prepare(`SELECT id, code, season_start AS seasonStart, status, created_at AS createdAt, closed_at AS closedAt,
		COALESCE(budget, ?1) AS budget, budget IS NULL AS budgetDefault, (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id AND p.removed_at IS NULL) AS players
		FROM teams t WHERE status <> 'deleted' ORDER BY status, code`).bind(DEFAULT_BUDGET_LOCAL).all<CostTeam>();
	return results.map((t) => ({ ...t, budgetDefault: Boolean(t.budgetDefault) }));
}

export async function storedItems(db: D1Database): Promise<StoredItem[]> {
	const { results } = await db.prepare(`SELECT team_id AS teamId, 'video' AS kind, duration_seconds / 60.0 AS minutes,
			COALESCE(original_bytes, 0) AS bytes, created_at AS createdAt, deleted_at AS deletedAt
		FROM videos WHERE status = 'ready' AND duration_seconds IS NOT NULL
		UNION ALL SELECT c.team_id, 'clip', (c.end_seconds - c.start_seconds) / 60.0, 0, c.created_at,
			CASE WHEN c.deleted_at IS NULL THEN v.deleted_at WHEN v.deleted_at IS NULL THEN c.deleted_at ELSE MIN(c.deleted_at, v.deleted_at) END
		FROM clips c JOIN videos v ON v.id = c.video_id AND v.team_id = c.team_id WHERE c.status = 'ready'`).all<StoredItem>();
	return results;
}

/** Each Stream uid the site made, and its team: videos, clips and live inputs, and those of a deleted team, kept. */
export async function streamUidTeams(db: D1Database): Promise<Map<string, string>> {
	const { results } = await db.prepare(`SELECT uid, team_id AS teamId FROM stream_uid_teams
		UNION ALL SELECT stream_uid, team_id FROM videos WHERE stream_uid IS NOT NULL
		UNION ALL SELECT stream_uid, team_id FROM clips WHERE stream_uid IS NOT NULL
		UNION ALL SELECT live_input_uid, team_id FROM live_streams`).all<{ uid: string; teamId: string }>();
	return new Map(results.map((r) => [r.uid, r.teamId]));
}

export async function savedViews(db: D1Database): Promise<SavedViews[]> {
	const { results } = await db.prepare("SELECT month, team_id AS teamId, minutes, saved_at AS savedAt FROM cost_views").all<SavedViews>();
	return results;
}

/** The months' minutes as Cloudflare has them now: each month given is replaced whole. */
export async function saveViews(db: D1Database, months: string[], rows: Array<Omit<SavedViews, "savedAt">>, savedAt: string): Promise<void> {
	await db.batch([
		...months.map((m) => db.prepare("DELETE FROM cost_views WHERE month = ?").bind(m)),
		...rows.map((r) => db.prepare("INSERT INTO cost_views (month, team_id, minutes, saved_at) VALUES (?, ?, ?, ?)").bind(r.month, r.teamId, r.minutes, savedAt)),
	]);
}

/** A team's month as Costs showed it once the month was over (costs-saved.ts): its dollars, how much of it Cloudflare
 * billed, and its use. */
export interface SavedMonth {
	month: string; teamId: string; storage: number; viewing: number; uploads: number; shared: number; billed: number; billedDays: number;
	stored: number; gbMonths: number; watched: number;
}

export async function savedMonths(db: D1Database): Promise<SavedMonth[]> {
	const { results } = await db.prepare(`SELECT month, team_id AS teamId, storage, viewing, uploads, shared, billed, billed_days AS billedDays,
		stored, gb_months AS gbMonths, watched FROM cost_months`).all<SavedMonth>();
	return results;
}

/** Saved once: a team's month already saved keeps its row. */
export async function saveMonths(db: D1Database, rows: SavedMonth[], savedAt: string): Promise<void> {
	if (!rows.length) return;
	await db.batch(rows.map((r) => db.prepare(`INSERT INTO cost_months (month, team_id, storage, viewing, uploads, shared, billed, billed_days, stored, gb_months, watched, saved_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (month, team_id) DO NOTHING`).bind(r.month, r.teamId, r.storage, r.viewing, r.uploads, r.shared, r.billed, r.billedDays, r.stored, r.gbMonths, r.watched, savedAt)));
}

/** `budget` null: back to the default. */
export const setBudget = (db: D1Database, teamId: string, budget: number | null) =>
	db.prepare("UPDATE teams SET budget = ? WHERE id = ? AND status <> 'deleted'").bind(budget, teamId);

/** The one rate Costs keeps: US dollars to the club's currency ("USD/AUD"). */
const RATE_PAIR = `USD/${CLUB.currency.code}`;

/** The exchange rate last saved: US dollars to the club's currency, its day, and when it was read. */
export const savedRate = (db: D1Database) =>
	db.prepare("SELECT rate, rate_date AS date, fetched_at AS fetchedAt FROM exchange_rates WHERE pair = ?").bind(RATE_PAIR).first<{ rate: number; date: string; fetchedAt: string }>();

export const saveRate = (db: D1Database, rate: number, date: string, fetchedAt: string) => db.prepare(`INSERT INTO exchange_rates (pair, rate, rate_date, fetched_at)
	VALUES (?, ?, ?, ?) ON CONFLICT (pair) DO UPDATE SET rate = excluded.rate, rate_date = excluded.rate_date, fetched_at = excluded.fetched_at`).bind(RATE_PAIR, rate, date, fetchedAt).run();

/** Stream's storage bought, each month Costs saw it ('YYYY-MM' to minutes): the most it saw that month. */
export async function boughtByMonth(db: D1Database): Promise<Map<string, number>> {
	const { results } = await db.prepare("SELECT month, minutes FROM stream_bought").all<{ month: string; minutes: number }>();
	return new Map(results.map((r) => [r.month, r.minutes]));
}

/** What Stream has bought now, as this month's (kept if it was more earlier in the month: bought is billed). */
export const noteBought = (db: D1Database, month: string, minutes: number, nowIso: string) => db
	.prepare(`INSERT INTO stream_bought (month, minutes, seen_at) VALUES (?, ?, ?)
		ON CONFLICT (month) DO UPDATE SET minutes = MAX(minutes, excluded.minutes), seen_at = excluded.seen_at`).bind(month, minutes, nowIso).run();
