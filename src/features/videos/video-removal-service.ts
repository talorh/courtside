import type { TeamDeps } from "../../app/deps.ts";
import { addDays } from "../../shared/time.ts";
import { setAlert } from "../admin/alerts-service.ts";
import { deleteClipsForVideo } from "../clips/clips-service.ts";
import { deleteSegmentRows, listSegments } from "../live/recording-segments-repository.ts";
import { softDeleteVideo } from "./video-writes-repository.ts";
import type { Video } from "./videos-repository.ts";

export type DeleteReason = "admin" | "removal_request" | "retention" | "upload_cancelled" | "replaced" | "live_test";

// Deleted by a person: gone from the site at once, but the media stays a day in case it was a mistake.
// Undo by clearing deleted_at, deleted_reason and purge_after on the row before then.
const KEPT_A_DAY: ReadonlySet<DeleteReason> = new Set(["admin", "removal_request"]);

/** Takes the video off the site; its media goes now, or a day later for a person's delete (the cron calls purgeMedia). */
export async function deleteVideo(deps: TeamDeps, video: Video, reason: DeleteReason): Promise<void> {
	const now = deps.now();
	// Its parts couldn't be joined and the admins were alerted: deleting it deals with that, as Keep the first part does.
	if (video.joinFailedAt) await setAlert(deps, "joiner", "ok", "The game waiting on it was dealt with: its video was deleted");
	if (KEPT_A_DAY.has(reason)) {
		await softDeleteVideo(deps.db, deps.team.id, video.id, now.toISOString(), reason, addDays(now, 1).toISOString());
		return;
	}
	await purgeMedia(deps, video);
	await softDeleteVideo(deps.db, deps.team.id, video.id, now.toISOString(), reason);
}

/** Deletes the clips and the media (Stream copy, R2 original or unfinished multipart, a carried-on recording's
 * segments). Media failures abort. */
export async function purgeMedia(deps: TeamDeps, video: Video): Promise<void> {
	await deleteClipsForVideo(deps, video.id);
	for (const s of await listSegments(deps.db, deps.team.id, video.id)) {
		if (s.r2UploadId) await deps.originals.abort(s.r2Key, s.r2UploadId);
		else await deps.originals.remove(s.r2Key);
	}
	await deleteSegmentRows(deps.db, deps.team.id, video.id);
	if (video.streamUid) await deps.stream.deleteVideo(video.streamUid);
	if (video.r2Key && video.r2UploadId) await deps.originals.abort(video.r2Key, video.r2UploadId);
	else if (video.r2Key) await deps.originals.remove(video.r2Key);
}
