import type { TeamDeps } from "../../app/deps.ts";
import { addDays } from "../../shared/time.ts";
import { record } from "../activity/activity-service.ts";
import { runEach } from "../../shared/run-each.ts";
import { advanceAppLive } from "./app-live-sync.ts";
import { advanceBrowserLive } from "./browser-live-service.ts";
import { switchOff } from "./live-service.ts";
import { saveIfStopped } from "./recording-save-service.ts";
import { cancelIfUnused, type LiveStream, listOpenLive, setLastLive, wasStreamed } from "./live-repository.ts";

// A live input set up (Go live opened) but never used is closed a day after Go live was last opened for it.
const UNUSED_HOURS = 24;

async function noteLive(deps: TeamDeps, stream: LiveStream, counts: { liveNow: number }): Promise<void> {
	if (stream.lastLiveAt === null) await record(deps, { kind: "live_started", gameId: stream.gameId, memberId: stream.startedBy });
	await setLastLive(deps.db, deps.team.id, stream.id, deps.now().toISOString());
	counts.liveNow++;
}

/**
 * One open live stream. From Go live's camera, saving is the phone's recording upload's job (it closes the stream when
 * it completes); this notes when the game is live (LIVE NOW, activity) and tidies up: a recording whose phone stopped
 * long ago (saved), one that was deleted, or an input nobody used. From an external app, this saves it too.
 */
export async function advanceStream(deps: TeamDeps, stream: LiveStream, counts: { liveNow: number }): Promise<void> {
	const cutoff = addDays(deps.now(), -UNUSED_HOURS / 24).toISOString();
	// An external app's stream is recorded by Stream, and saved from that (app-live-sync.ts).
	if (stream.source === "app") return advanceAppLive(deps, stream, counts, cutoff);
	// Not before Go live starts the recording: Stream's "connected" can be left over from a test (see wasStreamed). Nor
	// after End game, which switched the input off: whatever Stream still says, nothing more can come in.
	const connected = wasStreamed(stream) && !stream.endRequestedAt && await deps.live.isConnected(stream.liveInputUid);
	if (connected) await noteLive(deps, stream, counts);
	if (stream.recordingVideoId !== null) {
		// Its phone stopped part way, long ago (flat battery, page closed for good): what reached R2 is saved.
		if (!connected && (await saveIfStopped(deps, stream))) return;
		return advanceBrowserLive(deps, stream, connected);
	}
	// Checked again as it's written: Go live may have been opened or started since the run read the stream.
	if (!connected && (stream.endRequestedAt || stream.createdAt < cutoff) && (await cancelIfUnused(deps.db, deps.team.id, stream.id, cutoff, deps.now().toISOString()))) {
		await switchOff(deps, stream);
	}
}

/** Cron: notes when a game goes live, and tidies up streams that are finished with. */
export async function advanceLive(deps: TeamDeps) {
	const counts = { liveNow: 0 };
	const open = await listOpenLive(deps.db, deps.team.id);
	const result = await runEach(open, (stream) => advanceStream(deps, stream, counts));
	return { ...counts, errors: result.errors };
}
