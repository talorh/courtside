import { assertChanged } from "../../shared/d1.ts";
import { GAME_COLUMNS, type Game, type GameRow, toGame } from "../games/games-repository.ts";

export type RemovalStatus = "open" | "video_deleted" | "kept";

export interface OpenRemovalRequest {
	id: number;
	videoId: number;
	isVideoDeleted: boolean;
	game: Game;
	requesterEmail: string;
	reason: string;
	createdAt: string;
}

type Row = GameRow & { request_id: number; video_id: number; video_deleted_at: string | null; email: string; reason: string; requested_at: string };

/** false when this member already has an open request for the video (asking twice adds nothing). */
export async function createRemovalRequest(
	db: D1Database, r: { teamId: string; videoId: number; memberId: number; reason: string; nowIso: string },
): Promise<boolean> {
	const result = await db
		.prepare(`INSERT INTO removal_requests (team_id, video_id, member_id, reason, created_at) SELECT ?, ?, ?, ?, ?
			WHERE NOT EXISTS (SELECT 1 FROM removal_requests WHERE team_id = ? AND video_id = ? AND member_id = ? AND status = 'open')`)
		.bind(r.teamId, r.videoId, r.memberId, r.reason, r.nowIso, r.teamId, r.videoId, r.memberId)
		.run();
	return result.meta.changes === 1;
}

export async function listOpenRequests(db: D1Database, teamId: string): Promise<OpenRemovalRequest[]> {
	const { results } = await db
		.prepare(`SELECT r.id AS request_id, r.video_id, r.reason, r.created_at AS requested_at, m.email, v.deleted_at AS video_deleted_at, ${GAME_COLUMNS}
			FROM removal_requests r JOIN members m ON m.id = r.member_id JOIN videos v ON v.id = r.video_id JOIN games g ON g.id = v.game_id
			WHERE r.team_id = ? AND r.status = 'open' ORDER BY r.created_at`)
		.bind(teamId)
		.all<Row>();
	return results.map((r) => ({
		id: r.request_id, videoId: r.video_id, isVideoDeleted: r.video_deleted_at !== null, game: toGame(r),
		requesterEmail: r.email, reason: r.reason, createdAt: r.requested_at,
	}));
}

export async function getOpenRequestVideoId(db: D1Database, teamId: string, id: number): Promise<number | null> {
	return db.prepare("SELECT video_id FROM removal_requests WHERE team_id = ? AND id = ? AND status = 'open'").bind(teamId, id).first<number>("video_id");
}

interface Resolution { status: Exclude<RemovalStatus, "open">; note: string; resolvedBy: number; nowIso: string }

export async function resolveRequest(db: D1Database, teamId: string, id: number, r: Resolution): Promise<void> {
	const result = await db
		.prepare("UPDATE removal_requests SET status = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE team_id = ? AND id = ? AND status = 'open'")
		.bind(r.status, r.note, r.resolvedBy, r.nowIso, teamId, id)
		.run();
	assertChanged(result, "removal request");
}

/** Closes every open request for a video (several members may have asked). */
export async function resolveRequestsForVideo(db: D1Database, teamId: string, videoId: number, r: Resolution): Promise<void> {
	await db
		.prepare("UPDATE removal_requests SET status = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE team_id = ? AND video_id = ? AND status = 'open'")
		.bind(r.status, r.note, r.resolvedBy, r.nowIso, teamId, videoId)
		.run();
}
