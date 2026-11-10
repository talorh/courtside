// Final scores (game_scores), and the PlayHQ games still waiting for one (scores-service.ts checkFinalScores).

export interface Score {
	gameId: number;
	ours: number;
	opponent: number;
	/** From PlayHQ once the game was over, or entered by a team manager. */
	source: "playhq" | "manual";
}

interface Row { game_id: number; ours: number; opponent: number; source: Score["source"] }
const toScore = (r: Row): Score => ({ gameId: r.game_id, ours: r.ours, opponent: r.opponent, source: r.source });

/** Every final score, by game. */
export async function listScores(db: D1Database, teamId: string): Promise<Map<number, Score>> {
	const { results } = await db.prepare("SELECT game_id, ours, opponent, source FROM game_scores WHERE team_id = ?").bind(teamId).all<Row>();
	return new Map(results.map((r) => [r.game_id, toScore(r)]));
}

export async function getScore(db: D1Database, teamId: string, gameId: number): Promise<Score | null> {
	const row = await db.prepare("SELECT game_id, ours, opponent, source FROM game_scores WHERE team_id = ? AND game_id = ?").bind(teamId, gameId).first<Row>();
	return row ? toScore(row) : null;
}

/** A team manager's score: entered, or replacing the one there (PlayHQ's included). */
export function enterScoreWrite(db: D1Database, teamId: string, s: { gameId: number; ours: number; opponent: number; enteredBy: number; nowIso: string }) {
	return db.prepare(`INSERT INTO game_scores (team_id, game_id, ours, opponent, source, entered_by, entered_at) VALUES (?, ?, ?, ?, 'manual', ?, ?)
		ON CONFLICT (team_id, game_id) DO UPDATE SET ours = excluded.ours, opponent = excluded.opponent, source = 'manual',
		entered_by = excluded.entered_by, entered_at = excluded.entered_at`).bind(teamId, s.gameId, s.ours, s.opponent, s.enteredBy, s.nowIso);
}

/** PlayHQ's final score: never over one already there (a team manager may have entered it meanwhile). */
export function playhqScoreWrite(db: D1Database, teamId: string, s: { gameId: number; ours: number; opponent: number; nowIso: string }) {
	return db.prepare(`INSERT INTO game_scores (team_id, game_id, ours, opponent, source, entered_at) VALUES (?, ?, ?, ?, 'playhq', ?)
		ON CONFLICT (team_id, game_id) DO NOTHING`).bind(teamId, s.gameId, s.ours, s.opponent, s.nowIso);
}

export async function clearScore(db: D1Database, teamId: string, gameId: number): Promise<void> {
	await db.prepare("DELETE FROM game_scores WHERE team_id = ? AND game_id = ?").bind(teamId, gameId).run();
}

export interface ScoreDue { gameId: number; playhqGameId: string; playhqTeamId: string; url: string }

/**
 * PlayHQ games with no final score, tipped off between `since` and `overBefore` (local wall times), not asked since
 * `keenChecked` if tip-off was after `keenAfter`, else since `olderChecked`; the longest waiting first.
 */
export async function scoresDue(db: D1Database, teamId: string, w: { overBefore: string; since: string; keenAfter: string; keenChecked: string; olderChecked: string; limit: number }): Promise<ScoreDue[]> {
	const { results } = await db.prepare(`SELECT g.id AS gameId, g.playhq_game_id AS playhqGameId, f.playhq_team_id AS playhqTeamId, f.url
		FROM games g JOIN playhq_fixtures f ON f.team_id = g.team_id AND f.id = g.playhq_fixture_id
		WHERE g.team_id = ? AND g.deleted_at IS NULL AND g.playhq_game_id IS NOT NULL AND g.starts_at <= ? AND g.starts_at >= ?
		AND NOT EXISTS (SELECT 1 FROM game_scores s WHERE s.team_id = g.team_id AND s.game_id = g.id)
		AND (g.score_checked_at IS NULL OR g.score_checked_at < CASE WHEN g.starts_at > ? THEN ? ELSE ? END)
		ORDER BY g.score_checked_at IS NOT NULL, g.score_checked_at, g.starts_at LIMIT ?`)
		.bind(teamId, w.overBefore, w.since, w.keenAfter, w.keenChecked, w.olderChecked, w.limit).all<ScoreDue>();
	return results;
}

export function scoreCheckedWrite(db: D1Database, teamId: string, gameId: number, nowIso: string) {
	return db.prepare("UPDATE games SET score_checked_at = ? WHERE team_id = ? AND id = ?").bind(nowIso, teamId, gameId);
}
