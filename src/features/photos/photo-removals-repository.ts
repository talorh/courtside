import { assertChanged } from "../../shared/d1.ts";

export interface OpenPhotoRemovalRequest {
	id: number;
	photoId: number;
	/** The photo's image, for its thumbnail, and when it was taken. */
	imageId: string;
	takenAt: string;
	requesterEmail: string;
	reason: string;
	createdAt: string;
}

type Row = { request_id: number; photo_id: number; image_id: string; taken_at: string; email: string; reason: string; requested_at: string };

/** false when this member already has an open request for the photo (asking twice adds nothing). */
export async function createPhotoRemovalRequest(
	db: D1Database, r: { teamId: string; photoId: number; memberId: number; reason: string; nowIso: string },
): Promise<boolean> {
	const result = await db
		.prepare(`INSERT INTO photo_removal_requests (team_id, photo_id, member_id, reason, created_at) SELECT ?, ?, ?, ?, ?
			WHERE NOT EXISTS (SELECT 1 FROM photo_removal_requests WHERE team_id = ? AND photo_id = ? AND member_id = ? AND status = 'open')`)
		.bind(r.teamId, r.photoId, r.memberId, r.reason, r.nowIso, r.teamId, r.photoId, r.memberId)
		.run();
	return result.meta.changes === 1;
}

/** Open requests for photos still on the site (deleting a photo closes its requests), oldest first. */
export async function listOpenPhotoRequests(db: D1Database, teamId: string): Promise<OpenPhotoRemovalRequest[]> {
	const { results } = await db
		.prepare(`SELECT r.id AS request_id, r.photo_id, p.image_id, p.taken_at, r.reason, r.created_at AS requested_at, m.email
			FROM photo_removal_requests r JOIN members m ON m.id = r.member_id JOIN photos p ON p.id = r.photo_id
			WHERE r.team_id = ? AND r.status = 'open' AND p.deleted_at IS NULL ORDER BY r.created_at`)
		.bind(teamId)
		.all<Row>();
	return results.map((r) => ({
		id: r.request_id, photoId: r.photo_id, imageId: r.image_id, takenAt: r.taken_at, requesterEmail: r.email, reason: r.reason, createdAt: r.requested_at,
	}));
}

export async function getOpenPhotoRequestPhotoId(db: D1Database, teamId: string, id: number): Promise<number | null> {
	return db.prepare("SELECT photo_id FROM photo_removal_requests WHERE team_id = ? AND id = ? AND status = 'open'").bind(teamId, id).first<number>("photo_id");
}

interface Resolution { status: "photo_deleted" | "kept"; note: string; resolvedBy: number | null; nowIso: string }

export async function resolvePhotoRequest(db: D1Database, teamId: string, id: number, r: Resolution): Promise<void> {
	const result = await db
		.prepare("UPDATE photo_removal_requests SET status = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE team_id = ? AND id = ? AND status = 'open'")
		.bind(r.status, r.note, r.resolvedBy, r.nowIso, teamId, id)
		.run();
	assertChanged(result, "photo removal request");
}

/** Closes every open request for a photo, when a team manager deletes it or its season is over: batched with the delete. */
export const resolveRequestsForPhotoWrite = (db: D1Database, teamId: string, photoId: number, r: Resolution) => db
	.prepare("UPDATE photo_removal_requests SET status = ?, note = ?, resolved_by = ?, resolved_at = ? WHERE team_id = ? AND photo_id = ? AND status = 'open'")
	.bind(r.status, r.note, r.resolvedBy, r.nowIso, teamId, photoId);
