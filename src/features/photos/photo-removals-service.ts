import type { TeamDeps } from "../../app/deps.ts";
import { conflict, notFound } from "../../app/errors.ts";
import { record } from "../activity/activity-service.ts";
import { logTeamChange } from "../admin/team-log.ts";
import type { Member } from "../members/members-repository.ts";
import { createPhotoRemovalRequest, getOpenPhotoRequestPhotoId, resolvePhotoRequest } from "./photo-removals-repository.ts";
import { canDeletePhoto, deletePhoto, requirePhoto } from "./photos-service.ts";

/** The Log's detail for a photo deleted because someone asked (log-photos.ts). */
export const PHOTO_REMOVAL_ASKED = "removal request";

/** Whoever added a photo, and a team manager, delete it; everyone else asks a team manager to. */
export async function requestPhotoRemoval(deps: TeamDeps, member: Member, photoId: number, reason: string): Promise<void> {
	const { db } = deps;
	const photo = await requirePhoto(db, deps.team.id, photoId);
	if (canDeletePhoto(member, photo)) throw conflict("You can delete this photo yourself.");
	const created = await createPhotoRemovalRequest(db, { teamId: deps.team.id, photoId, memberId: member.id, reason, nowIso: deps.now().toISOString() });
	if (created) await record(deps, { kind: "photo_removal_requested", gameId: null, memberId: member.id, detail: reason || null });
}

async function requireOpenPhotoRequest(deps: TeamDeps, requestId: number): Promise<number> {
	const photoId = await getOpenPhotoRequestPhotoId(deps.db, deps.team.id, requestId);
	if (photoId === null) throw notFound("Open photo removal request");
	return photoId;
}

/** Deleting the photo also closes every open request for it (deletePhoto). */
export async function deletePhotoForRequest(deps: TeamDeps, actor: Member, requestId: number): Promise<void> {
	const photoId = await requireOpenPhotoRequest(deps, requestId);
	await deletePhoto(deps, await requirePhoto(deps.db, deps.team.id, photoId), "removal_request", actor.id);
	await logTeamChange(deps, actor.email, "photo_deleted", PHOTO_REMOVAL_ASKED);
}

export async function keepPhoto(deps: TeamDeps, actor: Member, requestId: number, note: string): Promise<void> {
	await requireOpenPhotoRequest(deps, requestId);
	await resolvePhotoRequest(deps.db, deps.team.id, requestId, { status: "kept", note, resolvedBy: actor.id, nowIso: deps.now().toISOString() });
	await logTeamChange(deps, actor.email, "photo_kept", note);
}
