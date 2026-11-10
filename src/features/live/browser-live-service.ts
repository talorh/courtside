import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import { conflict, forbidden, notFound } from "../../app/errors.ts";
import { hasRole } from "../../auth/permissions.ts";
import { localDate } from "../../shared/time.ts";
import { record } from "../activity/activity-service.ts";
import { requireGame } from "../games/games-service.ts";
import type { Member } from "../members/members-repository.ts";
import { insertUploadVideoWrite } from "../videos/video-writes-repository.ts";
import { getActiveVideoForGame, getVideo, type Video } from "../videos/videos-repository.ts";
import { deleteVideo } from "../videos/video-removal-service.ts";
import {
	cancelLiveWithRecording, cancelSavedLive, finishLive, getLiveByRecording, getOpenLiveForGame, linkRecordingWrite, type LiveStream,
} from "./live-repository.ts";
import { endLive, openLive, switchOff } from "./live-service.ts";
import { footageDue } from "../teams/team-code.ts";
import { recordedReason, streamSeconds } from "./live-test-rule.ts";
import { CAUSE_WORDS, logLive, type StopCause, testWords } from "./live-log.ts";
import { teamCopy } from "../teams/team-copy.ts";

// 8 MB parts (R2 wants them equal, 5 MB or more): about 25 seconds, so a dropped signal or a closed page costs little.
export const LIVE_PART_SIZE = 8 * 1024 * 1024;

export const startBrowserSchema = z.object({
	mimeType: z.string().regex(/^video\/(mp4|webm)\b/, "This browser can't record video"),
	/** Made once by the page: asking again with it (the first answer lost on a weak signal) gets the same recording. */
	attempt: z.uuid().optional(),
});

// What the Go live page saw while streaming (the microphone stopping, the live picture reconnecting), seconds after Go live.
export const liveEventsSchema = z.object({
	events: z.array(z.object({ s: z.number().int().min(0).max(36_000), what: z.string().min(1).max(160), p: z.boolean().optional() })).min(1).max(40),
});

// Anything shorter is a test or a false start, not the game: it's never processed or kept.
export const MIN_RECORDING_SECONDS = 60;

export const testReason = (seconds: number) => `The live stream was only ${Math.round(seconds)} seconds, so it was treated as a test and not saved.`;

/** Go live from the browser: the game's live input (for watching live) plus a recording upload that becomes the game
 * video. One recording at a time: a second phone (or a second tab) is told the game is already being filmed. */
export async function startBrowserLive(deps: TeamDeps, member: Member, gameId: number, mimeType: string, attempt?: string) {
	const { db } = deps;
	const game = await requireGame(db, deps.team.id, gameId);
	if (game.noVideo) throw conflict(`This game is set to No video. Ask ${teamCopy(deps.team).ask} to change that on the Fixture first.`);
	if (!game.liveStream) throw conflict("This game is set to be recorded, not live streamed. Film it with the phone's Camera app and upload it after the game.");
	if (game.startsAt.slice(0, 10) < localDate(deps.now())) throw conflict("That game has been played, so it can't be streamed. Upload its video instead.");
	const input = await openLive(deps, member, game);
	const open = await getOpenLiveForGame(db, deps.team.id, gameId);
	if (!open) throw new Error(`Live stream for game ${gameId} didn't open`);
	if (open.source === "app") throw conflict("This game is set to stream from an external app. Reload Go live: its card there can switch it back to this phone's camera.");
	const current = open.recordingVideoId ? await getVideo(db, deps.team.id, open.recordingVideoId) : null;
	if (current?.status === "uploading") {
		// The same page asking again, its first answer lost on a weak signal: the same recording, not started yet.
		if (attempt && current.uploadedBy === member.id && current.r2Key?.includes(`/${attempt}/`)) {
			return { videoId: current.id, partSize: LIVE_PART_SIZE, whipUrl: input.whipUrl };
		}
		throw conflict("This game is already being filmed from another phone or tab.");
	}
	if (current) throw conflict("This game already has its video.");
	const busy = "This game's video is already being uploaded.";
	const existing = await getActiveVideoForGame(db, deps.team.id, gameId); // one that failed goes, as for an upload (clearSlot)
	if (existing?.status === "failed") await deleteVideo(deps, existing, "replaced");
	else if (existing) throw conflict(busy);
	const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
	const r2Key = `originals/${deps.team.id}/${attempt ?? crypto.randomUUID()}/live-${game.startsAt.slice(0, 10)}.${ext}`;
	const r2UploadId = await deps.originals.createMultipart(r2Key, mimeType.split(";")[0]!);
	// The recording and its link to the stream, together: a failure can't leave a recording that blocks the game.
	const [inserted] = await db.batch([
		insertUploadVideoWrite(db, {
			teamId: deps.team.id, gameId, r2Key, r2UploadId, originalName: `Live ${game.startsAt.slice(0, 10)}.${ext}`,
			originalBytes: 0, uploadedBy: member.id, deleteAfter: footageDue(deps.team), createdAt: deps.now().toISOString(),
		}),
		linkRecordingWrite(db, deps.team.id, open.id, r2Key, member.id),
	]).catch(async (err: unknown) => {
		// Not saved, so close the R2 upload; an upload that started meanwhile (one video per game) is the usual reason.
		await deps.originals.abort(r2Key, r2UploadId);
		if (await getActiveVideoForGame(db, deps.team.id, gameId)) throw conflict(busy);
		throw err;
	});
	await logLive(deps, member.email, "live_started", gameId);
	return { videoId: inserted!.meta.last_row_id, partSize: LIVE_PART_SIZE, whipUrl: input.whipUrl };
}

/** Its recording has finished uploading: the live stream is done (saved), so nothing more can stream to it. */
export async function closeBrowserLive(deps: TeamDeps, video: Pick<Video, "id" | "gameId">): Promise<void> {
	const { db } = deps;
	const open = await getOpenLiveForGame(db, deps.team.id, video.gameId);
	if (open?.recordingVideoId !== video.id) return;
	await finishLive(db, deps.team.id, open.id, "saved", deps.now().toISOString());
	await switchOff(deps, open);
	await record(deps, { kind: "live_saved", gameId: video.gameId, memberId: open.startedBy, detail: "from the browser" });
	await logLive(deps, open.startedBy, "live_saved", video.gameId);
}

/**
 * Cron, for a browser stream: note when it's live (LIVE NOW, activity). Saving is the upload's job; this only
 * tidies up when the recording is gone (deleted to start again, or removed) or finished without closing it.
 */
export async function advanceBrowserLive(deps: TeamDeps, stream: LiveStream, connected: boolean): Promise<void> {
	const { db } = deps;
	const nowIso = deps.now().toISOString();
	if (connected) return;
	const video = await getVideo(db, deps.team.id, stream.recordingVideoId!);
	if (video?.status === "uploading") return;
	if (video && video.status !== "failed") return closeBrowserLive(deps, video);
	const gone = "The recording from the phone was deleted before it was saved.";
	if (await cancelLiveWithRecording(db, deps.team.id, stream.id, stream.recordingVideoId!, nowIso, gone)) await switchOff(deps, stream);
}

/**
 * End game. Under a minute since Go live, or recorded (live-test-rule.ts), it was a test (say, at home): the
 * recording is thrown away before it's uploaded or processed, and the game is free to stream again (the page says why).
 * Otherwise the stream ends for good and the recording, still uploading, becomes the game video. Both go in the Log.
 */
export async function stopBrowserLive(deps: TeamDeps, member: Member, gameId: number, page: { recordedSeconds?: number; cause?: StopCause } = {}): Promise<{ status: "ended" } | { status: "test"; seconds: number }> {
	const { db } = deps;
	const open = await getOpenLiveForGame(db, deps.team.id, gameId);
	if (!open) throw notFound("Live stream");
	const video = !open.endRequestedAt && open.recordingVideoId ? await getVideo(db, deps.team.id, open.recordingVideoId) : null;
	// End game is final, so only the phone streaming (its recording's uploader), a coach or a team manager can.
	if (video && video.uploadedBy !== member.id && !hasRole(member.role, "coach")) {
		throw forbidden("Only the parent streaming this game, a coach or a team manager can end it.");
	}
	const { seconds, recorded } = video ? await streamSeconds(deps, video, page.recordedSeconds) : { seconds: Infinity, recorded: false };
	if (video?.status !== "uploading" || seconds >= MIN_RECORDING_SECONDS) {
		await endLive(deps, gameId);
		if (!open.endRequestedAt) await logLive(deps, member.email, "live_ended", gameId, page.cause ? CAUSE_WORDS[page.cause] : "");
		return { status: "ended" };
	}
	await deleteVideo(deps, video, "live_test");
	await finishLive(db, deps.team.id, open.id, "cancelled", deps.now().toISOString(), (recorded ? recordedReason : testReason)(seconds));
	await switchOff(deps, open);
	await logLive(deps, member.email, "live_test", gameId, testWords(seconds, recorded, page.cause));
	return { status: "test", seconds: Math.round(seconds) };
}

/**
 * Processing finished: a recording under a minute that wasn't caught at End game (say, a pause made it look
 * longer, or End game didn't reach the server) is dropped the same way. True if it was dropped.
 */
export async function dropShortTest(deps: TeamDeps, video: Video, durationSeconds: number): Promise<boolean> {
	if (durationSeconds >= MIN_RECORDING_SECONDS) return false;
	const live = await getLiveByRecording(deps.db, deps.team.id, video.id);
	if (!live) return false;
	await deleteVideo(deps, video, "live_test");
	await cancelSavedLive(deps.db, deps.team.id, live.id, deps.now().toISOString(), testReason(durationSeconds));
	await logLive(deps, null, "live_test", video.gameId, `${Math.round(durationSeconds)} seconds, found once it was processed`);
	return true;
}
