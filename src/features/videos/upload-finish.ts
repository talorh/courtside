import type { TeamDeps } from "../../app/deps.ts";
import type { UploadedPart } from "../../platform/r2-originals.ts";
import { streamDeletionDate } from "../../shared/time.ts";
import { record } from "../activity/activity-service.ts";
import { closeBrowserLive } from "../live/browser-live-service.ts";
import { streamName, videoName } from "./video-name.ts";
import { markUploaded, setStreamUid } from "./video-writes-repository.ts";
import type { Video } from "./videos-repository.ts";
import { logProblem } from "../admin/problem-log.ts";

const STREAM_PULL_TTL_SECONDS = 6 * 3600;

/** Asks Stream to pull the original from R2. Also used by the cron job to retry. */
export async function requestStreamCopy(deps: TeamDeps, video: Video): Promise<void> {
	if (!video.r2Key) throw new Error(`Video ${video.id} has no original to copy`);
	const url = await deps.presigner.getUrl(video.r2Key, { ttlSeconds: STREAM_PULL_TTL_SECONDS });
	const uid = await deps.stream.uploadFromUrl(url, {
		scheduledDeletion: streamDeletionDate(video.deleteAfter, deps.now()),
		meta: { name: streamName(await videoName(deps, video.gameId)), videoId: String(video.id), gameId: String(video.gameId), teamId: video.teamId },
	});
	await setStreamUid(deps.db, deps.team.id, video.id, uid);
}

/**
 * Completes the R2 upload with these parts and requests the Stream copy: a phone finishing its upload
 * (`completeUpload`), or a recording whose phone stopped part way, saved from R2's own list of its parts
 * (`live/recording-save-service.ts`). `completed`: the file is already whole in R2 (a carried-on recording's one
 * segment left), so there's nothing to complete. If Stream is unavailable, the video stays 'processing' with no
 * stream_uid and the cron job retries; "queued" says so.
 */
export async function finishUpload(deps: TeamDeps, upload: Video, parts: UploadedPart[], memberId: number | null, o: { completed?: boolean } = {}): Promise<"processing" | "queued"> {
	const { r2Key, r2UploadId } = upload;
	if (!r2Key || (!r2UploadId && !o.completed)) throw new Error(`Video ${upload.id} has no upload to finish`);
	if (!o.completed) {
		const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ partNumber: p.partNumber, etag: p.etag.replaceAll('"', "") }));
		await deps.originals.complete(r2Key, r2UploadId!, sorted).catch(async (err: unknown) => {
			// A retry after R2 finished the file but saving that here failed: the original is whole, so carry on.
			if (!(await deps.originals.exists(r2Key))) throw err;
		});
	}
	await markUploaded(deps.db, deps.team.id, upload.id);
	await record(deps, { kind: "upload_finished", gameId: upload.gameId, memberId });
	await closeBrowserLive(deps, upload);
	try {
		await requestStreamCopy(deps, { ...upload, status: "processing", r2UploadId: null });
		return "processing";
	} catch (err) {
		console.error(JSON.stringify({ event: "stream_copy_deferred", teamId: deps.team.id, videoId: upload.id, error: String(err) }));
		await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "An uploaded video couldn't be sent to Stream yet (the 5-minute job tries again)", error: err });
		return "queued";
	}
}
