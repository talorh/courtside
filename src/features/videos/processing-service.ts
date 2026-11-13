import type { TeamDeps } from "../../app/deps.ts";
import { runEach } from "../../shared/run-each.ts";
import { record } from "../activity/activity-service.ts";
import { dropShortTest } from "../live/browser-live-service.ts";
import { ticketFailedVideo } from "./failed-video-ticket.ts";
import { requestStreamCopy } from "./upload-finish.ts";
import { dropStreamCopy, markFailed, markHdFailed, markHdReady, markReady } from "./video-writes-repository.ts";
import { listVideosAwaitingHd, listVideosByStatus, type Video } from "./videos-repository.ts";
import { logProblem } from "../admin/problem-log.ts";
import { videosWithSegments } from "../live/recording-segments-repository.ts";
import { joinRecordings } from "../live/join-service.ts";

// A run has 200 outside calls for every step and every team (src/index.ts); each video costs up to 3.
const BATCH = 12;
// HD checks are 1 to 3 calls each and can wait a run; keep them small so a busy run stays under the limit.
const HD_BATCH = 5;

/** Stream copies, and joins: a carried-on recording's segments are joined first (live/join-service.ts), not copied as
 * the first alone. Which videos have segments is asked only when there's something uncopied, so a quiet team costs
 * no extra trip. */
export async function retryStreamCopies(deps: TeamDeps) {
	const uncopied = (await listVideosByStatus(deps.db, deps.team.id, "processing")).filter((v) => !v.streamUid);
	const joining = uncopied.length ? await videosWithSegments(deps.db, deps.team.id) : new Set<number>();
	const pending = uncopied.filter((v) => !joining.has(v.id)).slice(0, BATCH);
	const result = await runEach(pending, (video) => requestStreamCopy(deps, video));
	const joins = await joinRecordings(deps, uncopied.filter((v) => joining.has(v.id)));
	return { copiesRequested: result.succeeded, joined: joins.joined, errors: [...result.errors, ...joins.errors] };
}

/**
 * Stream no longer has the video's copy (deleted there by hand, say): nothing would ever move it on, and every run
 * would fail. A new copy from the original (`retryStreamCopies`, next run), or failed if there's no original.
 */
async function replaceMissingCopy(deps: TeamDeps, video: Video, uid: string): Promise<void> {
	console.warn(JSON.stringify({ event: "stream_copy_missing", teamId: deps.team.id, videoId: video.id, uid }));
	await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: `Stream no longer had a video's copy: ${video.r2Key ? "making it again from the original" : "there's no original, so it's failed"}` });
	if (video.r2Key) await dropStreamCopy(deps.db, deps.team.id, video.id, uid);
	else {
		const reason = "it no longer has this video, and there's no original to copy it from again";
		await markFailed(deps.db, deps.team.id, video.id, reason);
		await ticketFailedVideo(deps, video, `Stream ${reason}`);
	}
}

async function advance(deps: TeamDeps, video: Video, counts: { ready: number; failed: number }): Promise<void> {
	const uid = video.streamUid as string;
	const state = await deps.stream.details(uid);
	if (!state) return replaceMissingCopy(deps, video, uid);
	if (state.state === "ready" && state.readyToStream) {
		// Stream says -1 for a length it doesn't know: unknown, never "a test" (that would delete a game) or "0:00".
		const duration = state.durationSeconds >= 0 ? state.durationSeconds : null;
		if (duration !== null && await dropShortTest(deps, video, duration)) return;
		await markReady(deps.db, deps.team.id, video.id, duration);
		counts.ready++;
		await record(deps, { kind: "video_ready", gameId: video.gameId, memberId: video.uploadedBy });
		await requestHd(deps, uid, { videoId: video.id });
	} else if (state.state === "error") {
		await markFailed(deps.db, deps.team.id, video.id, state.errorReason || "Stream could not process this video");
		console.error(JSON.stringify({ event: "video_failed", teamId: deps.team.id, videoId: video.id, reason: state.errorReason }));
		counts.failed++;
		await record(deps, { kind: "video_failed", gameId: video.gameId, memberId: video.uploadedBy, detail: state.errorReason || null });
		await ticketFailedVideo(deps, video, state.errorReason);
	}
}

/** Asks Stream for the HD MP4 once a video or clip is ready. Non-fatal (logged): a hiccup here mustn't fail the run, as
 * trackHdDownloads asks again every run while Stream has none (a video), and the first download asks (a clip). */
export async function requestHd(deps: TeamDeps, uid: string, ids: { videoId?: number; clipId?: number }): Promise<void> {
	try {
		await deps.stream.generateDownload(uid);
	} catch (err) {
		console.warn(JSON.stringify({ event: "hd_request_failed", teamId: deps.team.id, ...ids, error: String(err) }));
		await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: `Stream couldn't start a ${ids.clipId ? "clip's" : "video's"} HD download (it's asked again)`, error: err });
	}
}

export async function advanceProcessing(deps: TeamDeps) {
	const processing = (await listVideosByStatus(deps.db, deps.team.id, "processing")).filter((v) => v.streamUid).slice(0, BATCH);
	const counts = { ready: 0, failed: 0 };
	const result = await runEach(processing, (video) => advance(deps, video, counts));
	return { ...counts, errors: result.errors };
}

/** Stream couldn't make the MP4: noted on the video so the job stops asking (the game page's download still asks Stream
 * itself), one problem in the Log, and one more request in case it was a hiccup. Never fails the run. */
async function hdFailed(deps: TeamDeps, video: Video, uid: string): Promise<void> {
	await markHdFailed(deps.db, deps.team.id, video.id, deps.now().toISOString());
	console.warn(JSON.stringify({ event: "hd_failed", teamId: deps.team.id, videoId: video.id, uid }));
	await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "Stream couldn't make a video's HD MP4 (asked once more; the video plays as usual)" });
	await requestHd(deps, uid, { videoId: video.id });
}

/**
 * Ready videos whose HD MP4 isn't confirmed: note when it's done (Notifications shows it), ask again if Stream has no
 * download for it (e.g. the request after markReady failed), and stop asking once Stream says it can't make it.
 */
export async function trackHdDownloads(deps: TeamDeps) {
	const waiting = (await listVideosAwaitingHd(deps.db, deps.team.id)).slice(0, HD_BATCH);
	const counts = { hdReady: 0 };
	const result = await runEach(waiting, async (video) => {
		const uid = video.streamUid as string;
		const state = await deps.stream.downloadStatus(uid);
		if (state === "ready") {
			await markHdReady(deps.db, deps.team.id, video.id, deps.now().toISOString());
			counts.hdReady++;
			await record(deps, { kind: "hd_ready", gameId: video.gameId });
		} else if (state === "none") {
			// No MP4 asked for yet, or no video at all any more (Stream answers both the same way).
			if (await deps.stream.details(uid)) await requestHd(deps, uid, { videoId: video.id });
			else await replaceMissingCopy(deps, video, uid);
		} else if (state === "error") {
			await hdFailed(deps, video, uid);
		}
	});
	return { ...counts, errors: result.errors };
}
