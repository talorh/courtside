// A page's failure the site can't see for itself, reported by its script (public/problems.js): an upload or photos
// that stopped on the phone (its connection dropped, say). A problem in the admin Log, with who and which device.
import type { Router } from "../../app/router.ts";
import { jsonOk } from "../../app/respond.ts";
import { parseJson } from "../../shared/validation.ts";
import { z } from "zod";
import { gameName } from "../games/game-log.ts";
import { getGame } from "../games/games-repository.ts";
import { logProblem } from "./problem-log.ts";

const reportSchema = z.object({
	what: z.enum(["upload", "photos"]), gameId: z.number().int().positive().optional(), message: z.string().min(1).max(200), status: z.number().int().optional(),
});

export function registerProblemRoutes(router: Router): void {
	router.post("/api/problems", "watcher", async ({ req, member, deps }) => {
		const r = await parseJson(req, reportSchema);
		const game = r.gameId ? await getGame(deps.db, deps.team.id, r.gameId) : null;
		const what = r.what === "upload" ? `An upload${game ? ` of ${gameName(game)}` : ""} stopped on the phone` : "Adding photos stopped on the phone";
		await logProblem(deps, {
			kind: r.what === "upload" ? "upload_problem" : "photo_problem", teamId: deps.team.id, who: member.email, what, detail: `${r.message}${r.status ? ` (${r.status})` : ""}`,
		});
		return jsonOk({ logged: true });
	});
}
