import type { Game } from "../games/games-repository.ts";

export type LiveBarGame = Pick<Game, "id" | "competition" | "roundLabel" | "opponent">;

/** The team's games being streamed: an open stream, not ended, that the 5-minute job saw sending since `seenSince`. */
export async function gamesStreamingNow(db: D1Database, teamId: string, seenSince: string): Promise<LiveBarGame[]> {
	const { results } = await db.prepare(`SELECT g.id, g.competition, g.round_label AS roundLabel, g.opponent
		FROM live_streams ls JOIN games g ON g.team_id = ls.team_id AND g.id = ls.game_id
		WHERE ls.team_id = ? AND ls.status = 'open' AND ls.end_requested_at IS NULL AND ls.last_live_at > ? AND g.deleted_at IS NULL
		ORDER BY g.starts_at`).bind(teamId, seenSince).all<LiveBarGame>();
	return results;
}
