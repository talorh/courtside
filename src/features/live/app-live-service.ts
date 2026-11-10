import type { TeamDeps } from "../../app/deps.ts";
import { conflict, forbidden, notFound } from "../../app/errors.ts";
import { hasRole } from "../../auth/permissions.ts";
import { localDate } from "../../shared/time.ts";
import { record } from "../activity/activity-service.ts";
import type { Game } from "../games/games-repository.ts";
import { requireGame } from "../games/games-service.ts";
import type { Member } from "../members/members-repository.ts";
import { teamCopy } from "../teams/team-copy.ts";
import { noteFirstLive, setSource } from "./app-live-repository.ts";
import { logLive } from "./live-log.ts";
import { getOpenLiveForGame, type LiveStream, setLastLive, wasStreamed } from "./live-repository.ts";
import { canGoLive, endLive, isBroadcasting, openLive } from "./live-service.ts";
import type { AppLive } from "./views/app-live-card.ts";
import { logProblem } from "../admin/problem-log.ts";

// A game streamed from an external app over RTMPS (an AI tracking camera's own app, which has to hold the camera) in
// place of Go live's camera. Stream records it, families watch it in the usual player about half a minute behind, and
// the 5-minute job saves the recording as the game video (app-live-sync.ts).

/** A drop or a restart within this long carries on the same recording; a longer gap starts another part. */
const RECONNECT_SECONDS = 600;

const FILMING = "This game is already being filmed from a phone, so it can't be switched to an external app.";
const event = (deps: TeamDeps, name: string, stream: LiveStream, more: Record<string, unknown> = {}) =>
	console.log(JSON.stringify({ event: name, teamId: deps.team.id, gameId: stream.gameId, liveStreamId: stream.id, ...more }));

/** Sets the game to stream from an external app. The same checks as Go live's start; choosing it twice is fine. The game
 * if that changed it (for the Log), null if it was the app's already. */
export async function useApp(deps: TeamDeps, member: Member, gameId: number): Promise<Game | null> {
	const { db } = deps;
	const game = await requireGame(db, deps.team.id, gameId);
	if (game.noVideo) throw conflict(`This game is set to No video. Ask ${teamCopy(deps.team).ask} to change that on the Fixture first.`);
	if (!game.liveStream) throw conflict("This game is set to be recorded, not live streamed. Record it and upload it after the game.");
	if (game.startsAt.slice(0, 10) < localDate(deps.now())) throw conflict("That game has been played, so it can't be streamed. Upload its video instead.");
	const before = await getOpenLiveForGame(db, deps.team.id, gameId);
	if (before?.source === "app" && !before.endRequestedAt) return null;
	if (before && before.recordingVideoId !== null) throw conflict(FILMING);
	if (!(await canGoLive(deps, game))) throw conflict("This game already has its video.");
	// Makes the game's live input if Go live hasn't yet (and refuses a game whose stream has been ended).
	await openLive(deps, member, game);
	const open = await getOpenLiveForGame(db, deps.team.id, gameId);
	if (!open) throw new Error(`Live stream for game ${gameId} didn't open`);
	// Before the game is the app's: if Stream doesn't answer, nothing has changed.
	await deps.live.keepTogether(open.liveInputUid, RECONNECT_SECONDS);
	if (!(await setSource(db, deps.team.id, open.id, "app", member.id, deps.now().toISOString()))) throw conflict(FILMING);
	event(deps, "live_app_chosen", open, { memberId: member.id });
	return game;
}

/** Back to Go live's camera, while the app hasn't streamed. A game that already isn't the app's is left as it is
 * (null); else the game, for the Log. */
export async function useCamera(deps: TeamDeps, member: Member, gameId: number): Promise<Game | null> {
	const game = await requireGame(deps.db, deps.team.id, gameId);
	const open = await getOpenLiveForGame(deps.db, deps.team.id, gameId);
	if (open?.source !== "app") return null;
	const streamed = conflict("This game has been streamed from the external app, so it can't go back to the phone's camera.");
	if (open.endRequestedAt || wasStreamed(open)) throw streamed;
	if (await deps.live.appConnected(open.liveInputUid)) throw conflict("The external app is streaming now. Stop it in the app first.");
	// (The input keeps its reconnect window: a browser's stream isn't recorded, so it makes no difference to the camera.)
	if (!(await setSource(deps.db, deps.team.id, open.id, "camera", member.id, deps.now().toISOString()))) throw streamed;
	event(deps, "live_app_camera", open, { memberId: member.id });
	return game;
}

/** An app's stream is arriving: the first time, the game is noted live (Activity), then when it was last seen. */
export async function noteAppLive(deps: TeamDeps, stream: LiveStream): Promise<void> {
	const nowIso = deps.now().toISOString();
	if (await noteFirstLive(deps.db, deps.team.id, stream.id, nowIso)) {
		await record(deps, { kind: "live_started", gameId: stream.gameId, memberId: stream.startedBy });
		await logLive(deps, stream.startedBy, "live_started", stream.gameId);
		event(deps, "live_app_live", stream);
	} else await setLastLive(deps.db, deps.team.id, stream.id, nowIso);
}

export interface AppStatus {
	/** The app is sending right now. */
	live: boolean;
	/** It has sent something: the game is the app's from here on. */
	streamed: boolean;
	/** Stopped and being saved, or closed: nothing more for Go live's external app card to do. */
	ended: boolean;
}

/** Go live's external app card's check, every few seconds, so a stream is noted live without waiting for the 5-minute job. */
export async function appStatus(deps: TeamDeps, gameId: number): Promise<AppStatus> {
	await requireGame(deps.db, deps.team.id, gameId);
	const open = await getOpenLiveForGame(deps.db, deps.team.id, gameId);
	if (open?.source !== "app") return { live: false, streamed: false, ended: true };
	const live = await isBroadcasting(deps, open);
	if (live) await noteAppLive(deps, open);
	return { live, streamed: live || wasStreamed(open), ended: open.endRequestedAt !== null };
}

/** What Go live's card for an app game shows. The key is only ever read here, for that page: a Stream hiccup shows a
 * note in its place, never an error page. */
export async function appLiveView(deps: TeamDeps, open: LiveStream): Promise<AppLive> {
	const status = await appStatus(deps, open.gameId);
	const address = await deps.live.appAddress(open.liveInputUid).catch((err: unknown) => {
		console.error(JSON.stringify({ event: "live_app_address_failed", teamId: deps.team.id, gameId: open.gameId, liveStreamId: open.id, error: String(err) }));
		return logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "Go live couldn't show an external app's stream address", error: err }).then(() => null);
	});
	return { address, status };
}

/** The app card's End game: final, as the camera's is. The job saves what Stream recorded. The game, for the Log. */
export async function stopApp(deps: TeamDeps, member: Member, gameId: number): Promise<Game> {
	const game = await requireGame(deps.db, deps.team.id, gameId);
	const open = await getOpenLiveForGame(deps.db, deps.team.id, gameId);
	if (open?.source !== "app") throw notFound("Live stream");
	if (open.startedBy !== member.id && !hasRole(member.role, "coach")) {
		throw forbidden("Only the person who set up this stream, a coach or a team manager can end it.");
	}
	// Stream still holds the recording open for its reconnect window (10 minutes), then finishes it: the job saves it then.
	await endLive(deps, gameId);
	event(deps, "live_app_stopped", open, { memberId: member.id });
	return game;
}
