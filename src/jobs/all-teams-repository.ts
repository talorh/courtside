// The jobs' reads across every team at once: one trip for the whole site in place of one per
// team, so a run's trips to the database stay inside D1's 1,000 however many teams there are. Site-wide by nature, so a
// CROSS_TEAM exception in scripts/rules.mjs. Every other query names its team.
import type { Game } from "../features/games/games-repository.ts";

/** Teams with something on the go, which the 5-minute job must see every run: a game today (local, `today` as
 * YYYY-MM-DD), a live stream open, a video uploading or being processed, a clip being processed, or an HD copy still
 * awaited. One trip. */
export async function busyTeamIds(db: D1Database, today: string): Promise<Set<string>> {
	const { results } = await db.prepare(`SELECT team_id FROM live_streams WHERE status = 'open'
		UNION SELECT team_id FROM videos WHERE deleted_at IS NULL AND (status IN ('uploading', 'processing') OR (status = 'ready' AND stream_uid IS NOT NULL AND hd_ready_at IS NULL AND hd_failed_at IS NULL))
		UNION SELECT team_id FROM clips WHERE deleted_at IS NULL AND status = 'processing'
		UNION SELECT team_id FROM games WHERE deleted_at IS NULL AND substr(starts_at, 1, 10) = ?`).bind(today).all<{ team_id: string }>();
	return new Set(results.map((r) => r.team_id));
}

export interface EveryTeamsRecords {
	/** Stream uids the site still needs: videos on the site or in their keep window after a deletion, and clips. */
	inUse: Set<string>;
	/** Live inputs of streams still open. */
	openInputs: Set<string>;
	/** Every Stream uid and live input the site has ever recorded, deleted ones too. */
	knownVideos: Set<string>;
	knownInputs: Set<string>;
	/** Images ids of photos on the site, and of every photo ever recorded. */
	photosInUse: Set<string>;
	knownPhotos: Set<string>;
}

/** What every team's records know of, for the nightly clean-up (jobs/sweep-orphans.ts): Stream and Images hold every
 * team's things, so anything any team still needs is kept. One batch (one trip); a database that can't be read throws,
 * and the sweep deletes nothing. */
export async function everyTeamsRecords(db: D1Database, nowIso: string): Promise<EveryTeamsRecords> {
	const uids = (rows: D1Result<{ uid: string }> | undefined) => new Set((rows?.results ?? []).map((r) => r.uid));
	const [inUse, open, videos, inputs, photos] = await db.batch([
		db.prepare(`SELECT stream_uid AS uid FROM videos WHERE stream_uid IS NOT NULL AND (deleted_at IS NULL OR purge_after > ?)
			UNION SELECT stream_uid FROM clips WHERE stream_uid IS NOT NULL AND deleted_at IS NULL`).bind(nowIso),
		db.prepare("SELECT live_input_uid AS uid FROM live_streams WHERE status = 'open'"),
		db.prepare("SELECT stream_uid AS uid FROM videos WHERE stream_uid IS NOT NULL UNION SELECT stream_uid FROM clips WHERE stream_uid IS NOT NULL"),
		db.prepare("SELECT live_input_uid AS uid FROM live_streams"),
		db.prepare("SELECT image_id, deleted_at FROM photos"),
	]);
	const all = (photos?.results ?? []) as Array<{ image_id: string; deleted_at: string | null }>;
	return {
		inUse: uids(inUse as D1Result<{ uid: string }>), openInputs: uids(open as D1Result<{ uid: string }>),
		knownVideos: uids(videos as D1Result<{ uid: string }>), knownInputs: uids(inputs as D1Result<{ uid: string }>),
		photosInUse: new Set(all.filter((r) => r.deleted_at === null).map((r) => r.image_id)), knownPhotos: new Set(all.map((r) => r.image_id)),
	};
}

/** A game with nothing filmed (features/games/no-video-after.ts), with its team. */
export interface UnfilmedGame { teamId: string; id: number; startsAt: string; competition: Game["competition"]; roundLabel: string; opponent: string }

/**
 * Every active team's games that started before `before` (local, 'YYYY-MM-DDTHH:MM') with nothing filmed, in one
 * trip: not No video, not set back to Video by a team manager since `beforeIso`, no video of any kind (a failed one too:
 * someone's dealing with it; one a person deleted doesn't count, so a lost recording doesn't keep the game waiting), and
 * no live stream that was used (only opened is fine).
 */
export async function unfilmedGames(db: D1Database, before: string, beforeIso: string): Promise<UnfilmedGame[]> {
	const { results } = await db.prepare(`SELECT g.team_id AS teamId, g.id, g.starts_at AS startsAt, g.competition, g.round_label AS roundLabel, g.opponent
		FROM games g JOIN teams t ON t.id = g.team_id AND t.status = 'active'
		WHERE g.deleted_at IS NULL AND g.no_video_at IS NULL AND g.starts_at < ?1 AND (g.waiting_since IS NULL OR g.waiting_since < ?2)
		AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.team_id = g.team_id AND v.game_id = g.id AND v.deleted_at IS NULL)
		AND NOT EXISTS (SELECT 1 FROM live_streams ls WHERE ls.team_id = g.team_id AND ls.game_id = g.id AND ls.status = 'open'
			AND (ls.last_live_at IS NOT NULL OR ls.end_requested_at IS NOT NULL OR ls.recording_video_id IS NOT NULL))
		ORDER BY g.starts_at`).bind(before, beforeIso).all<UnfilmedGame>();
	return results;
}
