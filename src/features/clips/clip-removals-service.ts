import type { TeamDeps } from "../../app/deps.ts";
import { conflict, notFound } from "../../app/errors.ts";
import { record } from "../activity/activity-service.ts";
import type { Member } from "../members/members-repository.ts";
import { requireVideo } from "../videos/watch-service.ts";
import { createClipRemovalRequest, getOpenClipRequestClipId, resolveClipRequest } from "./clip-removals-repository.ts";
import { canDeleteClip, deleteClip, requireClip } from "./clips-service.ts";

/** Anyone who can't delete a clip themselves can ask a team manager to. Returns the game id to go back to. */
export async function requestClipRemoval(deps: TeamDeps, member: Member, clipId: number, reason: string): Promise<number> {
	const { db } = deps;
	const clip = await requireClip(db, deps.team.id, clipId);
	if (canDeleteClip(member)) throw conflict("You can delete this clip yourself.");
	const video = await requireVideo(db, deps.team.id, clip.videoId);
	const created = await createClipRemovalRequest(db, { teamId: deps.team.id, clipId, memberId: member.id, reason, nowIso: deps.now().toISOString() });
	if (created) await record(deps, { kind: "clip_removal_requested", gameId: video.gameId, memberId: member.id, detail: reason ? `${clip.label}: ${reason}` : clip.label });
	return video.gameId;
}

async function requireOpenClipRequest(deps: TeamDeps, requestId: number): Promise<number> {
	const clipId = await getOpenClipRequestClipId(deps.db, deps.team.id, requestId);
	if (clipId === null) throw notFound("Open clip removal request");
	return clipId;
}

/** Deleting the clip also closes every open request for it (see deleteClip). */
export async function deleteClipForRequest(deps: TeamDeps, actor: Member, requestId: number): Promise<void> {
	const clipId = await requireOpenClipRequest(deps, requestId);
	await deleteClip(deps, await requireClip(deps.db, deps.team.id, clipId), actor.id);
}

export async function keepClip(deps: TeamDeps, actor: Member, requestId: number, note: string): Promise<void> {
	await requireOpenClipRequest(deps, requestId);
	await resolveClipRequest(deps.db, deps.team.id, requestId, { status: "kept", note, resolvedBy: actor.id, nowIso: deps.now().toISOString() });
}
