import type { TeamDeps } from "../../app/deps.ts";
import { conflict, notFound } from "../../app/errors.ts";
import { type Game, listGamesWithVideoStatus } from "../games/games-repository.ts";
import { isFree, requireGame } from "../games/games-service.ts";
import { deleteVideo } from "./video-removal-service.ts";
import { moveVideo } from "./video-writes-repository.ts";
import { getActiveVideoForGame, getVideo, type Video } from "./videos-repository.ts";

export async function requireVideo(db: D1Database, teamId: string, id: number): Promise<Video> {
	const video = await getVideo(db, teamId, id);
	if (!video) throw notFound("Video");
	return video;
}

export async function loadWatch(db: D1Database, teamId: string, gameId: number): Promise<{ game: Game; video: Video | null }> {
	const game = await requireGame(db, teamId, gameId);
	return { game, video: await getActiveVideoForGame(db, teamId, gameId) };
}

/** Where a video can be moved: another of its team's games, not marked No video, without a video (or only a failed one).
 * Its deletion date is its team's, wherever it goes. */
export async function moveTargets(db: D1Database, teamId: string, from: Game): Promise<Game[]> {
	return (await listGamesWithVideoStatus(db, teamId))
		.filter((r) => r.game.id !== from.id && !r.game.noVideo && isFree(r)).map((r) => r.game);
}

/** Fixes a video uploaded to the wrong game. The target must not already have a video (one per game); one that failed
 * is cleared out of the way, as an upload does, so the game shows the moved one. */
export async function moveToGame(deps: TeamDeps, videoId: number, targetGameId: number): Promise<void> {
	const { db } = deps, teamId = deps.team.id;
	const video = await requireVideo(db, teamId, videoId);
	// Only a finished video moves: one still uploading (a live recording, say) or processing stays put until it's ready.
	if (video.status !== "ready") throw conflict("The video can be moved once it's ready to watch.");
	const target = await requireGame(db, teamId, targetGameId);
	if (target.noVideo) throw conflict("That game is set to No video. Change that on the Fixture first.");
	const existing = await getActiveVideoForGame(db, teamId, targetGameId);
	if (existing && existing.status !== "failed") throw conflict("That game already has a video. Delete it first.");
	if (existing) await deleteVideo(deps, existing, "replaced");
	await moveVideo(db, teamId, video.id, targetGameId);
}
