import { z } from "zod";
import { redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { idParam, parseForm } from "../../shared/validation.ts";
import { addPlayer, removePlayer, updatePlayer } from "./players-service.ts";
import { logTeamChange } from "../admin/team-log.ts";

const playerSchema = z.object({ number: z.string().max(10), name: z.string().max(200) });

/** The Players section of Manage team: the team manager keeps the squad. */
export function registerPlayerRoutes(router: Router): void {
	router.post("/players", "manager", async ({ req, viewer, deps }) => {
		const form = await parseForm(req, playerSchema);
		await addPlayer(deps, form);
		await logTeamChange(deps, viewer.email, "player_added", `${form.name.trim()} #${Number(form.number)}`);
		return redirect("/manage?done=player-added#players");
	});

	router.post("/players/:id", "manager", async ({ req, params, viewer, deps }) => {
		const { before, after } = await updatePlayer(deps, idParam(params.id, "Player"), await parseForm(req, playerSchema));
		if (before.name !== after.name || before.number !== after.number) {
			await logTeamChange(deps, viewer.email, "player_changed", `${before.name} #${before.number} to ${after.name} #${after.number}`);
		}
		return redirect("/manage?done=player-saved#players");
	});

	router.post("/players/:id/remove", "manager", async ({ params, viewer, deps }) => {
		const player = await removePlayer(deps, idParam(params.id, "Player"));
		await logTeamChange(deps, viewer.email, "player_removed", `${player.name} #${player.number}`);
		return redirect("/manage?done=player-removed#players");
	}, { confirm: true });
}
