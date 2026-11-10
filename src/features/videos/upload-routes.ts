import { htmlResponse, jsonOk } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { localTime } from "../../shared/time.ts";
import { idParam, parseJson } from "../../shared/validation.ts";
import { isFree, pickerGames } from "../games/games-service.ts";
import { listOpenLive, wasStreamed } from "../live/live-repository.ts";
import { completeSchema, completeUpload, partUrls, partUrlsSchema, startUpload, startUploadSchema } from "./upload-service.ts";
import { abortUpload } from "./upload-abort-service.ts";
import { canUploadTo, uploadPage } from "./views/upload-page.ts";
import { seasonOverPage } from "../../ui/closed-banner.ts";

export function registerUploadRoutes(router: Router): void {
	router.get("/upload", "filmer", async ({ frame, deps }) => {
		if (deps.team.status !== "active") return htmlResponse(seasonOverPage(frame, "Upload", "upload"));
		const streamed = new Set((await listOpenLive(deps.db, deps.team.id)).filter(wasStreamed).map((l) => l.gameId));
		// Only games still needing their video (or with an upload to carry on): played ones newest first, then the ones to
		// come, soonest first. The top free one is picked: the latest game played, or else the next one.
		const nowLocal = localTime(deps.now());
		const games = (await pickerGames(deps.db, deps.team, deps.now())).filter((r) => !streamed.has(r.game.id) && canUploadTo(r));
		const ordered = [...games.filter((r) => r.game.startsAt <= nowLocal), ...games.filter((r) => r.game.startsAt > nowLocal).reverse()];
		return htmlResponse(uploadPage({ frame, games: ordered, selectedId: ordered.find(isFree)?.game.id ?? null }));
	});

	router.post("/api/uploads", "filmer", async ({ req, member, deps }) =>
		jsonOk(await startUpload(deps, member, await parseJson(req, startUploadSchema)), 201));

	router.post("/api/uploads/:id/part-urls", "filmer", async ({ req, params, member, deps }) => {
		const { partNumbers, segment } = await parseJson(req, partUrlsSchema);
		return jsonOk({ urls: await partUrls(deps, member, idParam(params.id, "Upload"), partNumbers, segment) });
	});

	router.post("/api/uploads/:id/complete", "filmer", async ({ req, params, member, deps }) => {
		const { parts, segment } = await parseJson(req, completeSchema);
		return jsonOk({ status: await completeUpload(deps, member, idParam(params.id, "Upload"), parts, segment) });
	});

	router.post("/api/uploads/:id/abort", "filmer", async ({ params, member, deps }) => {
		await abortUpload(deps, member, idParam(params.id, "Upload"));
		return jsonOk({ status: "cancelled" });
	}, { closedTeams: true });
}
