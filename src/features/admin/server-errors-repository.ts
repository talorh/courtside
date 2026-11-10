// The site's own count of the server errors it answers (basic monitoring, a ticket when "something
// broke"), an hour at a time (UTC, 'YYYY-MM-DDTHH'). Site-wide by nature, so a CROSS_TEAM exception in scripts/rules.mjs.

const hourOf = (at: Date) => at.toISOString().slice(0, 13);

export async function countServerError(db: D1Database, at: Date): Promise<void> {
	await db.prepare("INSERT INTO server_errors (hour, n) VALUES (?, 1) ON CONFLICT (hour) DO UPDATE SET n = n + 1").bind(hourOf(at)).run();
}

/** This hour's and the last's: "the last hour or two". */
export async function serverErrorsLately(db: D1Database, now: Date): Promise<number> {
	return (await db.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM server_errors WHERE hour >= ?").bind(hourOf(new Date(now.getTime() - 3_600_000))).first<number>("n")) ?? 0;
}

/** The 3am job keeps two days. */
export async function forgetServerErrors(db: D1Database, before: Date): Promise<void> {
	await db.prepare("DELETE FROM server_errors WHERE hour < ?").bind(hourOf(before)).run();
}
