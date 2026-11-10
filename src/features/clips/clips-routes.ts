import { z } from "zod";
import { HttpError, conflict, forbidden } from "../../app/errors.ts";
import { jsonOk, redirect } from "../../app/respond.ts";
import type { RequestCtx, Router } from "../../app/router.ts";
import { hdDownloadUrl } from "../../platform/stream-tokens.ts";
import { idParam, parseForm } from "../../shared/validation.ts";
import { downloadBaseName, slug } from "../games/game-format.ts";
import { requireGame } from "../games/games-service.ts";
import { logMediaDownloads } from "../videos/downloads-repository.ts";
import { requireVideo } from "../videos/watch-service.ts";
import { deleteClipForRequest, keepClip, requestClipRemoval } from "./clip-removals-service.ts";
import { canDeleteClip, canEditClip, clipFormSchema, clipPlayersSchema, createClip, deleteClip, requireClip, saveClipPlayers } from "./clips-service.ts";
import type { Team } from "../teams/team.ts";
import { teamCopy } from "../teams/team-copy.ts";

const LINK_TTL_SECONDS = 3600;
const reasonSchema = z.object({ reason: z.string().trim().max(500).default("") });
const noteSchema = z.object({ note: z.string().trim().max(500).default("") });
const PREPARING = "The clip's MP4 is still being made. It's usually ready a few minutes after the clip. Please try again shortly.";
const cant = (team: Team) => `Stream couldn't prepare this clip. Please tell ${teamCopy(team).ask}.`;

/** A ready clip's MP4 on a signed link, and its file name; logged as a download (a link, or an iPhone's Save). */
async function clipLink({ params, member, deps }: RequestCtx): Promise<{ url: string; name: string }> {
	const { db, config, stream, tokens } = deps;
	const clip = await requireClip(db, deps.team.id, idParam(params.id, "Clip"));
	if (clip.status !== "ready" || !clip.streamUid) throw conflict("This clip isn't ready yet.");
	const state = await stream.downloadStatus(clip.streamUid);
	if (state === "none") {
		// Stream refusing to make one (it no longer has the clip, say) is the same as Stream's own error.
		await stream.generateDownload(clip.streamUid).catch((err: unknown) => { throw new HttpError(502, "download_failed", cant(deps.team), { cause: err }); });
		throw conflict(PREPARING);
	}
	if (state === "error") throw new HttpError(502, "download_failed", cant(deps.team));
	if (state !== "ready") throw conflict(PREPARING);
	const video = await requireVideo(db, deps.team.id, clip.videoId);
	const name = `${downloadBaseName(deps.team, await requireGame(db, deps.team.id, video.gameId))}-clip-${slug(clip.label) || clip.id}.mp4`;
	const token = await tokens.sign(clip.streamUid, { downloadable: true, ttlSeconds: LINK_TTL_SECONDS });
	await logMediaDownloads(db, { teamId: deps.team.id, memberId: member.id, nowIso: deps.now().toISOString(), items: [{ kind: "clip", itemId: clip.id, name }] });
	return { url: hdDownloadUrl(config.streamCustomerCode, token, name), name };
}

export function registerClipRoutes(router: Router): void {
	// Any member can make a clip.
	router.post("/videos/:id/clips", "watcher", async ({ req, params, member, deps }) => {
		const form = await parseForm(req, clipFormSchema, ["players"]);
		const video = await requireVideo(deps.db, deps.team.id, idParam(params.id, "Video"));
		await createClip(deps, member, video, form);
		return redirect(`/games/${video.gameId}?done=clip`);
	});

	router.post("/clips/:id/delete", "watcher", async ({ params, member, deps }) => {
		const clip = await requireClip(deps.db, deps.team.id, idParam(params.id, "Clip"));
		if (!canDeleteClip(member)) throw forbidden("Only a team manager can delete a clip. You can ask for it to be removed.");
		const video = await requireVideo(deps.db, deps.team.id, clip.videoId);
		await deleteClip(deps, clip, member.id);
		return redirect(`/games/${video.gameId}?done=clipdeleted`);
	}, { confirm: true });

	router.post("/clips/:id/players", "watcher", async ({ req, params, member, deps }) => {
		const clip = await requireClip(deps.db, deps.team.id, idParam(params.id, "Clip"));
		if (!canEditClip(member, clip)) throw forbidden("Only the person who made this clip, or a team manager, can change who's in it.");
		const { players } = await parseForm(req, clipPlayersSchema, ["players"]);
		const video = await requireVideo(deps.db, deps.team.id, clip.videoId);
		await saveClipPlayers(deps, clip.id, players);
		return redirect(`/games/${video.gameId}?done=clipplayers`);
	});

	router.post("/clips/:id/removal-requests", "watcher", async ({ req, params, member, deps }) => {
		const { reason } = await parseForm(req, reasonSchema);
		const gameId = await requestClipRemoval(deps, member, idParam(params.id, "Clip"), reason);
		return redirect(`/games/${gameId}?done=clipremoval`);
	}, { closedTeams: true });

	router.post("/clip-removal-requests/:id/delete-clip", "manager", async ({ params, member, deps }) => {
		await deleteClipForRequest(deps, member, idParam(params.id, "Clip removal request"));
		return redirect("/manage?done=clipdeleted");
	}, { confirm: true });

	router.post("/clip-removal-requests/:id/keep", "manager", async ({ req, params, member, deps }) => {
		const { note } = await parseForm(req, noteSchema);
		await keepClip(deps, member, idParam(params.id, "Clip removal request"), note);
		return redirect("/manage?done=clipkept");
	}, { closedTeams: true });

	// GETs that write (they're links): each asks Stream to make the clip's MP4 if it has none yet.
	router.get("/clips/:id/download", "watcher", async (ctx) => redirect((await clipLink(ctx)).url, 302));
	// The same link as JSON, for an iPhone or iPad's Save (public/video-save.js).
	router.get("/api/clips/:id/download", "watcher", async (ctx) => jsonOk(await clipLink(ctx)));
}
