// The support desk's figures, above each queue: how many need an answer and how many of those are nobody's, how long
// the oldest has waited, how many wait on team managers, how many were closed in the last week, and how long a team
// manager typically waits for an admin's first reply (the median, over tickets asked in the last 30 days). Site-wide
// by nature, so a CROSS_TEAM exception in scripts/rules.mjs.
import type { TicketKind } from "../support/support-repository.ts";

export interface DeskFigures { attention: number; unowned: number; oldestWaiting: string | null; waiting: number; closedWeek: number; firstReplyMinutes: number | null; replied: number }

const DAY_MS = 86_400_000;

export async function deskFigures(db: D1Database, kind: TicketKind, now: Date): Promise<DeskFigures> {
	const week = new Date(now.getTime() - 7 * DAY_MS).toISOString(), month = new Date(now.getTime() - 30 * DAY_MS).toISOString();
	const [counts, replies] = await db.batch([
		db.prepare(`SELECT SUM(status IN ('new', 'open')) AS attention, SUM(status IN ('new', 'open') AND assigned_to IS NULL) AS unowned,
			MIN(CASE WHEN status IN ('new', 'open') THEN updated_at END) AS oldest, SUM(status = 'waiting') AS waiting,
			SUM(status = 'resolved' AND resolved_at >= ?2) AS closed FROM support_requests WHERE kind = ?1`).bind(kind, week),
		db.prepare(`SELECT s.created_at AS asked, MIN(x.created_at) AS answered FROM support_requests s
			JOIN support_messages x ON x.request_id = s.id AND x.kind = 'reply' AND x.admin_email IS NOT NULL
			WHERE s.kind = ?1 AND s.source = 'team' AND s.created_at >= ?2 GROUP BY s.id`).bind(kind, month),
	]);
	const c = (counts?.results[0] ?? {}) as Record<string, number | string | null>;
	const waits = ((replies?.results ?? []) as Array<{ asked: string; answered: string }>).map((r) => (Date.parse(r.answered) - Date.parse(r.asked)) / 60_000).sort((a, b) => a - b);
	const mid = waits.length ? (waits.length % 2 ? waits[(waits.length - 1) / 2]! : (waits[waits.length / 2 - 1]! + waits[waits.length / 2]!) / 2) : null;
	return {
		attention: Number(c.attention ?? 0), unowned: Number(c.unowned ?? 0), oldestWaiting: (c.oldest as string | null) ?? null,
		waiting: Number(c.waiting ?? 0), closedWeek: Number(c.closed ?? 0), firstReplyMinutes: mid, replied: waits.length,
	};
}

/** The teams that have asked anything, for the queue's Team filter. */
export async function ticketTeams(db: D1Database): Promise<Array<{ id: string; code: string; seasonStart: number }>> {
	const { results } = await db.prepare(`SELECT DISTINCT t.id, t.code, t.season_start AS seasonStart FROM support_requests s JOIN teams t ON t.id = s.team_id
		ORDER BY t.season_start DESC, t.code`).all<{ id: string; code: string; seasonStart: number }>();
	return results;
}
