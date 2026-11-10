// Carry on streaming after the Go live page closed mid-game: the same phone (it remembers the recording) gets a new
// segment of the same recording, on the same stream input (docs/architecture.md, Live streaming).
import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import { conflict, forbidden, notFound } from "../../app/errors.ts";
import type { Member } from "../members/members-repository.ts";
import { getVideo } from "../videos/videos-repository.ts";
import { LIVE_PART_SIZE } from "./browser-live-service.ts";
import { logLive } from "./live-log.ts";
import { getOpenLiveForGame } from "./live-repository.ts";
import { insertSegment, listSegments, segmentKey } from "./recording-segments-repository.ts";
import { ASK_AGAIN_SECONDS, STILL_SENDING_SECONDS } from "./recording-save-service.ts";
import { lastPartAt } from "./recording-segments-service.ts";

export const continueSchema = z.object({
	videoId: z.number().int().positive(),
	mimeType: z.string().regex(/^video\/(mp4|webm)\b/, "This browser can't record video"),
});

/** A new segment to record into, or wait: a part arrived in the last two minutes (`waitLeft`: the seconds until that's
 * over, for the page's countdown), or Stream still sees the phone. */
export type ContinueAnswer = { segment: number; videoId: number; partSize: number; whipUrl: string } | { status: "sending" | "streaming"; retryIn: number; waitLeft?: number };

const container = (mimeOrKey: string) => (/webm/.test(mimeOrKey) ? "webm" : "mp4");
const START_AGAIN = "Save what was recorded, or delete it and start again.";

export async function continueBrowserLive(deps: TeamDeps, member: Member, gameId: number, input: z.infer<typeof continueSchema>): Promise<ContinueAnswer> {
	const { db } = deps;
	const open = await getOpenLiveForGame(db, deps.team.id, gameId);
	if (!open || open.recordingVideoId !== input.videoId) throw notFound("Recording");
	if (open.endRequestedAt) throw conflict("This game has been ended, so it can't be streamed again. Save what was recorded.");
	const video = await getVideo(db, deps.team.id, input.videoId);
	if (!video || video.status !== "uploading" || !video.r2Key) throw notFound("Recording");
	if (video.uploadedBy !== member.id) throw forbidden(`Only the phone that was filming can carry on. ${START_AGAIN}`);
	if (container(input.mimeType) !== container(video.r2Key)) throw conflict(`This phone records a different kind of video from the one that was filming, so it can't carry on. ${START_AGAIN}`);
	const liveInput = await deps.live.getInput(open.liveInputUid);
	if (!liveInput) throw conflict(`The stream is no longer there. ${START_AGAIN}`);
	// A tab still alive would be doubled up: Stream still seeing the phone, or a part in the last two minutes, means wait.
	if (await deps.live.isConnected(open.liveInputUid).catch(() => false)) {
		// Stream keeps saying connected for a minute or two after a phone has gone: the wait Carry on shows. (Its
		// player-side lifecycle answer is no quicker: it says live for an input switched off hours before.)
		console.log(JSON.stringify({ event: "live_continue_wait", teamId: deps.team.id, gameId }));
		return { status: "streaming", retryIn: ASK_AGAIN_SECONDS };
	}
	const last = await lastPartAt(deps, video);
	const now = deps.now();
	const waitLeft = Math.ceil(STILL_SENDING_SECONDS - (now.getTime() - Date.parse(last)) / 1000);
	if (waitLeft > 0) return { status: "sending", retryIn: Math.min(ASK_AGAIN_SECONDS, waitLeft), waitLeft };
	const n = (await listSegments(db, deps.team.id, video.id)).length + 2;
	const r2Key = segmentKey(video.r2Key, n);
	const r2UploadId = await deps.originals.createMultipart(r2Key, input.mimeType.split(";")[0]!);
	await insertSegment(db, { teamId: deps.team.id, videoId: video.id, n, r2Key, r2UploadId, nowIso: now.toISOString() });
	await deps.live.enableInput(open.liveInputUid);
	const lost = Math.round((now.getTime() - Date.parse(last)) / 60_000);
	await logLive(deps, member.email, "live_continued", gameId, `carried on after the page closed; about ${lost} minutes not recorded (segment ${n})`);
	return { segment: n, videoId: video.id, partSize: LIVE_PART_SIZE, whipUrl: liveInput.whipUrl };
}
