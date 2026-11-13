import { htmlResponse } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { addDays } from "../../shared/time.ts";
import { type Game, listGamesWithVideoStatus } from "../games/games-repository.ts";
import { listOpenClipRequests } from "../clips/clip-removals-repository.ts";
import { listOpenPhotoRequests } from "../photos/photo-removals-repository.ts";
import { listOpenRequests } from "../removals/removals-repository.ts";
import { listOpenLive, wasStreamed } from "../live/live-repository.ts";
import { listVideosAwaitingHd, listVideosByStatus } from "../videos/videos-repository.ts";
import { listActivity } from "./activity-repository.ts";
import { type InProgress, notificationsPage } from "./views/notifications-page.ts";

const FEED_DAYS = 30;

export function registerNotificationRoutes(router: Router): void {
	// Team managers only.
	router.get("/notifications", "manager", async ({ frame, deps }) => {
		const { db } = deps;
		const [games, live, uploading, processing, awaitingHd, activity, removals, clipRemovals, photoRemovals] = await Promise.all([
			listGamesWithVideoStatus(db, deps.team.id),
			listOpenLive(db, deps.team.id),
			listVideosByStatus(db, deps.team.id, "uploading"),
			listVideosByStatus(db, deps.team.id, "processing"),
			listVideosAwaitingHd(db, deps.team.id),
			listActivity(db, deps.team.id, addDays(deps.now(), -FEED_DAYS).toISOString()),
			listOpenRequests(db, deps.team.id),
			listOpenClipRequests(db, deps.team.id),
			listOpenPhotoRequests(db, deps.team.id),
		]);
		const byId = new Map<number, Game>(games.map((r) => [r.game.id, r.game]));
		const inProgress: InProgress[] = [
			...live.filter(wasStreamed).map((l) => ({ game: byId.get(l.gameId) ?? null, stage: "live" as const, since: l.createdAt })),
			// A live stream's recording is listed as the live stream, not as an upload as well.
			...uploading.filter((v) => !live.some((l) => l.recordingVideoId === v.id)).map((v) => ({ game: byId.get(v.gameId) ?? null, stage: "uploading" as const, since: v.createdAt })),
			...processing.map((v) => ({ game: byId.get(v.gameId) ?? null, stage: "processing" as const, since: v.processingAt ?? v.createdAt })),
			...awaitingHd.map((v) => ({ game: byId.get(v.gameId) ?? null, stage: "hd" as const, since: v.createdAt })),
		];
		return htmlResponse(notificationsPage({ frame, inProgress, activity, games: byId, openRemovals: removals.length + clipRemovals.length + photoRemovals.length }));
	});
}
