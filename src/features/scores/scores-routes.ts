import { z } from "zod";
import { redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { backPath } from "../../shared/back-path.ts";
import { idParam, parseForm } from "../../shared/validation.ts";
import { requireGame } from "../games/games-service.ts";
import { setHideScores } from "../members/members-repository.ts";
import { clearScore } from "./scores-repository.ts";
import { enterScore, scoreFormSchema } from "./scores-service.ts";

// Hide scores or Show scores goes back to the page it was tapped on (backPath).
const switchSchema = z.object({ hide: z.enum(["0", "1"]), back: backPath });

/** The final score, on the game page: entered, fixed or cleared by a team manager. And each member's spoiler switch. */
export function registerScoreRoutes(router: Router): void {
	router.post("/me/scores", "watcher", async ({ req, member, deps }) => {
		const { hide, back } = await parseForm(req, switchSchema);
		await setHideScores(deps.db, deps.team.id, member.id, hide === "1");
		return redirect(back);
	}, { closedTeams: true });

	router.post("/games/:id/score", "manager", async ({ req, params, member, deps }) => {
		const gameId = idParam(params.id, "Game");
		await enterScore(deps, member, gameId, await parseForm(req, scoreFormSchema));
		return redirect(`/games/${gameId}?done=score`);
	});

	router.post("/games/:id/score/clear", "manager", async ({ params, deps }) => {
		const gameId = idParam(params.id, "Game");
		await requireGame(deps.db, deps.team.id, gameId);
		await clearScore(deps.db, deps.team.id, gameId);
		return redirect(`/games/${gameId}?done=scorecleared`);
	});
}
