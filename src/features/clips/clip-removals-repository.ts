import { assertChanged } from "../../shared/d1.ts";
import { GAME_COLUMNS, type Game, type GameRow, toGame } from "../games/games-repository.ts";

export interface OpenClipRemovalRequest {
	id: number;
	clipId: number;
	clipLabel: string;
	game: Game;
	requesterEmail: string;
	reason: string;
	createdAt: string;
}

type Row = GameRow & { request_id: number; clip_id: number; label: string; email: string; reason: string; requested_at: string };

/** false when this member already has an open request for the clip (asking twice adds nothing). */
export async function createClipRemovalRequest(
	db: D1Database, r: { teamId: string; clipId: number; memberId: number; reason: string; nowIso: string },
): Promise<boolean> {
	const result = await db
		.prepare(`INSERT INTO clip_removal_requests (team_id, clip_id, member_id, reason, created_at) SELECT ?, ?, ?, ?, ?
			WHERE NOT EXISTS (SELECT 1 FROM clip_removal_requests WHERE team_id = ? AND clip_id = ? AND member_id = ? AND status = 'open')`)
		.bind(r.teamId, r.clipId, r.memberId, r.reason, r.nowIso, r.teamId, r.clipId, r.memberId)
		.run();
	return result.meta.changes === 1;
}

/** Open requests for clips that still exist (deleting a clip closes its requests; a deleted video takes its clips off the site). */
export async function listOpenClipRequests(db: D1Database, teamId: string): Promise<OpenClipRemovalRequest[]> {
	const { results } = await db
		.prepare(`SELECT r.id AS request_id, r.clip_id, c.label, r.reason, r.created_at AS requested_at, m.email, ${GAME_COLUMNS}
			FROM clip_removal_requests r JOIN members m ON m.id = r.member_id JOIN clips c ON c.id = r.clip_id
			JOIN videos v ON v.id = c.video_id JOIN games g ON g.id = v.game_id
			WHERE r.team_id = ? AND r.status = 'open' AND c.deleted_at IS NULL AND v.deleted_at IS NULL ORDER BY r.created_at`)
		.bind(teamId)
		.all<Row>();
	return results.map((r) => ({
		id: r.request_id, clipId: r.clip_id, clipLabel: r.label, game: toGame(r), requesterEmail: r.email, reason: r.reason, createdAt: r.requested_at,
	}));
}

export async function getOpenClipRequestClipId(db: D1Database, teamId: string, id: number): Promise<number | null> {
	return db.prepare("SELECT clip_id FROM clip_removal_requests WHERE team_id = ? AND id = ? AND status = 'open'").bind(teamId, id).first<number>("clip_id");
}

interface Resolution { status: "clip_deleted" | "kept"; note: string; resolvedBy: number | null; nowIso: string }

export async function resolveClipRequest(db: D1Database, teamId: string, id: number, r: Resolution): Promise<void> {
	const result = await db
		.prepare("UPDATE clip_removal_requests SET status = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE team_id = ? AND id = ? AND status = 'open'")
		.bind(r.status, r.note, r.resolvedBy, r.nowIso, teamId, id)
		.run();
	assertChanged(result, "clip removal request");
}

/** Closes every open request for a clip, when a team manager deletes it or it goes with its game video: batched with the
 * delete. */
export const resolveRequestsForClipWrite = (db: D1Database, teamId: string, clipId: number, r: Resolution) => db
	.prepare("UPDATE clip_removal_requests SET status = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE team_id = ? AND clip_id = ? AND status = 'open'")
	.bind(r.status, r.note, r.resolvedBy, r.nowIso, teamId, clipId);
