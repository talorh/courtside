import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import type { Video } from "../videos/videos-repository.ts";
import { cancelLiveWithRecording, type LiveStream } from "./live-repository.ts";
import { switchOff } from "./live-service.ts";

// What End game sends: how much the phone recorded, pauses left out, and whether End game was tapped or the camera
// stopped (an older page sends neither).
export const stopSchema = z.object({ recordedSeconds: z.number().min(0).max(36_000).optional(), cause: z.enum(["tapped", "camera"]).optional() });

// A minute of recording is about 20 MB (2.5 Mbps picture and the sound), so more than two 8 MB parts in storage is
// more than a minute recorded, whatever the page counted.
const MOST_PARTS_IN_A_TEST = 2;

/**
 * How long the stream counts as, for the under-a-minute test rule. The time since Go live, unless the page says less was
 * recorded (paused waiting for tip-off, say, then End game) and storage doesn't hold more than that.
 * `recorded`: it's the page's count, so the reason says so.
 */
export async function streamSeconds(deps: TeamDeps, video: Video, recordedSeconds: number | undefined): Promise<{ seconds: number; recorded: boolean }> {
	const sinceGoLive = (deps.now().getTime() - Date.parse(video.createdAt)) / 1000;
	if (recordedSeconds === undefined || recordedSeconds >= sinceGoLive || !video.r2Key || !video.r2UploadId) return { seconds: sinceGoLive, recorded: false };
	// Storage not answering mustn't stop End game, nor throw a recording away on a guess: it's kept, as the game.
	const stored = await deps.presigner.listParts(video.r2Key, video.r2UploadId).then((parts) => parts?.length ?? 0, (err: unknown) => {
		console.error(JSON.stringify({ event: "live_parts_unreadable", teamId: deps.team.id, videoId: video.id, error: String(err) }));
		return Infinity;
	});
	return stored > MOST_PARTS_IN_A_TEST ? { seconds: sinceGoLive, recorded: false } : { seconds: recordedSeconds, recorded: true };
}

export const recordedReason = (seconds: number) => `Only ${Math.round(seconds)} seconds were recorded, so it was treated as a test and not saved.`;

/** End game on a stream with no recording at all (Go live opened, the camera never started): a test with nothing to
 * throw away, cancelled only while it still has no recording (a filmer may tap Go live meanwhile). True if it was. */
export async function cancelUnrecorded(deps: TeamDeps, open: LiveStream): Promise<boolean> {
	const reason = "End game was tapped before the camera started, so there was nothing to save.";
	if (!(await cancelLiveWithRecording(deps.db, deps.team.id, open.id, null, deps.now().toISOString(), reason))) return false;
	await switchOff(deps, open);
	return true;
}
