// The Friday check's read across every team at once: the live games up to Sunday, each with its open Go live input if
// one is set up. Site-wide by nature, so a CROSS_TEAM exception in scripts/rules.mjs.

export interface LiveGame { teamId: string; team: string; startsAt: string; opponent: string; liveInputUid: string | null }

/** Every running team's games from `from` to `until` (local dates, 'YYYY-MM-DD', both included) that are to be live
 * streamed: not No video, not recorded and uploaded, not deleted. Oldest first. */
export async function liveGamesUpTo(db: D1Database, from: string, until: string): Promise<LiveGame[]> {
	const { results } = await db.prepare(`SELECT g.team_id AS teamId, t.name AS team, g.starts_at AS startsAt, g.opponent, ls.live_input_uid AS liveInputUid
		FROM games g JOIN teams t ON t.id = g.team_id LEFT JOIN live_streams ls ON ls.game_id = g.id AND ls.team_id = g.team_id AND ls.status = 'open'
		WHERE t.status = 'active' AND g.deleted_at IS NULL AND g.no_video_at IS NULL AND g.live_stream = 1 AND substr(g.starts_at, 1, 10) BETWEEN ? AND ?
		ORDER BY g.starts_at`).bind(from, until).all<LiveGame>();
	return results;
}
