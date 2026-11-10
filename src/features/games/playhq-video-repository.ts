import { BACK_TO_VIDEO } from "./no-video-repository.ts";

/** A fixture's No video switch (this tournament no filming, next year's allowed): its games now, and the ones it adds
 * later. Switching it on leaves alone a game that already has a video. */
export const setPlayhqFixtureVideo = async (db: D1Database, teamId: string, id: number, noVideo: boolean, nowIso: string) => void await db.batch([
	db.prepare("UPDATE playhq_fixtures SET no_video = ? WHERE team_id = ? AND id = ?").bind(noVideo ? 1 : 0, teamId, id),
	noVideo
		? db.prepare(`UPDATE games SET no_video_at = ? WHERE team_id = ? AND playhq_fixture_id = ? AND deleted_at IS NULL AND no_video_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.team_id = games.team_id AND v.game_id = games.id AND v.deleted_at IS NULL AND v.status <> 'failed')`).bind(nowIso, teamId, id)
		// Not a game the site set to No video, nothing filmed in its week: that's a team manager's to undo, game by game (Edit).
		: db.prepare(`UPDATE games SET ${BACK_TO_VIDEO} WHERE team_id = ?1 AND playhq_fixture_id = ?3 AND deleted_at IS NULL AND no_video_auto_at IS NULL`).bind(teamId, nowIso, id),
]);

/** The fixture's games with a live stream open (Go live opened, or streaming), for No video to close or refuse. */
export async function fixtureGamesWithOpenLive(db: D1Database, teamId: string, id: number): Promise<number[]> {
	const { results } = await db.prepare(`SELECT l.game_id FROM live_streams l JOIN games g ON g.team_id = l.team_id AND g.id = l.game_id
		WHERE l.team_id = ? AND l.status = 'open' AND g.playhq_fixture_id = ? AND g.deleted_at IS NULL`).bind(teamId, id).all<{ game_id: number }>();
	return results.map((r) => r.game_id);
}
