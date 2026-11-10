// A game's No video: a team manager's, a week's or a PlayHQ fixture's, or the site's after a week with nothing filmed
// (no-video-after.ts), and back to Video.
import { assertChanged } from "../../shared/d1.ts";

/** Set back from No video to Video at `nowIso`: the game waits a week from then (no-video-after.ts), and its No video
 * is no longer the site's. In an UPDATE's SET, so `no_video_at` is the row's value before it. */
export const BACK_TO_VIDEO = "waiting_since = CASE WHEN no_video_at IS NOT NULL THEN ?2 ELSE waiting_since END, no_video_auto_at = NULL, no_video_at = NULL";

/** A team manager's No video, from `atIso` (a week's switch: roster-week-settings.ts). */
export async function setNoVideo(db: D1Database, teamId: string, id: number, atIso: string): Promise<void> {
	const result = await db
		.prepare("UPDATE games SET no_video_at = ? WHERE team_id = ? AND id = ? AND deleted_at IS NULL")
		.bind(atIso, teamId, id)
		.run();
	assertChanged(result, "game");
}

/** No video undone for one of many games at once (a week, a PlayHQ fixture): not a game the site set to No video, after
 * a week with nothing filmed, which a team manager undoes game by game (Edit). */
export async function clearNoVideoUnlessSite(db: D1Database, teamId: string, id: number, nowIso: string): Promise<void> {
	await db.prepare(`UPDATE games SET ${BACK_TO_VIDEO} WHERE team_id = ?1 AND id = ?3 AND deleted_at IS NULL AND no_video_auto_at IS NULL`).bind(teamId, nowIso, id).run();
}

/** The site's No video for a game nothing was filmed for in its week (no-video-after.ts), noted as the site's, so
 * switching many games back to Video at once leaves it. True if this set it (not if the game changed meanwhile). */
export async function setNoVideoBySite(db: D1Database, teamId: string, id: number, atIso: string): Promise<boolean> {
	const result = await db.prepare(`UPDATE games SET no_video_at = ?, no_video_auto_at = ?
		WHERE team_id = ? AND id = ? AND deleted_at IS NULL AND no_video_at IS NULL`).bind(atIso, atIso, teamId, id).run();
	return result.meta.changes === 1;
}
