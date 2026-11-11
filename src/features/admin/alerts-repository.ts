// The platform's alerts: one row per kind, where it stands, and its ticket on the support desk
// (alerts raise tickets, not emails of their own). Site-wide by nature (platform_alerts has no team), so a
// CROSS_TEAM exception in scripts/rules.mjs.

export type AlertKind = "stream_storage" | "images" | "daily_job" | "sync_job" | "database" | "site_errors" | "email" | "email_allowance" | "budget" | "ai_models" | "joiner" | "game_day";
export type AlertLevel = "ok" | "warn" | "urgent";

/** `since`: when this spell began (null while ok). `failures`: a job's failed runs in a row. `ticketId`: its latest
 * ticket, open or resolved. */
export interface PlatformAlert { kind: AlertKind; level: AlertLevel; detail: string; since: string | null; failures: number; checkedAt: string; ticketId: number | null }

const COLUMNS = "kind, level, detail, since, failures, checked_at AS checkedAt, ticket_id AS ticketId";

export async function listAlerts(db: D1Database): Promise<PlatformAlert[]> {
	const { results } = await db.prepare(`SELECT ${COLUMNS} FROM platform_alerts`).all<PlatformAlert>();
	return results;
}

export async function getAlert(db: D1Database, kind: AlertKind): Promise<PlatformAlert | null> {
	return db.prepare(`SELECT ${COLUMNS} FROM platform_alerts WHERE kind = ?`).bind(kind).first<PlatformAlert>();
}

/** Where `kind` stands now; its ticket stays as it was. */
export async function saveAlert(db: D1Database, a: Omit<PlatformAlert, "ticketId">): Promise<void> {
	await db.prepare(`INSERT INTO platform_alerts (kind, level, detail, since, failures, checked_at) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (kind) DO UPDATE SET level = excluded.level, detail = excluded.detail, since = excluded.since, failures = excluded.failures, checked_at = excluded.checked_at`)
		.bind(a.kind, a.level, a.detail, a.since, a.failures, a.checkedAt).run();
}

export const setAlertTicket = (db: D1Database, kind: AlertKind, ticketId: number) => db.prepare("UPDATE platform_alerts SET ticket_id = ? WHERE kind = ?").bind(ticketId, kind).run();
