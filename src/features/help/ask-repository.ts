/** Counts one more question for the member today and returns today's total. Older days are cleared as it goes. */
export async function countQuestion(db: D1Database, teamId: string, memberId: number, day: string, keepFrom: string): Promise<number> {
	const [counted] = await db.batch([
		db.prepare(`INSERT INTO ask_counts (team_id, member_id, day, n) VALUES (?, ?, ?, 1)
			ON CONFLICT (team_id, member_id, day) DO UPDATE SET n = n + 1 RETURNING n`).bind(teamId, memberId, day),
		db.prepare("DELETE FROM ask_counts WHERE team_id = ? AND day < ?").bind(teamId, keepFrom),
	]);
	return (counted!.results[0] as { n: number }).n;
}
