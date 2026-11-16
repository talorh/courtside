/**
 * Notes that a member has had a game's win pop-up. True only the first time, so two pages opened at once show it once.
 */
export async function firstSightOfWin(db: D1Database, w: { teamId: string; gameId: number; memberId: number; nowIso: string }): Promise<boolean> {
	const r = await db.prepare("INSERT INTO win_seen (team_id, game_id, member_id, seen_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING")
		.bind(w.teamId, w.gameId, w.memberId, w.nowIso).run();
	return r.meta.changes > 0;
}
