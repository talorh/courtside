// Deleting an upload that hasn't finished: the Upload page's Cancel, and Go live's Delete it and start again (a
// recording this phone made, or the filmer's own from another phone), with a carried-on recording's segments.
import type { TeamDeps } from "../../app/deps.ts";
import { conflict } from "../../app/errors.ts";
import { getLiveByRecording } from "../live/live-repository.ts";
import { STILL_SENDING_SECONDS } from "../live/recording-save-service.ts";
import { lastPartAt } from "../live/recording-segments-service.ts";
import { deleteSegmentRows, listSegments } from "../live/recording-segments-repository.ts";
import type { Member } from "../members/members-repository.ts";
import { requireActiveUpload } from "./upload-service.ts";
import { deleteVideo } from "./video-removal-service.ts";
import type { Video } from "./videos-repository.ts";

export async function abortUpload(deps: TeamDeps, member: Member, videoId: number): Promise<void> {
	const upload = await requireActiveUpload(deps, member, videoId);
	await refuseWhileStillComing(deps, upload);
	for (const s of await listSegments(deps.db, deps.team.id, upload.id)) if (s.r2UploadId) await deps.originals.abort(s.r2Key, s.r2UploadId);
	await deleteSegmentRows(deps.db, deps.team.id, upload.id);
	await deleteVideo(deps, upload, "upload_cancelled");
}

/** Refuses to delete a live recording that may still be coming in (here, and the team manager's Delete video). */
export async function refuseWhileStillComing(deps: TeamDeps, video: Video): Promise<void> {
	// A live recording a phone is still streaming (the same filmer's other phone or tab) isn't deleted from here. A
	// Stream hiccup reads as not streaming, as on the pages.
	const live = await getLiveByRecording(deps.db, deps.team.id, video.id);
	if (live?.status === "open" && !live.endRequestedAt && await deps.live.isConnected(live.liveInputUid).catch(() => false)) {
		throw conflict("This game is still being streamed from a phone, so its recording can't be deleted from here.");
	}
	// Nor one still sending: a part in the last two minutes, or a recording newer than that whose first part may still
	// be going up on a weak signal before Stream sees the phone.
	if (live?.status === "open" && Date.parse(await lastPartAt(deps, video)) > deps.now().getTime() - STILL_SENDING_SECONDS * 1000) {
		throw conflict("This recording may still be coming from a phone: it began, or a part of it arrived, in the last two minutes. Try again in two minutes.");
	}
}
