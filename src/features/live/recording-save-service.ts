import type { TeamDeps } from "../../app/deps.ts";
import { forbidden, notFound } from "../../app/errors.ts";
import { hasRole } from "../../auth/permissions.ts";
import type { Member } from "../members/members-repository.ts";
import { finishUpload } from "../videos/upload-finish.ts";
import { deleteVideo } from "../videos/video-removal-service.ts";
import { getVideo, type Video } from "../videos/videos-repository.ts";
import { finishLive, getLatestLiveForGame, getOpenLiveForGame, type LiveStream } from "./live-repository.ts";
import { switchOff } from "./live-service.ts";
import { finishSegments, lastPartAt, leadingRun } from "./recording-segments-service.ts";
import { listSegments } from "./recording-segments-repository.ts";

// While a phone films or saves, a part reaches R2 about every 25 seconds: a newer one means it's still sending.
export const STILL_SENDING_SECONDS = 120;
// The cron saves a recording by itself: with no End game (the page died mid-game), once it's this old and nothing has
// come from its phone for as long, so a phone has the night to find Wi-Fi; after End game the phone has only its last
// parts to send, so this long with none means its page has gone.
export const QUIET_HOURS = 12;
export const ENDED_QUIET_MINUTES = 30;

/**
 * A recording whose phone stopped part way (page closed, flat battery) becomes the game video from R2's own list of
 * the parts that reached it, so nothing depends on that phone coming back. If nothing reached R2, the recording is
 * deleted and the game is free to stream or upload again. "sending": a part arrived within `quietSeconds`.
 */
async function saveRecordedSoFar(deps: TeamDeps, stream: LiveStream, video: Video, quietSeconds: number): Promise<"saved" | "nothing" | "sending"> {
	if ((await listSegments(deps.db, deps.team.id, video.id)).length) return saveSegments(deps, stream, video, quietSeconds);
	const listed = video.r2Key && video.r2UploadId ? await deps.presigner.listParts(video.r2Key, video.r2UploadId) : [];
	// R2 drops an upload's part list once it's whole: the phone's last Complete reached R2 but marking it here didn't.
	// That's the whole recording, so it's saved as it stands (finishUpload carries on past R2's "no such upload").
	if (listed === null && video.r2Key && (await deps.originals.exists(video.r2Key))) {
		await finishUpload(deps, video, [], video.uploadedBy);
		return "saved";
	}
	const stored = listed ?? [];
	if (stored.some((p) => Date.parse(p.uploaded) > deps.now().getTime() - quietSeconds * 1000)) return "sending";
	const parts = leadingRun(stored);
	if (parts.length === 0) {
		await deleteVideo(deps, video, "upload_cancelled");
		await finishLive(deps.db, deps.team.id, stream.id, "cancelled", deps.now().toISOString(), "Nothing from the phone reached the site, so there was nothing to save.");
		await switchOff(deps, stream);
		return "nothing";
	}
	await finishUpload(deps, video, parts, video.uploadedBy);
	return "saved";
}

/** A carried-on recording: every segment completed from R2's lists (recording-segments-service.ts), once quiet. */
async function saveSegments(deps: TeamDeps, stream: LiveStream, video: Video, quietSeconds: number): Promise<"saved" | "nothing" | "sending"> {
	if (Date.parse(await lastPartAt(deps, video)) > deps.now().getTime() - quietSeconds * 1000) return "sending";
	const finished = await finishSegments(deps, video, null);
	if (finished !== "nothing") return "saved";
	await deleteVideo(deps, video, "upload_cancelled");
	await finishLive(deps.db, deps.team.id, stream.id, "cancelled", deps.now().toISOString(), "Nothing from the phone reached the site, so there was nothing to save.");
	await switchOff(deps, stream);
	return "nothing";
}

// How soon the page asks again while the last of a recording is still arriving (STILL_SENDING_SECONDS).
export const ASK_AGAIN_SECONDS = 20;

/** `sending`: a part arrived in the last 2 minutes; `streaming`: Stream still has a phone connected (it says so for up to
 * 2 minutes after one has gone). Both ask the page to wait `retryIn` seconds and ask again. */
export type SaveAnswer = { status: "saved" | "nothing" } | { status: "sending" | "streaming"; retryIn: number };

/** Go live's "Save what was recorded": the filmer, from any phone, or a coach or team manager. Asking twice is fine. */
export async function saveRecording(deps: TeamDeps, member: Member, gameId: number): Promise<SaveAnswer> {
	const answer = await decideSave(deps, member, gameId);
	console.log(JSON.stringify({ event: "live_save", teamId: deps.team.id, gameId, memberId: member.id, ...answer }));
	return answer;
}

async function decideSave(deps: TeamDeps, member: Member, gameId: number): Promise<SaveAnswer> {
	const { db } = deps;
	const open = await getOpenLiveForGame(db, deps.team.id, gameId);
	if (!open) {
		if ((await getLatestLiveForGame(db, deps.team.id, gameId))?.status === "saved") return { status: "saved" };
		throw notFound("Recording");
	}
	const video = open.recordingVideoId ? await getVideo(db, deps.team.id, open.recordingVideoId) : null;
	if (!video) throw notFound("Recording");
	if (video.status !== "uploading") return { status: "saved" };
	if (video.uploadedBy !== member.id && !hasRole(member.role, "coach")) throw forbidden("Only the parent who filmed it, a coach or a team manager can save it.");
	// A phone still streaming it, or one that just stopped (a Stream hiccup reads as not streaming, as on the pages).
	if (!open.endRequestedAt && await deps.live.isConnected(open.liveInputUid).catch(() => false)) return { status: "streaming", retryIn: ASK_AGAIN_SECONDS };
	const result = await saveRecordedSoFar(deps, open, video, STILL_SENDING_SECONDS);
	return result === "sending" ? { status: "sending", retryIn: ASK_AGAIN_SECONDS } : { status: result };
}

/**
 * Cron, for an open stream whose phone isn't streaming: a recording nothing has come from for long enough is saved by
 * itself (flat battery, the page closed for good or closed as Saving appeared). Half an hour after End game; without
 * one, 12 hours after Go live. True if it was dealt with.
 */
export async function saveIfStopped(deps: TeamDeps, stream: LiveStream): Promise<boolean> {
	const video = stream.recordingVideoId ? await getVideo(deps.db, deps.team.id, stream.recordingVideoId) : null;
	if (video?.status !== "uploading") return false;
	const quietSeconds = stream.endRequestedAt ? ENDED_QUIET_MINUTES * 60 : QUIET_HOURS * 3600;
	const since = Date.parse(stream.endRequestedAt ?? video.createdAt);
	if (deps.now().getTime() - since < quietSeconds * 1000) return false;
	const result = await saveRecordedSoFar(deps, stream, video, quietSeconds);
	console.log(JSON.stringify({ event: "live_saved_by_itself", teamId: deps.team.id, liveStreamId: stream.id, videoId: video.id, result }));
	return result !== "sending";
}
