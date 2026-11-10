import type { TeamDeps } from "../../app/deps.ts";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../../app/errors.ts";
import { runEach } from "../../shared/run-each.ts";
import { logProblem } from "../admin/problem-log.ts";
import { logTeamChange } from "../admin/team-log.ts";
import { isRealDate, localTimeSeconds } from "../../shared/time.ts";
import type { Member } from "../members/members-repository.ts";
import { footageDue } from "../teams/team-code.ts";
import { cleanJpeg } from "./jpeg.ts";
import { photoFileName } from "./photo-name.ts";
import { resolveRequestsForPhotoWrite } from "./photo-removals-repository.ts";
import { dropReservedPhoto, fillPhoto, getPhoto, listExpiredPhotos, type Photo, type PhotoDeleteReason, reservePhoto, softDeletePhotoWrite } from "./photos-repository.ts";

/** Cloudflare Images keeps photos up to 10 MB. The phone makes them far smaller first (public/photos.js). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const RETENTION_BATCH = 50;
/** The Log's detail for photos the site deleted at the season's end (log-photos.ts). */
export const PHOTO_SEASON_OVER = "season over";
const SAVE_FAILED = "Couldn't save the photo just now. Try again in a minute.";

/** A real local date and time to the second, 'YYYY-MM-DDTHH:MM:SS'. */
const isTakenAt = (value: string) => /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value) && isRealDate(value.slice(0, 10));

/**
 * Adds one photo (the phone sends each on its own). `takenAt`: when the phone says it was taken, read from the
 * photo before the phone made it smaller (public/photos.js); with none, one still to come or one that isn't a date
 * (a camera's clock never set), it's now. The photo goes with its team's season, at the end of 31 December of the year
 * that season ends, as its videos do, whenever it was taken. Its row comes first, so Images can name it as it downloads.
 * Returns its id.
 */
export async function addPhoto(deps: TeamDeps, member: Member, file: Uint8Array, takenAt: string): Promise<number> {
	const { db } = deps;
	const now = deps.now();
	const added = localTimeSeconds(now);
	const taken = isTakenAt(takenAt) && takenAt < added ? takenAt : added;
	const deleteAfter = footageDue(deps.team);
	if (deleteAfter <= now.toISOString()) throw conflict("This team's season is over and its photos have been deleted, so no more can be added.");
	const jpeg = cleanJpeg(file);
	if (!jpeg) throw badRequest("That isn't a photo the site can take. Choose a photo and try again.");
	const teamId = deps.team.id;
	const id = await reservePhoto(db, {
		teamId, takenAt: taken, width: jpeg.width, height: jpeg.height, bytes: jpeg.bytes.length, uploadedBy: member.id, deleteAfter, createdAt: now.toISOString(),
	});
	let imageId: string;
	try {
		imageId = await deps.images.upload(jpeg.bytes, { teamId, uploadedBy: member.id, filename: photoFileName(deps.team, { id, takenAt: taken }) });
	} catch (err) {
		await dropReservedPhoto(db, teamId, id);
		throw new HttpError(502, "photo_save_failed", SAVE_FAILED, { cause: err });
	}
	if (await fillPhoto(db, teamId, id, imageId)) {
		await logTeamChange(deps, member.email, "photo_added", "");
		return id;
	}
	// Not saved, so don't leave Images holding a photo nobody can see or delete. Should that fail too, the nightly
	// clean-up removes it (jobs/sweep-orphans.ts).
	await deps.images.delete(imageId).catch(async (cleanup: unknown) => {
		console.error(JSON.stringify({ event: "photo_cleanup_failed", teamId, imageId, error: String(cleanup) }));
		await logProblem(deps, { kind: "photo_problem", teamId, who: member.email, what: "A photo that didn't save couldn't be deleted from Images (the nightly clean-up does it)", error: cleanup });
	});
	throw new Error(`The photo's row ${id} went before its image was saved`);
}

export async function requirePhoto(db: D1Database, teamId: string, id: number): Promise<Photo> {
	const photo = await getPhoto(db, teamId, id);
	if (!photo) throw notFound("Photo");
	return photo;
}

/**
 * Images first, so a failure leaves the row for a retry; then the row and its open removal requests closed, together (one
 * without the other would leave a request nobody can see or answer). Final: there is no undo (whoever took the photo
 * still has it on their phone).
 */
export async function deletePhoto(deps: TeamDeps, photo: Pick<Photo, "id" | "imageId">, reason: PhotoDeleteReason, actorId: number | null = null): Promise<void> {
	const { db } = deps, nowIso = deps.now().toISOString();
	await deps.images.delete(photo.imageId);
	await db.batch([
		softDeletePhotoWrite(db, deps.team.id, photo.id, nowIso, reason),
		resolveRequestsForPhotoWrite(db, deps.team.id, photo.id, { status: "photo_deleted", note: "", resolvedBy: actorId, nowIso }),
	]);
}

/** Whoever added a photo can delete it (added by mistake, say); a team manager can delete any. */
export const canDeletePhoto = (member: Pick<Member, "id" | "role">, photo: Pick<Photo, "uploadedBy">) =>
	member.role === "manager" || photo.uploadedBy === member.id;

export async function deletePhotoFromPage(deps: TeamDeps, member: Member, photoId: number): Promise<void> {
	const photo = await requirePhoto(deps.db, deps.team.id, photoId);
	if (!canDeletePhoto(member, photo)) throw forbidden("Only whoever added this photo, or the team manager, can delete it.");
	await deletePhoto(deps, photo, "admin", member.id);
	await logTeamChange(deps, member.email, "photo_deleted", "");
}

/** Several chosen on the Photos page: all of them, or none when any isn't the member's to delete. */
export async function deletePhotosFromPage(deps: TeamDeps, member: Member, photoIds: number[]): Promise<void> {
	const photos = await Promise.all(photoIds.map((id) => requirePhoto(deps.db, deps.team.id, id)));
	if (!photos.every((photo) => canDeletePhoto(member, photo))) throw forbidden("Only whoever added a photo, or the team manager, can delete it.");
	for (const photo of photos) {
		await deletePhoto(deps, photo, "admin", member.id);
		await logTeamChange(deps, member.email, "photo_deleted", "");
	}
}

/** Cron, beside the videos' retention: photos whose season is over, a batch a run. */
export async function enforcePhotoRetention(deps: TeamDeps) {
	const expired = (await listExpiredPhotos(deps.db, deps.team.id, deps.now().toISOString())).slice(0, RETENTION_BATCH);
	const result = await runEach(expired, async (photo) => {
		await deletePhoto(deps, photo, "retention");
		await logTeamChange(deps, "site", "photo_deleted", PHOTO_SEASON_OVER);
	});
	return { photosExpired: result.succeeded, errors: result.errors };
}
