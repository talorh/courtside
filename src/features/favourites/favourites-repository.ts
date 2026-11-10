import type { Competition } from "../games/games-repository.ts";

// A member's starred games and highlight clips. Each member's own.

export type Starred = { gameId: number } | { clipId: number };
const column = (item: Starred) => ("gameId" in item ? { name: "game_id", id: item.gameId } : { name: "clip_id", id: item.clipId });

export async function star(db: D1Database, teamId: string, memberId: number, item: Starred, nowIso: string): Promise<void> {
	const { name, id } = column(item);
	await db.prepare(`INSERT INTO favourites (team_id, member_id, ${name}, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`)
		.bind(teamId, memberId, id, nowIso).run();
}

export async function unstar(db: D1Database, teamId: string, memberId: number, item: Starred): Promise<void> {
	const { name, id } = column(item);
	await db.prepare(`DELETE FROM favourites WHERE team_id = ? AND member_id = ? AND ${name} = ?`).bind(teamId, memberId, id).run();
}

/** What this member has starred: game ids and clip ids (a handful, so all of them). */
export async function starredBy(db: D1Database, teamId: string, memberId: number): Promise<{ games: Set<number>; clips: Set<number> }> {
	const { results } = await db.prepare("SELECT game_id, clip_id FROM favourites WHERE team_id = ? AND member_id = ?")
		.bind(teamId, memberId).all<{ game_id: number | null; clip_id: number | null }>();
	return {
		games: new Set(results.flatMap((r) => (r.game_id === null ? [] : [r.game_id]))),
		clips: new Set(results.flatMap((r) => (r.clip_id === null ? [] : [r.clip_id]))),
	};
}

export interface StarredClip {
	clipId: number;
	label: string;
	streamUid: string;
	startSeconds: number;
	endSeconds: number;
	game: { id: number; competition: Competition; roundLabel: string; opponent: string };
}

/** This member's starred clips that can still be watched (clip, video and game not deleted), newest star first. */
export async function listStarredClips(db: D1Database, teamId: string, memberId: number): Promise<StarredClip[]> {
	const { results } = await db.prepare(`SELECT c.id, c.label, c.stream_uid, c.start_seconds, c.end_seconds,
			g.id AS game_id, g.competition, g.round_label, g.opponent
		FROM favourites f
		JOIN clips c ON c.team_id = f.team_id AND c.id = f.clip_id AND c.deleted_at IS NULL AND c.status = 'ready' AND c.stream_uid IS NOT NULL
		JOIN videos v ON v.team_id = c.team_id AND v.id = c.video_id AND v.deleted_at IS NULL
		JOIN games g ON g.team_id = v.team_id AND g.id = v.game_id AND g.deleted_at IS NULL
		WHERE f.team_id = ? AND f.member_id = ? ORDER BY f.created_at DESC, f.id DESC`).bind(teamId, memberId)
		.all<{ id: number; label: string; stream_uid: string; start_seconds: number; end_seconds: number; game_id: number; competition: Competition; round_label: string; opponent: string }>();
	return results.map((r) => ({
		clipId: r.id, label: r.label, streamUid: r.stream_uid, startSeconds: r.start_seconds, endSeconds: r.end_seconds,
		game: { id: r.game_id, competition: r.competition, roundLabel: r.round_label, opponent: r.opponent },
	}));
}
