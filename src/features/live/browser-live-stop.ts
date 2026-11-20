// End game for a stream from Go live's camera, and the under-a-minute test rule (live-test-rule.ts), at End game and
// once the recording is processed.
import type { TeamDeps } from "../../app/deps.ts";
import { conflict, forbidden, notFound } from "../../app/errors.ts";
import { hasRole } from "../../auth/permissions.ts";
import type { Member } from "../members/members-repository.ts";
import { deleteVideo } from "../videos/video-removal-service.ts";
import { getVideo, type Video } from "../videos/videos-repository.ts";
import { MIN_RECORDING_SECONDS, testReason } from "./browser-live-service.ts";
import { cancelSavedLive, finishLive, getLiveByRecording, getOpenLiveForGame } from "./live-repository.ts";
import { CAUSE_WORDS, logLive, type StopCause, testWords } from "./live-log.ts";
import { endLive, switchOff } from "./live-service.ts";
import { cancelUnrecorded, recordedReason, streamSeconds } from "./live-test-rule.ts";
import { listSegments } from "./recording-segments-repository.ts";

/**
 * End game. Under a minute since Go live, or recorded (live-test-rule.ts), and never carried on, it was a test (say,
 * at home): the recording is thrown away before it's uploaded or processed, and the game is free to stream again (the
 * page says why).
 * Nothing recorded at all (Go live opened, the camera never started) is the same, with nothing to throw away.
 * Otherwise the stream ends for good and the recording, still uploading, becomes the game video. All go in the Log.
 */
export async function stopBrowserLive(deps: TeamDeps, member: Member, gameId: number, page: { recordedSeconds?: number; cause?: StopCause; keptMinutes?: number } = {}): Promise<{ status: "ended" } | { status: "test"; seconds: number }> {
	const { db } = deps;
	const open = await getOpenLiveForGame(db, deps.team.id, gameId);
	if (!open) throw notFound("Live stream");
	// An external app's stream is ended from its own card (app-live-service.ts stopApp), which says who may.
	if (open.source === "app") throw conflict("This game is streaming from an external app: end it with End game on its card on Go live.");
	if (!open.endRequestedAt && !open.recordingVideoId && await cancelUnrecorded(deps, open)) {
		await logLive(deps, member.email, "live_test", gameId, "nothing recorded, then End game was tapped");
		return { status: "test", seconds: 0 };
	}
	const video = !open.endRequestedAt && open.recordingVideoId ? await getVideo(db, deps.team.id, open.recordingVideoId) : null;
	// End game is final, so only the phone streaming (its recording's uploader), a coach or a team manager can.
	if (video && video.uploadedBy !== member.id && !hasRole(member.role, "coach")) {
		throw forbidden("Only the parent streaming this game, a coach or a team manager can end it.");
	}
	// A carried-on recording is never a test: the page counts only its own segment, and storage only segment 1.
	const carriedOn = video ? (await listSegments(db, deps.team.id, video.id)).length > 0 : false;
	const { seconds, recorded } = video && !carriedOn ? await streamSeconds(deps, video, page.recordedSeconds) : { seconds: Infinity, recorded: false };
	if (video?.status !== "uploading" || seconds >= MIN_RECORDING_SECONDS) {
		await endLive(deps, gameId, page.keptMinutes ?? null);
		if (!open.endRequestedAt) await logLive(deps, member.email, "live_ended", gameId, endWords(page));
		return { status: "ended" };
	}
	await deleteVideo(deps, video, "live_test");
	await finishLive(db, deps.team.id, open.id, "cancelled", deps.now().toISOString(), (recorded ? recordedReason : testReason)(seconds));
	await switchOff(deps, open);
	await logLive(deps, member.email, "live_test", gameId, testWords(seconds, recorded, page.cause));
	return { status: "test", seconds: Math.round(seconds) };
}

/** The Log's End game line: how it ended, and the minutes still on the phone when there were some (it waits for them). */
function endWords(page: { cause?: StopCause; keptMinutes?: number }): string {
	const kept = page.keptMinutes ? `with about ${page.keptMinutes} ${page.keptMinutes === 1 ? "minute" : "minutes"} of the game still on the phone` : "";
	return [page.cause ? CAUSE_WORDS[page.cause] : "", kept].filter(Boolean).join(", ");
}

/**
 * Processing finished: a recording under a minute that wasn't caught at End game (say, a pause made it look
 * longer, or End game didn't reach the server) is dropped the same way. True if it was dropped. One that was carried
 * on never is, as at End game: its first part kept alone can be short and still be the game's.
 */
export async function dropShortTest(deps: TeamDeps, video: Video, durationSeconds: number): Promise<boolean> {
	if (durationSeconds >= MIN_RECORDING_SECONDS || video.carriedOnAt !== null) return false;
	const live = await getLiveByRecording(deps.db, deps.team.id, video.id);
	if (!live) return false;
	await deleteVideo(deps, video, "live_test");
	await cancelSavedLive(deps.db, deps.team.id, live.id, deps.now().toISOString(), testReason(durationSeconds));
	await logLive(deps, null, "live_test", video.gameId, `${Math.round(durationSeconds)} seconds, found once it was processed`);
	return true;
}
