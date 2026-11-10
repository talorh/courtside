import type { TeamDeps } from "../../app/deps.ts";
import { notFound } from "../../app/errors.ts";
import { record } from "../activity/activity-service.ts";
import type { Member } from "../members/members-repository.ts";
import { deleteVideo } from "../videos/video-removal-service.ts";
import { getVideo, type Video } from "../videos/videos-repository.ts";
import { requireVideo } from "../videos/watch-service.ts";
import { createRemovalRequest, getOpenRequestVideoId, resolveRequest, resolveRequestsForVideo } from "./removals-repository.ts";

export async function requestRemoval(deps: TeamDeps, member: Member, videoId: number, reason: string): Promise<Video> {
	const video = await requireVideo(deps.db, deps.team.id, videoId);
	const created = await createRemovalRequest(deps.db, { teamId: deps.team.id, videoId, memberId: member.id, reason, nowIso: deps.now().toISOString() });
	if (created) await record(deps, { kind: "removal_requested", gameId: video.gameId, memberId: member.id, detail: reason || null });
	return video;
}

async function requireOpenRequest(deps: TeamDeps, requestId: number): Promise<number> {
	const videoId = await getOpenRequestVideoId(deps.db, deps.team.id, requestId);
	if (videoId === null) throw notFound("Open removal request");
	return videoId;
}

/** Deletes the video (unless a team manager already did) and closes all open requests for it. */
export async function deleteVideoForRequest(deps: TeamDeps, actor: Member, requestId: number): Promise<void> {
	const videoId = await requireOpenRequest(deps, requestId);
	const video = await getVideo(deps.db, deps.team.id, videoId);
	if (video) await deleteVideo(deps, video, "removal_request");
	await resolveRequestsForVideo(deps.db, deps.team.id, videoId, {
		status: "video_deleted", note: video ? "" : "Video was already deleted", resolvedBy: actor.id, nowIso: deps.now().toISOString(),
	});
}

export async function keepVideo(deps: TeamDeps, actor: Member, requestId: number, note: string): Promise<void> {
	await requireOpenRequest(deps, requestId);
	await resolveRequest(deps.db, deps.team.id, requestId, { status: "kept", note, resolvedBy: actor.id, nowIso: deps.now().toISOString() });
}
