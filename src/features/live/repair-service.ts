// A Go live recording Stream refused (Safari can write frame lengths it can't read, say) is repaired once before it's
// failed: the joiner copies it, as one part, into a fresh file (live/join-service.ts, the same step that joins a
// carried-on game's parts), and Stream is asked again for that. The file it refused stays in R2 until the repaired copy
// plays (or the video is deleted). Refused again, or not repaired, the video fails as any does, with its ticket. An
// upload (a phone's own file) isn't repaired.
import type { TeamDeps } from "../../app/deps.ts";
import { logProblem } from "../admin/problem-log.ts";
import { startRepairWrite } from "../videos/video-writes-repository.ts";
import { isGoLiveRecording } from "./recording-segments-repository.ts";
import type { Video } from "../videos/videos-repository.ts";

/** Where the repaired copy of `r2Key` goes, and back: the refused file a repaired one came from. */
export const repairedKey = (r2Key: string) => r2Key.replace(/(\.[a-z0-9]+)$/i, ".repaired$1");
export const refusedKey = (r2Key: string) => r2Key.replace(/\.repaired(\.[a-z0-9]+)$/i, "$1");

/** Sent to be repaired, and its repaired file not yet the video's: the join step's to do. */
export const isRepairing = (v: Video) => v.status === "processing" && v.repairTriedAt !== null && v.r2Key !== null && !v.r2Key.includes(".repaired.");

/** Stream refused the video's copy `uid` for `reason`: true if it's being repaired (its first time, a Go live recording
 * with its original; or another run began it just now), false if it should fail as before. */
export async function tryRepair(deps: TeamDeps, video: Video, uid: string, reason: string): Promise<boolean> {
	if (video.repairTriedAt !== null || !video.r2Key || !(await isGoLiveRecording(deps.db, deps.team.id, video.id))) return false;
	if (!(await startRepairWrite(deps.db, deps.team.id, video.id, uid, reason, deps.now().toISOString()))) return true;
	console.warn(JSON.stringify({ event: "video_repair_started", teamId: deps.team.id, videoId: video.id, gameId: video.gameId, streamUid: uid, reason }));
	await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "Stream refused a Go live recording: the joiner is copying it into a fresh file to send again", detail: reason });
	// Its refused copy is no use to anyone; one that can't be deleted now goes with the nightly sweep.
	await deps.stream.deleteVideo(uid).catch((err: unknown) => console.warn(JSON.stringify({ event: "stream_delete_failed", teamId: deps.team.id, videoId: video.id, error: String(err) })));
	return true;
}
