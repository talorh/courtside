import type { TeamDeps } from "../../app/deps.ts";
import { conflict, notFound } from "../../app/errors.ts";
import type { LiveInput } from "../../platform/stream-live.ts";
import { gameTitle } from "../games/game-format.ts";
import { teamLabel } from "../teams/team-code.ts";
import { type Game, getGame } from "../games/games-repository.ts";
import type { Member } from "../members/members-repository.ts";
import { getActiveVideoForGame, getVideo } from "../videos/videos-repository.ts";
import { logProblem } from "../admin/problem-log.ts";
import {
	cancelLiveWithRecording, finishLive, getLatestLiveForGame, getOpenLiveForGame, insertLive, type LiveStream, listOpenLive, reopenLive, requestEnd, touchLive,
	wasStreamed,
} from "./live-repository.ts";

/** A game can go live while it has no video (or only a failed one) and isn't marked No video. */
export async function canGoLive(deps: TeamDeps, game: Game): Promise<boolean> {
	if (game.noVideo) return false;
	const video = await getActiveVideoForGame(deps.db, deps.team.id, game.id);
	return video === null || video.status === "failed";
}

/** The game's live input, made the first time someone opens Go live for it (so Go live is quick to start), and
 * reused when the game is streamed again after a test. */
export async function openLive(deps: TeamDeps, member: Member, game: Game): Promise<LiveInput> {
	const { db } = deps;
	const existing = await getOpenLiveForGame(db, deps.team.id, game.id);
	if (existing?.endRequestedAt) throw conflict("This game has been ended. It's being saved as the game video.");
	if (existing) {
		const input = await deps.live.getInput(existing.liveInputUid).catch((err: unknown) => {
			// Stream unreachable: a stream that's been used keeps its input (a phone may be sending to it).
			if (wasStreamed(existing)) throw err;
			console.error(JSON.stringify({ event: "live_input_unreachable", teamId: deps.team.id, liveStreamId: existing.id, error: String(err) }));
			return logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "Stream didn't answer about a game's Go live stream, so a new one was set up", error: err }).then(() => null);
		});
		if (input) {
			await touchLive(db, deps.team.id, existing.id, deps.now().toISOString()); // in use: not closed as unused for a day
			return input;
		}
		// Stream no longer has the input (deleted), so nothing can stream to it: close it and set up a new one below.
		// Not while a phone's recording is uploading, though: its End game and save need this stream.
		const recording = existing.recordingVideoId ? await getVideo(db, deps.team.id, existing.recordingVideoId) : null;
		if (recording?.status === "uploading") throw conflict("This game is already being filmed from another phone or tab.");
		console.error(JSON.stringify({ event: "live_input_missing", teamId: deps.team.id, liveStreamId: existing.id }));
		await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "A game's Go live stream had gone from Stream, so a new one was set up" });
		await finishLive(db, deps.team.id, existing.id, "cancelled", deps.now().toISOString());
	}
	if (!(await canGoLive(deps, game))) throw conflict("This game already has its video.");
	// Streaming again after a try that wasn't saved: reuse its input while Stream still has it. The nightly sweep takes a
	// closed stream's input after two days (a Go live opened early in the week, closed as unused), so often it's gone,
	// and a new one is set up below: the usual path, not a failure.
	const last = await getLatestLiveForGame(db, deps.team.id, game.id);
	const kept = last?.status === "cancelled" ? await deps.live.getInput(last.liveInputUid) : null;
	if (last && kept) {
		await deps.live.enableInput(last.liveInputUid);
		await reopenLive(db, deps.team.id, last.id, member.id, deps.now().toISOString());
		return kept;
	}
	const input = await deps.live.createInput(`${teamLabel(deps.team)} · ${game.startsAt.slice(0, 10)} · ${gameTitle(game)}`, deps.team.id);
	const saved = await insertLive(db, { teamId: deps.team.id, gameId: game.id, liveInputUid: input.uid, startedBy: member.id, nowIso: deps.now().toISOString() })
		.then(() => true, async (err: unknown) => {
			// Another phone opened Go live for this game at the same moment (one open stream per game): use theirs.
			if (!(await getOpenLiveForGame(db, deps.team.id, game.id))) throw err;
			return false;
		});
	if (saved) return input;
	await deps.live.deleteInput(input.uid);
	return openLive(deps, member, game);
}

export interface LiveNow {
	stream: LiveStream;
	/** A broadcast is coming in right now (as opposed to set up, paused or just finished). */
	isLive: boolean;
}

/** Is a phone streaming right now? Only once Go live has started its recording (see wasStreamed); an external app, as
 * soon as it's sending. A Stream hiccup must never break a page, so it reads as `whenUnknown` (not live). */
export async function isBroadcasting(deps: TeamDeps, stream: LiveStream, whenUnknown = false): Promise<boolean> {
	const app = stream.source === "app";
	if (stream.endRequestedAt || (!app && !wasStreamed(stream))) return false;
	try {
		return await (app ? deps.live.appConnected(stream.liveInputUid) : deps.live.isConnected(stream.liveInputUid));
	} catch (err) {
		console.error(JSON.stringify({ event: "live_status_failed", teamId: deps.team.id, liveStreamId: stream.id, error: String(err) }));
		await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "Stream didn't say whether a game was live", error: err });
		return whenUnknown;
	}
}

/** Open live streams with whether each is broadcasting now. One Stream call per open stream (normally zero or one). */
export async function liveNow(deps: TeamDeps): Promise<LiveNow[]> {
	const open = await listOpenLive(deps.db, deps.team.id);
	return Promise.all(open.map(async (stream) => ({ stream, isLive: await isBroadcasting(deps, stream) })));
}

/** Switches the input off once the database says the stream is over. Non-fatal (logged): a Stream hiccup mustn't block
 * that (the phone has stopped sending, Go live won't hand the input out again), and the daily sweep deletes it later. */
export async function switchOff(deps: TeamDeps, stream: Pick<LiveStream, "id" | "liveInputUid">): Promise<void> {
	await deps.live.disableInput(stream.liveInputUid).catch(async (err: unknown) => {
		console.error(JSON.stringify({ event: "live_disable_failed", teamId: deps.team.id, liveStreamId: stream.id, error: String(err) }));
		await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "A finished Go live stream couldn't be switched off in Stream (the nightly clean-up deletes it)", error: err });
	});
}

/**
 * End game: no more broadcasts to this game, ever (Go live won't open it again, and the input is switched off).
 * The phone's recording upload, still finishing, then saves it as the game video.
 */
export async function endLive(deps: TeamDeps, gameId: number): Promise<void> {
	const open = await getOpenLiveForGame(deps.db, deps.team.id, gameId);
	if (!open) throw notFound("Live stream");
	if (open.endRequestedAt) return;
	await requestEnd(deps.db, deps.team.id, open.id, deps.now().toISOString());
	await switchOff(deps, open);
}

/** Deleting a game (with its footage) closes its live stream so nothing can stream to it. */
export async function closeLiveForGame(deps: TeamDeps, gameId: number): Promise<void> {
	const open = await getOpenLiveForGame(deps.db, deps.team.id, gameId);
	if (!open) return;
	await finishLive(deps.db, deps.team.id, open.id, "cancelled", deps.now().toISOString());
	await switchOff(deps, open);
}

/** Before "No video" or deleting a game that has no video: a stream that was only set up (Go live opened) is closed,
 * but one that has streamed is footage on its way, so refuse rather than lose it. */
export async function closeUnusedLive(deps: TeamDeps, gameId: number, action: string): Promise<void> {
	const open = await getOpenLiveForGame(deps.db, deps.team.id, gameId);
	if (!open) return;
	const refuse = conflict(`This game was live streamed and its video is being saved, so it can't be ${action}.`);
	if (wasStreamed(open)) throw refuse;
	// An external app can be sending (Stream recording it) before the 5-minute run notes it; Stream not answering refuses.
	if (open.source === "app" && await isBroadcasting(deps, open, true)) throw refuse;
	// Only while it still has no recording: a filmer may tap Go live meanwhile (refused then, as above).
	if (await cancelLiveWithRecording(deps.db, deps.team.id, open.id, null, deps.now().toISOString())) return switchOff(deps, open);
	if (await getOpenLiveForGame(deps.db, deps.team.id, gameId)) throw refuse;
}

/** Games broadcasting right now, for the LIVE NOW cards on Home and Watch games. */
export async function liveGames(deps: TeamDeps): Promise<Game[]> {
	const live = (await liveNow(deps)).filter((l) => l.isLive);
	const games = await Promise.all(live.map((l) => getGame(deps.db, deps.team.id, l.stream.gameId)));
	return games.filter((g): g is Game => g !== null);
}
