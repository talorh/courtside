import type { TeamDeps } from "../../app/deps.ts";
import type { LiveRecording } from "../../platform/stream-live-app.ts";
import { runEach } from "../../shared/run-each.ts";
import { formatClock, localTime } from "../../shared/time.ts";
import { record } from "../activity/activity-service.ts";
import { insertPartClipWrite } from "../clips/clips-repository.ts";
import { gameTitle } from "../games/game-format.ts";
import { getGame } from "../games/games-repository.ts";
import { footageDue, teamLabel } from "../teams/team-code.ts";
import { deleteVideo } from "../videos/video-removal-service.ts";
import { insertLiveVideoWrite } from "../videos/video-writes-repository.ts";
import { getActiveVideoForGame } from "../videos/videos-repository.ts";
import { saveAppLiveWrite } from "./app-live-repository.ts";
import { noteAppLive } from "./app-live-service.ts";
import { MIN_RECORDING_SECONDS, testReason } from "./browser-live-service.ts";
import { cancelIfUnused, cancelLiveWithRecording, finishLive, type LiveStream } from "./live-repository.ts";
import { switchOff } from "./live-service.ts";
import { logLive } from "./live-log.ts";
import { logProblem } from "../admin/problem-log.ts";

// Nothing arriving for this long after the app was last seen sending means the game is over, so it's saved. Longer than
// the reconnect window (RECONNECT_SECONDS), so a restart after a break, say at half-time, lands in the same game.
const SETTLE_MINUTES = 20;

const NOTHING = "The game was ended before the external app sent anything, so nothing was saved.";
const FAILED = "The live stream's recording couldn't be saved.";
const clock = (iso: string) => formatClock(localTime(new Date(iso)).slice(11));

/** Removes recordings that aren't kept (they'd only use storage). One that won't go is logged and left for the nightly
 * sweep: it mustn't stop the save. */
async function remove(deps: TeamDeps, stream: LiveStream, recordings: LiveRecording[]): Promise<void> {
	const { errors } = await runEach(recordings, async (r) => { await deps.stream.deleteVideo(r.uid); });
	if (!errors.length) return;
	console.error(JSON.stringify({ event: "live_app_leftovers", teamId: deps.team.id, liveStreamId: stream.id, errors: errors.map(String) }));
	await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "An external app's spare recordings couldn't be deleted (the nightly clean-up tries again)", error: errors[0] });
}

/** Closes a stream that isn't saved, saying why, and removes what Stream recorded of it. */
async function notSaved(deps: TeamDeps, stream: LiveStream, leftovers: LiveRecording[], reason: string): Promise<void> {
	if (!(await cancelLiveWithRecording(deps.db, deps.team.id, stream.id, null, deps.now().toISOString(), reason))) return;
	await switchOff(deps, stream);
	await remove(deps, stream, leftovers);
	console.log(JSON.stringify({ event: "live_app_not_saved", teamId: deps.team.id, gameId: stream.gameId, liveStreamId: stream.id, reason }));
}

/**
 * Saves the recordings: the longest becomes the game video, any other part of a minute or more (a restart after a
 * long gap) a clip of it, "Live stream, more from 8:05pm", so nothing is lost. The video, its clips and the stream's
 * close go in together. Each gets the usual processing and HD download from the jobs that follow. False if it has to
 * wait for the game's video.
 */
async function save(deps: TeamDeps, stream: LiveStream, parts: LiveRecording[]): Promise<boolean> {
	const { db } = deps;
	const team = deps.team.id;
	const nowIso = deps.now().toISOString();
	const existing = await getActiveVideoForGame(db, team, stream.gameId);
	// One that failed goes, as for an upload. Any other (uploaded before the app was seen sending) stays the game video.
	if (existing?.status === "failed") await deleteVideo(deps, existing, "replaced");
	const kept = existing && existing.status !== "failed" ? existing : null;
	// Its parts become its clips, which need its Stream video: still uploading, it has none yet, so this waits a run.
	if (kept && !kept.streamUid) return false;
	const main = kept ? null : [...parts].sort((a, b) => b.durationSeconds - a.durationSeconds)[0]!;
	const videoStreamUid = main?.uid ?? kept?.streamUid ?? null;
	const clips = videoStreamUid === null ? [] : parts.filter((p) => p !== main).map((p) => insertPartClipWrite(db, team, {
		videoStreamUid, label: `Live stream, more from ${clock(p.createdAt)}`, endSeconds: Math.round(p.durationSeconds), streamUid: p.uid, createdBy: stream.startedBy,
	}));
	if (main) {
		await db.batch([
			insertLiveVideoWrite(db, { teamId: team, gameId: stream.gameId, streamUid: main.uid, uploadedBy: stream.startedBy, deleteAfter: footageDue(deps.team), createdAt: nowIso }),
			...clips,
			saveAppLiveWrite(db, team, stream.id, main.uid, nowIso),
		]);
	} else {
		if (clips.length) await db.batch(clips);
		await finishLive(db, team, stream.id, "saved", nowIso);
	}
	await switchOff(deps, stream);
	// Stream names a recording by itself, nothing more: the team goes on each one kept, as on every video of the site's
	// (with the game's name, as Stream replaces what was there).
	const game = await getGame(db, team, stream.gameId);
	const name = game ? `${teamLabel(deps.team)} · ${game.startsAt.slice(0, 10)} · ${gameTitle(game)}` : teamLabel(deps.team);
	await runEach(parts, async (p) => { await deps.stream.label(p.uid, { name, teamId: team }); }).then(({ errors }) => {
		if (!errors.length) return;
		console.warn(JSON.stringify({ event: "live_app_label_failed", teamId: team, liveStreamId: stream.id, errors: errors.map(String) }));
		return logProblem(deps, { kind: "stream_problem", teamId: team, what: "An external app's recordings couldn't be named in Stream", error: errors[0] });
	});
	await record(deps, { kind: "live_saved", gameId: stream.gameId, memberId: stream.startedBy, detail: parts.length > 1 ? `${parts.length} parts` : "from an external app" });
	await logLive(deps, stream.startedBy, "live_saved", stream.gameId, parts.length > 1 ? `${parts.length} parts, from the external app` : "from the external app");
	console.log(JSON.stringify({
		event: "live_app_saved", teamId: team, gameId: stream.gameId, liveStreamId: stream.id, parts: parts.length,
		seconds: Math.round(parts.reduce((sum, p) => sum + p.durationSeconds, 0)), asGameVideo: main !== null,
	}));
	return true;
}

/**
 * The 5-minute job, for a game set to an external app. While the app sends, the game is noted live. Once it isn't: wait
 * for Stream to finish every recording, then save at once if End game was tapped, else once nothing has arrived
 * for SETTLE_MINUTES (in case the app starts again). `unusedBefore`: an app game nobody streamed to since then is closed.
 */
export async function advanceAppLive(deps: TeamDeps, stream: LiveStream, counts: { liveNow: number }, unusedBefore: string): Promise<void> {
	const { db } = deps;
	const nowIso = deps.now().toISOString();
	const ended = stream.endRequestedAt !== null;
	if (!ended && (await deps.live.appConnected(stream.liveInputUid))) {
		await noteAppLive(deps, stream);
		counts.liveNow++;
		return;
	}
	// Only this stream's: a reused input still has an earlier try's recordings.
	const since = Date.parse(stream.createdAt);
	const recordings = (await deps.live.recordings(stream.liveInputUid)).filter((r) => !(Date.parse(r.createdAt) < since));
	if (recordings.length === 0) {
		if (ended) return notSaved(deps, stream, [], NOTHING);
		if (await cancelIfUnused(db, deps.team.id, stream.id, unusedBefore, nowIso)) await switchOff(deps, stream);
		return;
	}
	// A recording stays live for its reconnect window after the app stops, then Stream finishes it.
	if (recordings.some((r) => r.state === "live" || r.state === "processing")) return;
	if (!ended) {
		// It came and went between two checks, so it was never seen sending: it's noted live now, and the wait starts.
		if (stream.lastLiveAt === null) return noteAppLive(deps, stream);
		if (Date.parse(stream.lastLiveAt) > deps.now().getTime() - SETTLE_MINUTES * 60_000) return;
	}
	const ready = recordings.filter((r) => r.state === "ready");
	const parts = ready.filter((r) => r.durationSeconds >= MIN_RECORDING_SECONDS);
	const short = ready.filter((r) => !parts.includes(r));
	if (parts.length === 0) {
		// Only a quick test, or every recording failed: nothing worth keeping, and the game is free to stream or upload.
		const longest = Math.max(0, ...ready.map((r) => r.durationSeconds));
		await notSaved(deps, stream, short, ready.length ? testReason(longest) : FAILED);
		if (ready.length) await logLive(deps, null, "live_test", stream.gameId, `${Math.round(longest)} seconds, from the external app`);
		if (!ready.length) await record(deps, { kind: "video_failed", gameId: stream.gameId, memberId: stream.startedBy, detail: FAILED });
		return;
	}
	if (await save(deps, stream, parts)) await remove(deps, stream, short);
}
