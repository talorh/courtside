import type { TeamDeps } from "../../app/deps.ts";
import { softDeleteGame } from "../games/games-repository.ts";
import { requireGame } from "../games/games-service.ts";
import { deleteVideo } from "./video-removal-service.ts";
import { listVideosForGame } from "./videos-repository.ts";

/**
 * Team managers only: deletes a game together with all its footage (Stream copies, originals, unfinished uploads, clips).
 * Like any video a person deletes, the footage is kept a day in case it was a mistake, then the cron removes it.
 */
export async function deleteGameWithFootage(deps: TeamDeps, gameId: number): Promise<void> {
	const { db } = deps;
	await requireGame(db, deps.team.id, gameId);
	for (const video of await listVideosForGame(db, deps.team.id, gameId)) await deleteVideo(deps, video, "admin");
	await softDeleteGame(db, deps.team.id, gameId, deps.now().toISOString());
}
