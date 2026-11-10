import { HttpError } from "../../app/errors.ts";
import { htmlResponse, jsonOk, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { clearedSessionCookie, endRequestSession, sessionTimes } from "../../auth/session.ts";
import { signInPath } from "../signin/signin-routes.ts";
import { localTime } from "../../shared/time.ts";
import { gamePhase } from "../games/game-format.ts";
import { type Game, getGame } from "../games/games-repository.ts";
import { isFree, pickerGames } from "../games/games-service.ts";
import { idParam, parseJson } from "../../shared/validation.ts";
import { getVideo } from "../videos/videos-repository.ts";
import { liveEventsSchema, startBrowserLive, startBrowserSchema, stopBrowserLive } from "./browser-live-service.ts";
import { getLatestLiveForGame, getOpenLiveForGame, listOpenLive } from "./live-repository.ts";
import { appLiveView } from "./app-live-service.ts";
import { openLive } from "./live-service.ts";
import { stopSchema } from "./live-test-rule.ts";
import { saveRecording } from "./recording-save-service.ts";
import { continueBrowserLive, continueSchema } from "./browser-live-continue.ts";
import { livePage } from "./views/live-page.ts";
import { seasonOverPage } from "../../ui/closed-banner.ts";
import { logProblem } from "../admin/problem-log.ts";
import { gameName } from "../games/game-log.ts";

// Arrive early, an hour's game, then saving: a sign-in that runs out sooner than this is renewed first.
const SIGN_IN_RENEW_MS = 4 * 3_600_000;
/** A game starting this soon is in its warm-up: Go live picks it over one still under way that nobody is streaming. */
const WARM_UP_MS = 30 * 60_000;

export function registerLiveRoutes(router: Router): void {
	// Same people as Upload. Opening the page makes (or reuses) the game's live input, so the button is ready to tap.
	router.get("/live", "filmer", async ({ req, url, frame, member, deps }) => {
		// A closed season: no Go live, and no stream set up for it.
		if (deps.team.status !== "active") return htmlResponse(seasonOverPage(frame, "Go live", "live"));
		const { db } = deps;
		// A game whose stream was ended is being saved, so it isn't offered again. One being filmed from a browser
		// has its recording upload going, but stays in the list so the filmer can reload the page.
		const streams = await listOpenLive(db, deps.team.id);
		const filming = new Set(streams.filter((l) => l.recordingVideoId !== null).map((l) => l.gameId));
		const ended = new Set(streams.filter((l) => l.endRequestedAt && !filming.has(l.gameId)).map((l) => l.gameId));
		// Today's and upcoming games only (a played game is uploaded instead), plus one whose recording is still going up.
		const today = localTime(deps.now()).slice(0, 10);
		// Soonest first, so today's or the next game is at the top.
		const offered = (await pickerGames(db, deps.team, deps.now())).filter((r) => isFree(r) || filming.has(r.game.id)).map((r) => r.game)
			.filter((g) => !ended.has(g.id) && (g.startsAt.slice(0, 10) >= today || filming.has(g.id))).reverse();
		// Only games set to Live stream (one already being filmed stays); today's set to be recorded get a note instead.
		const games = offered.filter((g) => g.liveStream || filming.has(g.id));
		const recorded = offered.filter((g) => !games.includes(g) && g.startsAt.startsWith(today));
		const asked = Number(url.searchParams.get("game"));
		const nowLocal = localTime(deps.now());
		// The game being filmed today, else today's game still to finish (one starting in the next half hour, its warm-up,
		// before one under way that nobody's streaming), else today's, else the next one coming up.
		const isToday = (g: Game) => g.startsAt.startsWith(today);
		const toFinish = games.filter((g) => isToday(g) && gamePhase(g.startsAt, nowLocal) !== "complete");
		const soon = localTime(new Date(deps.now().getTime() + WARM_UP_MS));
		const selected = games.find((g) => g.id === asked)
			?? games.find((g) => isToday(g) && filming.has(g.id))
			?? toFinish.find((g) => g.startsAt > nowLocal && g.startsAt <= soon) ?? toFinish[0]
			?? games.find(isToday) ?? games.find((g) => g.startsAt > nowLocal) ?? games[0] ?? null;
		// A sign-in that runs out during the game would stop the recording saving from then on, so it's renewed first:
		// this device's session is ended and the sign-in page asks for a new code, then comes back here. The new session
		// lasts 30 days, so once is enough.
		const signIn = await sessionTimes(db, req, deps.now());
		if (signIn !== null && signIn.endsAt - deps.now().getTime() < SIGN_IN_RENEW_MS) {
			await endRequestSession(db, req, deps.now());
			const res = redirect(signInPath(url), 303);
			res.headers.append("Set-Cookie", clearedSessionCookie());
			return res;
		}
		const none = { input: null, unavailable: false, lastTry: null, recordingVideoId: null, mine: false, ended: false, app: null, recorded };
		if (!selected) return htmlResponse(livePage({ frame, games, selected: null, ...none }));
		// The last try at this game wasn't saved (a quick test, say): tell them, then reopen it at the same address.
		const last = await getLatestLiveForGame(db, deps.team.id, selected.id);
		const lastTry = last?.status === "cancelled" ? last.cancelReason : null;
		const before = await getOpenLiveForGame(db, deps.team.id, selected.id);
		const recording = before?.recordingVideoId ? await getVideo(db, deps.team.id, before.recordingVideoId) : null;
		const recordingVideoId = recording?.status === "uploading" ? recording.id : null;
		// Ended, or its recording on its way: the page is only for saving it, which doesn't need Stream. Otherwise the
		// input is made now so Go live is quick, and if Stream isn't answering the page says so (never an error page).
		let unavailable = false;
		// (A game set to an external app shows that app's card in the camera's place: appLiveView.)
		const app = before?.source === "app" && !before.endRequestedAt ? await appLiveView(deps, before) : null;
		const input = before?.endRequestedAt || recordingVideoId !== null || app ? null : await openLive(deps, member, selected).catch((err: unknown) => {
			if (err instanceof HttpError) throw err;
			console.error(JSON.stringify({ event: "live_open_failed", teamId: deps.team.id, gameId: selected.id, error: String(err) }));
			unavailable = true;
			return logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, who: member.email, what: `Go live couldn't set up a stream for ${gameName(selected)}`, error: err }).then(() => null);
		});
		const open = before ?? await getOpenLiveForGame(db, deps.team.id, selected.id);
		// The filmer's own recording, not made on this phone (or its start didn't finish): the page offers to save it.
		const mine = recordingVideoId !== null && recording?.uploadedBy === member.id;
		return htmlResponse(livePage({ frame, games, selected, input, unavailable, lastTry, recordingVideoId, mine, ended: open?.endRequestedAt != null, app, recorded }));
	});

	router.post("/api/live/:gameId/browser", "filmer", async ({ req, params, member, deps }) => {
		const { mimeType, attempt } = await parseJson(req, startBrowserSchema);
		return jsonOk(await startBrowserLive(deps, member, idParam(params.gameId, "Game"), mimeType, attempt), 201);
	});

	// Save what was recorded, for a recording whose phone stopped part way: from R2's own list of what reached it, or
	// "wait and ask again" while the last of it is still arriving (SaveAnswer).
	router.post("/api/live/:gameId/save", "filmer", async ({ params, member, deps }) => jsonOk(await saveRecording(deps, member, idParam(params.gameId, "Game"))));

	// Carry on streaming after the page closed (the same phone): a new segment of the same recording, or wait.
	router.post("/api/live/:gameId/continue", "filmer", async ({ req, params, member, deps }) => {
		const answer = await continueBrowserLive(deps, member, idParam(params.gameId, "Game"), await parseJson(req, continueSchema));
		return jsonOk(answer, "segment" in answer ? 201 : 200);
	});

	// End game on the page: no more streaming to this game, even after a reload (the recording is still saving).
	// Under a minute (since Go live, or recorded) it was a test: thrown away, and the game is free again.
	router.post("/api/live/:gameId/end", "filmer", async ({ req, params, member, deps }) =>
		jsonOk(await stopBrowserLive(deps, member, idParam(params.gameId, "Game"), await parseJson(req, stopSchema))));

	// The Go live page's notes, into the Worker logs: explains afterwards what a phone did during a stream. Those the phone
	// marks as problems (the camera or sound lost, the connection dropped, Go live refused) are in the admin Log too.
	router.post("/api/live/:gameId/events", "filmer", async ({ req, params, member, deps }) => {
		const { events } = await parseJson(req, liveEventsSchema);
		const gameId = idParam(params.gameId, "Game");
		console.log(JSON.stringify({ event: "golive_events", teamId: member.teamId, gameId, memberId: member.id, events }));
		const problems = events.filter((e) => e.p);
		const game = problems.length ? await getGame(deps.db, deps.team.id, gameId) : null;
		for (const e of problems) {
			await logProblem(deps, { kind: "golive_problem", teamId: deps.team.id, who: member.email, what: `Go live on ${game ? gameName(game) : "a deleted game"}: ${e.what}` });
		}
		return jsonOk({ logged: events.length });
	});
}
