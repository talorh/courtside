import { z } from "zod";
import { htmlResponse, redirect } from "../../app/respond.ts";
import { html } from "../../shared/html.ts";
import type { Router } from "../../app/router.ts";
import { localTime } from "../../shared/time.ts";
import { doneMessage, idParam, parseForm } from "../../shared/validation.ts";
import { deleteVideo } from "./video-removal-service.ts";
import { keepFirstPart } from "./keep-first-service.ts";
import { watchMessages, watchPage } from "./views/watch-page.ts";
import { listNotes } from "../notes/notes-repository.ts";
import { isCoach } from "../notes/notes-routes.ts";
import { notesPanel } from "../notes/views/notes-panel.ts";
import { loadPlayer } from "./watch-player.ts";
import { getLatestLiveForGame, getOpenLiveForGame, wasStreamed } from "../live/live-repository.ts";
import { lastActivityAt } from "../activity/activity-repository.ts";
import { isBroadcasting } from "../live/live-service.ts";
import { playerUrl, whepUrl } from "../../platform/stream-tokens.ts";
import { loadWatch, moveTargets, moveToGame, requireVideo } from "./watch-service.ts";
import { gameName, logGameChange } from "../games/game-log.ts";
import { getGame } from "../games/games-repository.ts";
import { markOpened } from "./video-views-repository.ts";
import { gamePhase } from "../games/game-format.ts";
import { getScore } from "../scores/scores-repository.ts";
import { scorePanel } from "../scores/views/score-line.ts";
import { gameBlurb } from "../games/game-blurb.ts";
import { getGameLines } from "../games/game-lines-repository.ts";
import { starredBy } from "../favourites/favourites-repository.ts";

const moveSchema = z.object({ gameId: z.coerce.number().int().positive() });

export function registerWatchRoutes(router: Router): void {
	router.get("/games/:id", "watcher", async ({ url, params, frame, member, viewAs, deps }) => {
		const { db, config } = deps;
		const { game, video } = await loadWatch(db, deps.team.id, idParam(params.id, "Game"));
		const uid = video?.status === "ready" ? video.streamUid : null;
		const view = video && uid ? await loadPlayer(deps, video, uid, url.searchParams.get("clip")) : { playerSrc: null, clips: [], currentClip: null, players: [] };
		if (video && uid) await markOpened(db, { teamId: deps.team.id, videoId: video.id, memberId: member.id, nowIso: deps.now().toISOString() });
		const targets = member.role === "manager" && video && deps.team.status === "active" ? await moveTargets(db, deps.team.id, game) : [];
		const nowLocal = localTime(deps.now());
		const score = await getScore(db, deps.team.id, game.id);
		const phase = gamePhase(game.startsAt, nowLocal, score !== null);
		const openLive = view.playerSrc ? null : await getOpenLiveForGame(db, deps.team.id, game.id);
		// Opening Go live sets up a stream for the game it picks; until it streams, the player shows only on game day, until
		// the game's over. Asks Stream directly, so it plays the moment the phone goes live (the cron notes it every 5 minutes).
		const isLive = openLive ? await isBroadcasting(deps, openLive) : false;
		const gameDay = game.startsAt.slice(0, 10) === nowLocal.slice(0, 10) && phase !== "complete";
		const open = openLive && (isLive || wasStreamed(openLive) || gameDay) ? openLive : null;
		const token = open ? await deps.tokens.sign(open.liveInputUid) : "";
		const live = open ? {
			source: open.source === "app" ? { player: playerUrl(config.streamCustomerCode, token) } : { whep: whepUrl(config.streamCustomerCode, token) },
			isLive,
			ended: open.endRequestedAt !== null,
		} : null;
		// Why the last stream wasn't saved (a test, say), while the game still has no video.
		const last = !video && !open ? await getLatestLiveForGame(db, deps.team.id, game.id) : null;
		const message = doneMessage(watchMessages(deps.team), url);
		// A video being processed: since the stream that recorded it stopped, or the upload finished (the card says when
		// it's usually ready). Never an earlier stream's stop, a test thrown away, say.
		const stream = video?.status === "processing" ? await getLatestLiveForGame(db, deps.team.id, game.id) : null;
		const processingSince = video?.status !== "processing" ? null
			: (stream?.recordingVideoId === video.id ? stream.endRequestedAt : null) ?? await lastActivityAt(db, deps.team.id, game.id, "upload_finished") ?? video.createdAt;
		const liveNote = last?.status === "cancelled" && last.cancelReason ? last.cancelReason : null;
		// A closed season: nothing new on the page (notes, scores, moving the video); the banner says why.
		const open_ = deps.team.status === "active";
		const coachNotes = isCoach(member, viewAs) && open_ ? notesPanel(game.id, await listNotes(db, deps.team.id, game.id), view.playerSrc !== null)
			: member.role === "coach" && viewAs ? html`<p class="small">Coaches' notes are the coaches' own, so View as leaves them out.</p>` : "";
		const back = `/games/${game.id}${view.currentClip ? `?clip=${view.currentClip.id}` : ""}`;
		const result = { score, inProgress: phase === "in_progress", hidden: member.hideScores, back };
		const scoreForm = member.role === "manager" && phase !== "upcoming" && open_ ? scorePanel(game, score, member.hideScores) : "";
		const blurb = gameBlurb(game, phase, member.hideScores ? null : score, await getGameLines(db, deps.team.id));
		const starred = await starredBy(db, deps.team.id, member.id);
		const stars = { game: starred.games.has(game.id), clips: starred.clips };
		return htmlResponse(watchPage({ frame, game, video, processingSince, moveTargets: targets, message, coachNotes, live, liveNote, upcoming: phase === "upcoming", result, scoreForm, blurb, stars, ...view }));
	});

	router.post("/videos/:id/move", "manager", async ({ req, params, member, viewer, deps }) => {
		const { gameId } = await parseForm(req, moveSchema);
		const video = await requireVideo(deps.db, deps.team.id, idParam(params.id, "Video"));
		await moveToGame(deps, video.id, gameId);
		const [from, to] = await Promise.all([getGame(deps.db, deps.team.id, video.gameId), getGame(deps.db, deps.team.id, gameId)]);
		if (from && to) await logGameChange(deps, { email: viewer.email, memberId: member.id }, "video_moved", `from ${gameName(from)} to ${gameName(to)}`);
		return redirect(`/games/${gameId}?done=moved`);
	});

	router.post("/videos/:id/delete", "manager", async ({ params, member, viewer, deps }) => {
		const video = await requireVideo(deps.db, deps.team.id, idParam(params.id, "Video"));
		const game = await getGame(deps.db, deps.team.id, video.gameId);
		await deleteVideo(deps, video, "admin");
		if (game) await logGameChange(deps, { email: viewer.email, memberId: member.id }, "video_deleted", gameName(game), game.id);
		return redirect(`/games/${video.gameId}?done=deleted`);
	}, { confirm: true });

	// A carried-on stream's parts couldn't be joined: the first part stands as the game video (keep-first-service.ts).
	router.post("/videos/:id/keep-first", "manager", async ({ params, viewer, deps }) => {
		const video = await requireVideo(deps.db, deps.team.id, idParam(params.id, "Video"));
		await keepFirstPart(deps, video, viewer.email);
		return redirect(`/games/${video.gameId}?done=kept`);
	}, { confirm: true, closedTeams: true });
}
