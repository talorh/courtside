// The support desk's emails: which tickets and messages still have one to send, and claiming one before it's sent, so
// the page and the 5-minute job never both send it. Site-wide by nature, so a CROSS_TEAM exception in scripts/rules.mjs.

const TABLE = { ticket: "support_requests", message: "support_messages" } as const;

/** Marks its email sent as at `nowIso` if nothing has yet: true when this call did, and so sends it. A Worker cut off
 * between this and the send leaves it marked; a send that fails gives it back (`releaseEmail`). */
export async function claimEmail(db: D1Database, what: keyof typeof TABLE, id: number, nowIso: string): Promise<boolean> {
	return (await db.prepare(`UPDATE ${TABLE[what]} SET emailed_at = ? WHERE id = ? AND emailed_at IS NULL`).bind(nowIso, id).run()).meta.changes === 1;
}

/** Unmarks an email whose send failed, for the 5-minute job to try again; only this claim's own mark. */
export const releaseEmail = (db: D1Database, what: keyof typeof TABLE, id: number, nowIso: string) =>
	db.prepare(`UPDATE ${TABLE[what]} SET emailed_at = NULL WHERE id = ? AND emailed_at = ?`).bind(id, nowIso).run();

// A ticket's first email is news only until it's resolved: one resolved before it could go (an alert that cleared while
// emails weren't going) is never sent.
const FIRST_UNSENT = "emailed_at IS NULL AND status <> 'resolved'";

/** Tickets whose first email hasn't gone, and messages whose email hasn't, oldest first. */
export async function listUnsent(db: D1Database, limit: number): Promise<{ tickets: number[]; messages: number[] }> {
	const [tickets, messages] = await db.batch<{ id: number }>([
		db.prepare(`SELECT id FROM support_requests WHERE ${FIRST_UNSENT} ORDER BY id LIMIT ?`).bind(limit),
		db.prepare("SELECT id FROM support_messages WHERE email_to IS NOT NULL AND emailed_at IS NULL ORDER BY id LIMIT ?").bind(limit),
	]);
	return { tickets: (tickets?.results ?? []).map((r) => r.id), messages: (messages?.results ?? []).map((r) => r.id) };
}

/** Emails still waiting since before `beforeIso` (the "emails not going" alert). */
export async function countUnsentBefore(db: D1Database, beforeIso: string): Promise<number> {
	return (await db.prepare(`SELECT (SELECT COUNT(*) FROM support_requests WHERE ${FIRST_UNSENT} AND created_at < ?1)
		+ (SELECT COUNT(*) FROM support_messages WHERE email_to IS NOT NULL AND emailed_at IS NULL AND created_at < ?1) AS n`).bind(beforeIso).first<number>("n")) ?? 0;
}
