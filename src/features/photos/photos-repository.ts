/** 'admin': deleted from its page, by a team manager or whoever added it (the column's CHECK predates the latter). */
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

interface PhotoRow {
	id: number; image_id: string; taken_at: string; width: number; height: number; bytes: number; uploaded_by: number; created_at: string;
}

const COLUMNS = "id, image_id, taken_at, width, height, bytes, uploaded_by, created_at";
const ACTIVE = "team_id = ? AND deleted_at IS NULL";

const toPhoto = (r: PhotoRow): Photo => ({
	id: r.id, imageId: r.image_id, takenAt: r.taken_at, width: r.width, height: r.height, bytes: r.bytes, uploadedBy: r.uploaded_by, createdAt: r.created_at,
});

async function many(db: D1Database, where: string, ...params: unknown[]): Promise<Photo[]> {
	const { results } = await db.prepare(`SELECT ${COLUMNS} FROM photos WHERE ${where}`).bind(...params).all<PhotoRow>();
	return results.map(toPhoto);
}

/** Marks a row whose image isn't in Images yet: unique, and no Images id looks like it. */
const PENDING = "pending-";

/**
 * A new photo's row before Images has its image, so the photo has its number (and so its name) first. It's kept out of
 * sight meanwhile, as a deleted row is; should the Worker stop before it's filled in, the nightly clean-up takes it.
 */
export async function reservePhoto(
	db: D1Database,
	p: { teamId: string; takenAt: string; width: number; height: number; bytes: number; uploadedBy: number; deleteAfter: string; createdAt: string },
): Promise<number> {
	const result = await db
		.prepare(`INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at, deleted_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		.bind(p.teamId, `${PENDING}${crypto.randomUUID()}`, p.takenAt, p.width, p.height, p.bytes, p.uploadedBy, p.deleteAfter, p.createdAt, p.createdAt)
		.run();
	return result.meta.last_row_id;
}

/** The reserved row with its image, now on the page. False when the row has gone meanwhile. */
export async function fillPhoto(db: D1Database, teamId: string, id: number, imageId: string): Promise<boolean> {
	const result = await db
		.prepare(`UPDATE photos SET image_id = ?, deleted_at = NULL WHERE team_id = ? AND id = ? AND image_id LIKE '${PENDING}%'`)
		.bind(imageId, teamId, id).run();
	return result.meta.changes === 1;
}

/** A reserved row whose image never reached Images. */
export const dropReservedPhoto = (db: D1Database, teamId: string, id: number) => db
	.prepare(`DELETE FROM photos WHERE team_id = ? AND id = ? AND image_id LIKE '${PENDING}%'`).bind(teamId, id).run();

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

