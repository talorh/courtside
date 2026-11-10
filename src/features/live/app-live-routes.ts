import { jsonOk, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { idParam, requireConfirm } from "../../shared/validation.ts";
import { logTeamChange } from "../admin/team-log.ts";
import { gameName } from "../games/game-log.ts";
import { appStatus, stopApp, useApp, useCamera } from "./app-live-service.ts";

/** A game streamed from an external app over RTMPS: Go live's Use an external app instead, and the app card's writes.
 * Same people as Go live. Each change is in the admin Log, with who made it. */
export function registerAppLiveRoutes(router: Router): void {
	router.post("/live/:gameId/app", "filmer", async ({ params, member, viewer, deps }) => {
		const gameId = idParam(params.gameId, "Game");
		const game = await useApp(deps, member, gameId);
		if (game) await logTeamChange(deps, viewer.email, "live_app_chosen", gameName(game));
		return redirect(`/live?game=${gameId}`, 303);
	});

	router.post("/live/:gameId/camera", "filmer", async ({ params, member, viewer, deps }) => {
		const gameId = idParam(params.gameId, "Game");
		const game = await useCamera(deps, member, gameId);
		if (game) await logTeamChange(deps, viewer.email, "live_app_camera", gameName(game));
		return redirect(`/live?game=${gameId}`, 303);
	});

	// Final, as End game is, so it asks first (ui/confirm.ts). Not one of the router's own confirms: those are the
	// deletes, which a closed season still allows, and this is a stream's stop, which it doesn't.
	router.post("/live/:gameId/app-stop", "filmer", async ({ req, params, member, viewer, deps }) => {
		await requireConfirm(req);
		const gameId = idParam(params.gameId, "Game");
		await logTeamChange(deps, viewer.email, "live_app_stopped", gameName(await stopApp(deps, member, gameId)));
		return redirect(`/games/${gameId}`, 303);
	});

	// The app card asks every few seconds: is the app's stream arriving? (It notes the game live the first time.)
	router.post("/api/live/:gameId/app-status", "filmer", async ({ params, deps }) =>
		jsonOk(await appStatus(deps, idParam(params.gameId, "Game"))));
}
