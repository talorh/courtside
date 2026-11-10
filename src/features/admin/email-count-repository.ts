// The month's emails: every email the site sends is counted by the UTC month it went in (Cloudflare's
// billing month), against the 3,000 a month Workers Paid includes. Site-wide by nature, so a CROSS_TEAM exception in
// scripts/rules.mjs.

/** What Workers Paid includes a month (Email Sending). */
export const EMAILS_A_MONTH = 3000;

/** "2026-11": the UTC month, as Cloudflare counts it. */
export const monthKey = (now: Date) => now.toISOString().slice(0, 7);

export async function countEmailSent(db: D1Database, month: string): Promise<void> {
	await db.prepare("INSERT INTO email_months (month, sent) VALUES (?, 1) ON CONFLICT (month) DO UPDATE SET sent = sent + 1").bind(month).run();
}

export async function emailsSentIn(db: D1Database, month: string): Promise<number> {
	return (await db.prepare("SELECT sent FROM email_months WHERE month = ?").bind(month).first<number>("sent")) ?? 0;
}
