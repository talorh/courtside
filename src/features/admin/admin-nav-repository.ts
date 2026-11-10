// What the admin area's navigation counts on every page: support requests waiting for an answer,
// and the platform's alerts that aren't ok. Across every team, so a CROSS_TEAM exception in scripts/rules.mjs.

export interface AdminNav { support: number; alerts: number; urgent: number }

export async function loadAdminNav(db: D1Database): Promise<AdminNav> {
	const row = await db.prepare(`SELECT (SELECT COUNT(*) FROM support_requests WHERE status IN ('new', 'open')) AS support,
		(SELECT COUNT(*) FROM platform_alerts WHERE level <> 'ok') AS alerts, (SELECT COUNT(*) FROM platform_alerts WHERE level = 'urgent') AS urgent`)
		.first<AdminNav>();
	return { support: row?.support ?? 0, alerts: row?.alerts ?? 0, urgent: row?.urgent ?? 0 };
}
