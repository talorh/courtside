// The Documentation AI assistant's count of each admin's questions a day. Site-wide by nature (admins have no team), so
// a CROSS_TEAM exception in scripts/rules.mjs.

/** Counts one more question for the admin today and returns today's total. Days before `keepFrom` are cleared as it goes. */
export async function countDocsQuestion(db: D1Database, email: string, day: string, keepFrom: string): Promise<number> {
	const [counted] = await db.batch([
		db.prepare(`INSERT INTO docs_ask_counts (email, day, n) VALUES (?, ?, 1)
			ON CONFLICT (email, day) DO UPDATE SET n = n + 1 RETURNING n`).bind(email.toLowerCase(), day),
		db.prepare("DELETE FROM docs_ask_counts WHERE day < ?").bind(keepFrom),
	]);
	return (counted!.results[0] as { n: number }).n;
}
