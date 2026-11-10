import { z } from "zod";
import { redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { idParam, parseForm } from "../../shared/validation.ts";
import { deleteVideoForRequest, keepVideo, requestRemoval } from "./removals-service.ts";

const requestSchema = z.object({ reason: z.string().trim().max(500).default("") });
const keepSchema = z.object({ note: z.string().trim().max(500).default("") });

export function registerRemovalRoutes(router: Router): void {
	router.post("/videos/:id/removal-requests", "watcher", async ({ req, params, member, deps }) => {
		const { reason } = await parseForm(req, requestSchema);
		const video = await requestRemoval(deps, member, idParam(params.id, "Video"), reason);
		return redirect(`/games/${video.gameId}?done=removal`);
	}, { closedTeams: true });

	router.post("/removal-requests/:id/delete-video", "manager", async ({ params, member, deps }) => {
		await deleteVideoForRequest(deps, member, idParam(params.id, "Removal request"));
		return redirect("/manage?done=deleted");
	}, { confirm: true });

	router.post("/removal-requests/:id/keep", "manager", async ({ req, params, member, deps }) => {
		const { note } = await parseForm(req, keepSchema);
		await keepVideo(deps, member, idParam(params.id, "Removal request"), note);
		return redirect("/manage?done=kept");
	}, { closedTeams: true });
}
