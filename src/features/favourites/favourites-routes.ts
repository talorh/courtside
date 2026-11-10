import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import { notFound } from "../../app/errors.ts";
import { redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { backPath } from "../../shared/back-path.ts";
import { idParam, parseForm } from "../../shared/validation.ts";
import { getClip } from "../clips/clips-repository.ts";
import { requireGame } from "../games/games-service.ts";
import type { Member } from "../members/members-repository.ts";
import { type Starred, star, unstar } from "./favourites-repository.ts";

const starSchema = z.object({ on: z.enum(["0", "1"]), back: backPath });

/** Star or unstar it for this member, then back to the page the star was tapped on. */
async function toggle(req: Request, deps: TeamDeps, member: Member, item: Starred): Promise<Response> {
	const { on, back } = await parseForm(req, starSchema);
	if (on === "1") await star(deps.db, deps.team.id, member.id, item, deps.now().toISOString());
	else await unstar(deps.db, deps.team.id, member.id, item);
	return redirect(back);
}

/** Favourites: any member stars a game or a highlight clip; they're listed at the top of Watch games. */
export function registerFavouriteRoutes(router: Router): void {
	router.post("/games/:id/favourite", "watcher", async ({ req, params, member, deps }) => {
		const gameId = idParam(params.id, "Game");
		await requireGame(deps.db, deps.team.id, gameId);
		return toggle(req, deps, member, { gameId });
	}, { closedTeams: true });

	router.post("/clips/:id/favourite", "watcher", async ({ req, params, member, deps }) => {
		const clipId = idParam(params.id, "Clip");
		if (!(await getClip(deps.db, deps.team.id, clipId))) throw notFound("Clip");
		return toggle(req, deps, member, { clipId });
	}, { closedTeams: true });
}
