// The game check's read across every team at once: the live games coming up, each with its open Go live input if one
// is set up, and when the check last looked at it. Site-wide by nature, so a CROSS_TEAM exception in scripts/rules.mjs.

export interface LiveGame { id: number; teamId: string; team: string; startsAt: string; opponent: string; liveInputUid: string | null; readyCheckedAt: string | null }

/** Every running team's games from `from` to `until` (local time, 'YYYY-MM-DDTHH:MM', both included) that are to
 * be live streamed: not No video, not recorded and uploaded, not deleted. Oldest first. */
export async function liveGamesBetween(db: D1Database, from: string, until: string): Promise<LiveGame[]> {
	const { results } = await db.prepare(`SELECT g.id, g.team_id AS teamId, t.name AS team, g.starts_at AS startsAt, g.opponent,
		ls.live_input_uid AS liveInputUid, g.ready_checked_at AS readyCheckedAt
		FROM games g JOIN teams t ON t.id = g.team_id LEFT JOIN live_streams ls ON ls.game_id = g.id AND ls.team_id = g.team_id AND ls.status = 'open'
		WHERE t.status = 'active' AND g.deleted_at IS NULL AND g.no_video_at IS NULL AND g.live_stream = 1 AND g.starts_at BETWEEN ? AND ?
		ORDER BY g.starts_at`).bind(from, until).all<LiveGame>();
	return results;
}

/** The games the check looked at just now. */
export const markReadyChecked = (db: D1Database, games: Array<Pick<LiveGame, "id" | "teamId">>, nowIso: string) => games.length
	? db.batch(games.map((g) => db.prepare("UPDATE games SET ready_checked_at = ? WHERE team_id = ? AND id = ?").bind(nowIso, g.teamId, g.id)))
	: Promise.resolve([]);
