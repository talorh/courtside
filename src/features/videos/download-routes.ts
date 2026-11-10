import { conflict, HttpError, notFound } from "../../app/errors.ts";
import { jsonOk, redirect } from "../../app/respond.ts";
import type { RequestCtx, Router } from "../../app/router.ts";
import { hdDownloadUrl } from "../../platform/stream-tokens.ts";
import { idParam } from "../../shared/validation.ts";
import { downloadBaseName } from "../games/game-format.ts";
import { requireGame } from "../games/games-service.ts";
import { logDownload, type DownloadKind } from "./downloads-repository.ts";
import type { Video } from "./videos-repository.ts";
import { requireVideo } from "./watch-service.ts";
import type { Team } from "../teams/team.ts";
import { teamCopy } from "../teams/team-copy.ts";

const LINK_TTL_SECONDS = 3600;
const PREPARING = "The HD video is still being made. It's ready about 10 to 15 minutes after the game is ready to watch. Please try again a bit later.";
const cant = (team: Team) => `Stream couldn't prepare the HD copy. Please tell ${teamCopy(team).ask}.`;

async function readyVideo(ctx: RequestCtx): Promise<Video> {
	const video = await requireVideo(ctx.deps.db, ctx.deps.team.id, idParam(ctx.params.id, "Video"));
	if (video.status !== "ready") throw conflict("This video isn't ready yet.");
	return video;
}

async function record(ctx: RequestCtx, video: Video, kind: DownloadKind): Promise<string> {
	const { db } = ctx.deps;
	await logDownload(db, { teamId: ctx.deps.team.id, videoId: video.id, memberId: ctx.member.id, kind, nowIso: ctx.deps.now().toISOString() });
	return downloadBaseName(ctx.deps.team, await requireGame(db, ctx.deps.team.id, video.gameId));
}

/** The game's HD MP4 on Stream, on a link signed for an hour, and its file name; logged as a download. Asks Stream to
 * make the MP4 if it has none yet. */
async function hdLink(ctx: RequestCtx): Promise<{ url: string; name: string }> {
	const video = await readyVideo(ctx);
	const uid = video.streamUid;
	if (!uid) throw notFound("HD copy");
	const state = await ctx.deps.stream.downloadStatus(uid);
	if (state === "none") {
		// Stream refusing to make one (it no longer has the video, say) is the same as Stream's own error.
		await ctx.deps.stream.generateDownload(uid).catch((err: unknown) => { throw new HttpError(502, "download_failed", cant(ctx.deps.team), { cause: err }); });
		throw conflict(PREPARING);
	}
	if (state === "error") throw new HttpError(502, "download_failed", cant(ctx.deps.team));
	if (state !== "ready") throw conflict(PREPARING);
	const name = `${await record(ctx, video, "hd")}.mp4`;
	const token = await ctx.deps.tokens.sign(uid, { downloadable: true, ttlSeconds: LINK_TTL_SECONDS });
	return { url: hdDownloadUrl(ctx.deps.config.streamCustomerCode, token, name), name };
}

export function registerDownloadRoutes(router: Router): void {
	// GETs that write (they're links): each asks Stream to make the HD MP4 if it has none yet, and logs the download.
	router.get("/videos/:id/download/hd", "watcher", async (ctx) => redirect((await hdLink(ctx)).url, 302));
	// The same link as JSON, for an iPhone or iPad's Save (public/video-save.js).
	router.get("/api/videos/:id/download/hd", "watcher", async (ctx) => jsonOk(await hdLink(ctx)));
}
