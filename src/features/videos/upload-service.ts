import { z } from "zod";
import { getOpenLiveForGame, wasStreamed } from "../live/live-repository.ts";
import { listSegments } from "../live/recording-segments-repository.ts";
import { finishSegments } from "../live/recording-segments-service.ts";
import type { TeamDeps } from "../../app/deps.ts";
import { badRequest, conflict, forbidden, notFound } from "../../app/errors.ts";
import { addDays } from "../../shared/time.ts";
import { requireGame } from "../games/games-service.ts";
import type { Member } from "../members/members-repository.ts";
import { deleteVideo } from "./video-removal-service.ts";
import { finishUpload } from "./upload-finish.ts";
import { insertUploadVideo } from "./video-writes-repository.ts";
import { getActiveVideoForGame, type Video } from "./videos-repository.ts";
import { record } from "../activity/activity-service.ts";
import { requireVideo } from "./watch-service.ts";
import { footageDue } from "../teams/team-code.ts";
import { teamCopy } from "../teams/team-copy.ts";

// 16 MB parts: small enough that a dropped mobile connection only repeats a little, big enough for 30 GB in 1,920 parts.
export const PART_SIZE = 16 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 30 * 1024 ** 3;

export const startUploadSchema = z.object({
	gameId: z.number().int().positive(),
	fileName: z.string().trim().min(1).max(200),
	fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Videos over 30 GB can't be uploaded"),
	contentType: z.string().regex(/^video\//, "Choose a video file"),
});
// `segment`: which of a carried-on recording's uploads (live/recording-segments-service.ts); 1, the video's own, is
// what every other page sends.
const segment = z.number().int().min(1).max(99).default(1);
export const partUrlsSchema = z.object({ partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(24), segment });
export const completeSchema = z.object({
	parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) })).min(1).max(10_000), segment,
});

const safeFileName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-100) || "video";
const STALE_UPLOAD_HOURS = 24;

/**
 * One video per game. A failed video, your own unfinished upload, or anyone's upload untouched for a day is cleared
 * out of the way. (Resuming on the same device never gets here: the page carries on with its saved upload.)
 */
async function clearSlot(deps: TeamDeps, member: Member, gameId: number): Promise<void> {
	const existing = await getActiveVideoForGame(deps.db, deps.team.id, gameId);
	if (!existing) return;
	if (existing.status === "failed") return deleteVideo(deps, existing, "replaced");
	const staleBefore = addDays(deps.now(), -STALE_UPLOAD_HOURS / 24).toISOString();
	if (existing.status === "uploading" && (existing.uploadedBy === member.id || existing.createdAt < staleBefore)) {
		return deleteVideo(deps, existing, "replaced");
	}
	throw conflict(existing.status === "uploading"
		? "This game's video is already being uploaded."
		: `This game already has its video. Ask ${teamCopy(deps.team).ask} if it needs replacing.`);
}

export async function startUpload(deps: TeamDeps, member: Member, input: z.infer<typeof startUploadSchema>) {
	const { db } = deps;
	const game = await requireGame(db, deps.team.id, input.gameId);
	if (game.noVideo) throw conflict(`This game is set to No video. Ask ${teamCopy(deps.team).ask} to change that on the Fixture first.`);
	const deleteAfter = footageDue(deps.team);
	if (deleteAfter <= deps.now().toISOString()) throw conflict("That game's season is over and its videos have been deleted, so it can't be uploaded.");
	const live = await getOpenLiveForGame(db, deps.team.id, input.gameId);
	if (live && wasStreamed(live)) throw conflict("This game was live streamed, so its video is being saved from the stream.");
	await clearSlot(deps, member, input.gameId);
	const r2Key = `originals/${deps.team.id}/${crypto.randomUUID()}/${safeFileName(input.fileName)}`;
	const r2UploadId = await deps.originals.createMultipart(r2Key, input.contentType);
	const videoId = await insertUploadVideo(db, {
		teamId: deps.team.id, gameId: input.gameId, r2Key, r2UploadId, originalName: input.fileName,
		originalBytes: input.fileSize, uploadedBy: member.id, deleteAfter, createdAt: deps.now().toISOString(),
	}).catch(async (err: unknown) => {
		// Not saved, so close the R2 upload. Someone else's upload starting at the same moment (one video per game) is the
		// usual reason: say so, as clearSlot would have.
		await deps.originals.abort(r2Key, r2UploadId);
		if (await getActiveVideoForGame(db, deps.team.id, input.gameId)) throw conflict("This game's video is already being uploaded.");
		throw err;
	});
	await record(deps, { kind: "upload_started", gameId: input.gameId, memberId: member.id });
	return { videoId, partSize: PART_SIZE, totalParts: Math.ceil(input.fileSize / PART_SIZE) };
}

type ActiveUpload = Video & { r2Key: string; r2UploadId: string };

export async function requireActiveUpload(deps: TeamDeps, member: Member, videoId: number): Promise<ActiveUpload> {
	const video = await requireVideo(deps.db, deps.team.id, videoId);
	if (video.uploadedBy !== member.id && member.role !== "manager") throw forbidden("This upload belongs to someone else.");
	if (video.status !== "uploading" || !video.r2Key || !video.r2UploadId) throw conflict("This upload has already finished.");
	return video as ActiveUpload;
}

/** A file upload has the parts its declared size needs, no more (a live recording's size isn't known, so it's open). */
function checkParts(upload: Video, partNumbers: number[]): void {
	const bytes = upload.originalBytes ?? 0;
	const most = bytes > 0 ? Math.ceil(bytes / PART_SIZE) : Infinity;
	if (partNumbers.some((n) => n > most)) throw badRequest("That's more of the video than was started. Start the upload again.");
}

/** Which R2 upload a part goes to: the video's own (segment 1) or a later segment's (a recording carried on). */
async function uploadFor(deps: TeamDeps, upload: ActiveUpload, segment: number): Promise<{ r2Key: string; r2UploadId: string }> {
	if (segment === 1) return upload;
	const found = (await listSegments(deps.db, deps.team.id, upload.id)).find((s) => s.n === segment);
	if (!found?.r2UploadId) throw notFound("Segment");
	return { r2Key: found.r2Key, r2UploadId: found.r2UploadId };
}

export async function partUrls(deps: TeamDeps, member: Member, videoId: number, partNumbers: number[], segment = 1): Promise<Record<number, string>> {
	const upload = await requireActiveUpload(deps, member, videoId);
	checkParts(upload, partNumbers);
	const target = await uploadFor(deps, upload, segment);
	const entries = await Promise.all(partNumbers.map(async (n) => [n, await deps.presigner.partUrl(target.r2Key, target.r2UploadId, n)] as const));
	return Object.fromEntries(entries);
}

/**
 * Completes the R2 upload and requests the Stream copy (`finishUpload`); a carried-on recording's segments are all
 * completed and wait for the join instead (`finishSegments`). Asking again after it finished (the answer lost on a
 * weak signal) answers as done.
 */
export async function completeUpload(
	deps: TeamDeps, member: Member, videoId: number, parts: Array<{ partNumber: number; etag: string }>, segment = 1,
): Promise<"processing" | "queued" | "joining"> {
	const done = await requireVideo(deps.db, deps.team.id, videoId);
	const mine = done.uploadedBy === member.id || member.role === "manager";
	if (mine && (done.status === "processing" || done.status === "ready")) return done.streamUid ? "processing" : "queued";
	const upload = await requireActiveUpload(deps, member, videoId);
	checkParts(upload, parts.map((p) => p.partNumber));
	if (segment > 1 || (await listSegments(deps.db, deps.team.id, upload.id)).length) {
		const finished = await finishSegments(deps, upload, { n: segment, parts });
		if (finished === "nothing") throw conflict("Nothing of the recording reached the site.");
		return finished;
	}
	return finishUpload(deps, upload, parts, member.id);
}
