// A page's failure the site can't see for itself, reported by its script (public/problems.js): an upload or photos
// that stopped on the phone (its connection dropped, say). A problem in the admin Log, with who and which device, and a
// phone_problem line in the Worker's logs beside the request's own.
import type { Router } from "../../app/router.ts";
import { jsonOk } from "../../app/respond.ts";
import { parseJson } from "../../shared/validation.ts";
import { z } from "zod";
import { gameName } from "../games/game-log.ts";
import { getGame } from "../games/games-repository.ts";
import { logProblem } from "./problem-log.ts";

const reportSchema = z.object({
	what: z.enum(["upload", "photos"]), gameId: z.number().int().positive().optional(), message: z.string().min(1).max(200), status: z.number().int().optional(),
	progress: z.object({ pct: z.number().int().min(0).max(100), mb: z.number().int().min(0), minutes: z.number().int().min(0) }).optional(),
});

export function registerProblemRoutes(router: Router): void {
	router.post("/api/problems", "watcher", async ({ req, member, deps }) => {
		const r = await parseJson(req, reportSchema);
		// Its words stay in the admin Log alone: a refusal can name the team's manager, a photo's file name a child.
		console.warn(JSON.stringify({ event: "phone_problem", teamId: deps.team.id, gameId: r.gameId, memberId: member.id, device: deps.device, what: r.what, status: r.status, progress: r.progress }));
		const game = r.gameId ? await getGame(deps.db, deps.team.id, r.gameId) : null;
		const what = r.what === "upload" ? `An upload${game ? ` of ${gameName(game)}` : ""} stopped on the phone` : "Adding photos stopped on the phone";
		await logProblem(deps, {
			kind: r.what === "upload" ? "upload_problem" : "photo_problem", teamId: deps.team.id, who: member.email, what, detail: `${r.message}${r.status ? ` (${r.status})` : ""}`,
		});
		return jsonOk({ logged: true });
	});
}
