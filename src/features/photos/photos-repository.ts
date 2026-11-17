/** 'admin': deleted from its page, by a team manager or whoever added it. */
export type PhotoDeleteReason = "admin" | "removal_request" | "retention";

export interface Photo {
	id: number;
	/** Its private image in Cloudflare Images. */
	imageId: string;
	/** local wall time 'YYYY-MM-DDTHH:MM:SS': when the phone says it was taken, or else when it was added. */
	takenAt: string;
	width: number;
	height: number;
	/** The stored JPEG's size. */
	bytes: number;
	uploadedBy: number;
	createdAt: string;
}

export interface PhotoRow {
	id: number; image_id: string; taken_at: string; width: number; height: number; bytes: number; uploaded_by: number; created_at: string;
}

export const COLUMNS = "id, image_id, taken_at, width, height, bytes, uploaded_by, created_at";
/** A team's photos on show: not deleted, and not still waiting for Images. */
export const ACTIVE = "team_id = ? AND deleted_at IS NULL";

export const toPhoto = (r: PhotoRow): Photo => ({
	id: r.id, imageId: r.image_id, takenAt: r.taken_at, width: r.width, height: r.height, bytes: r.bytes, uploadedBy: r.uploaded_by, createdAt: r.created_at,
});

async function many(db: D1Database, where: string, ...params: unknown[]): Promise<Photo[]> {
	const { results } = await db.prepare(`SELECT ${COLUMNS} FROM photos WHERE ${where}`).bind(...params).all<PhotoRow>();
	return results.map(toPhoto);
}

/** Marks a row whose image isn't in Images yet: unique, and no Images id looks like it. */
const PENDING = "pending-";
/** Matches a row still marked so (a LIKE's bound value). */
const STILL_PENDING = `${PENDING}%`;

/** Photos a member, and the team, can add since `since` (deleted ones and ones on their way count). */
export interface PhotoLimits { member: number; team: number; since: string }

/**
 * A new photo's row before Images has its image, so the photo has its number (and so its name) first. It's kept out of
 * sight meanwhile, as a deleted row is; should the Worker stop before it's filled in, the nightly clean-up takes it.
 * `uploadKey`: the phone's key for the photo, when it sent one. Null when a row has that key already (the photo sent
 * again), so nothing is added, or when the photo would pass `limits`: checked in the same statement, so photos sent
 * together can't all pass a count read before any of them is saved.
 */
export async function reservePhoto(
	db: D1Database,
	p: { teamId: string; takenAt: string; width: number; height: number; bytes: number; uploadedBy: number; deleteAfter: string; createdAt: string; uploadKey?: string | null },
	limits: PhotoLimits,
): Promise<number | null> {
	const result = await db
		.prepare(`INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at, deleted_at, upload_key)
			SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10
			WHERE (SELECT COUNT(*) FROM photos WHERE team_id = ?1 AND uploaded_by = ?7 AND created_at > ?11) < ?12
				AND (SELECT COUNT(*) FROM photos WHERE team_id = ?1 AND created_at > ?11) < ?13
			ON CONFLICT (team_id, upload_key) WHERE upload_key IS NOT NULL DO NOTHING`)
		.bind(p.teamId, `${PENDING}${crypto.randomUUID()}`, p.takenAt, p.width, p.height, p.bytes, p.uploadedBy, p.deleteAfter, p.createdAt, p.uploadKey ?? null,
			limits.since, limits.member, limits.team)
		.run();
	return result.meta.changes === 1 ? result.meta.last_row_id : null;
}

/** When each photo added since `since` was added (only `uploadedBy`'s, when given), oldest first. */
export async function photosAddedSince(db: D1Database, teamId: string, since: string, uploadedBy: number | null): Promise<string[]> {
	const { results } = await db.prepare(`SELECT created_at FROM photos WHERE team_id = ? AND created_at > ?${uploadedBy === null ? "" : " AND uploaded_by = ?"}
		ORDER BY created_at`).bind(teamId, since, ...(uploadedBy === null ? [] : [uploadedBy])).all<{ created_at: string }>();
	return results.map((r) => r.created_at);
}

/** The row with the phone's key for a photo, and whether it's still waiting for Images; null when there's none. */
export async function photoByKey(db: D1Database, teamId: string, uploadKey: string): Promise<{ id: number; waiting: boolean } | null> {
	const row = await db.prepare("SELECT id, image_id LIKE ? AS waiting FROM photos WHERE team_id = ? AND upload_key = ?")
		.bind(STILL_PENDING, teamId, uploadKey).first<{ id: number; waiting: number }>();
	return row ? { id: row.id, waiting: row.waiting === 1 } : null;
}

/** The reserved row with its image, now on the page. False when the row has gone meanwhile. */
export async function fillPhoto(db: D1Database, teamId: string, id: number, imageId: string): Promise<boolean> {
	const result = await db
		.prepare("UPDATE photos SET image_id = ?, deleted_at = NULL WHERE team_id = ? AND id = ? AND image_id LIKE ?")
		.bind(imageId, teamId, id, STILL_PENDING).run();
	return result.meta.changes === 1;
}

/** A reserved row whose image never reached Images. */
export const dropReservedPhoto = (db: D1Database, teamId: string, id: number) => db
	.prepare("DELETE FROM photos WHERE team_id = ? AND id = ? AND image_id LIKE ?").bind(teamId, id, STILL_PENDING).run();

export async function getPhoto(db: D1Database, teamId: string, id: number): Promise<Photo | null> {
	return (await many(db, `${ACTIVE} AND id = ?`, teamId, id))[0] ?? null;
}

/** Every photo on the site, in the Photos page's order: newest taken first (taken the same second, the later added first). */
export const listPhotos = (db: D1Database, teamId: string) => many(db, `${ACTIVE} ORDER BY taken_at DESC, id DESC`, teamId);

export const listExpiredPhotos = (db: D1Database, teamId: string, nowIso: string) =>
	many(db, `${ACTIVE} AND delete_after <= ? ORDER BY id`, teamId, nowIso);

/** To batch with closing its removal requests (photos-service.ts deletePhoto). */
export const softDeletePhotoWrite = (db: D1Database, teamId: string, id: number, nowIso: string, reason: PhotoDeleteReason) => db
	.prepare("UPDATE photos SET deleted_at = ?, deleted_reason = ? WHERE team_id = ? AND id = ? AND deleted_at IS NULL")
	.bind(nowIso, reason, teamId, id);

