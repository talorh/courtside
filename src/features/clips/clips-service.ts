import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import { badRequest, conflict, HttpError, notFound } from "../../app/errors.ts";
import { runEach } from "../../shared/run-each.ts";
import { formatDuration, streamDeletionDate } from "../../shared/time.ts";
import { record } from "../activity/activity-service.ts";
import type { Member } from "../members/members-repository.ts";
import { listPlayers, setClipPlayers } from "../players/players-repository.ts";
import { requestHd } from "../videos/processing-service.ts";
import type { Video } from "../videos/videos-repository.ts";
import { resolveRequestsForClipWrite } from "./clip-removals-repository.ts";
import { type Clip, getClip, insertClip, listClipsByStatus, listClipsForVideo, setClipStatus, softDeleteClipWrite } from "./clips-repository.ts";
import { teamCopy } from "../teams/team-copy.ts";

export const MIN_CLIP_SECONDS = 3;
export const MAX_CLIP_SECONDS = 300;
const MAX_CLIPS_PER_VIDEO = 50;
const BATCH = 5;

export const clipFormSchema = z.object({
	start: z.string().trim().min(1, "Enter or mark a start time"),
	end: z.string().trim().min(1, "Enter or mark an end time"),
	label: z.string().trim().max(80).default(""),
	players: z.array(z.coerce.number().int().positive()).max(30).default([]).transform((ids) => [...new Set(ids)]),
});
export const clipPlayersSchema = clipFormSchema.pick({ players: true });

/** Who's in a clip: only the team's current players, each once. */
async function checkPlayers(deps: TeamDeps, playerIds: number[]): Promise<number[]> {
	const known = new Set((await listPlayers(deps.db, deps.team.id)).map((p) => p.id));
	const ids = [...new Set(playerIds)];
	if (ids.some((id) => !known.has(id))) throw badRequest("One of those players isn't on the team list. Reload the page and try again.");
	return ids;
}

export async function saveClipPlayers(deps: TeamDeps, clipId: number, playerIds: number[]): Promise<void> {
	await setClipPlayers(deps.db, deps.team.id, clipId, await checkPlayers(deps, playerIds));
}

/** "1:02:03", "12:34" or "75" → seconds. */
export function parseClock(value: string, what: string): number {
	const parts = value.trim().split(":");
	if (parts.length > 3 || parts.some((p) => !/^\d{1,4}$/.test(p))) throw badRequest(`${what} should look like 12:34.`);
	const [a = 0, b = 0, c = 0] = parts.map(Number).reverse();
	if (parts.length > 1 && a > 59) throw badRequest(`${what} should look like 12:34.`);
	if (parts.length > 2 && b > 59) throw badRequest(`${what} should look like 1:02:03.`);
	return a + b * 60 + c * 3600;
}

export async function createClip(deps: TeamDeps, member: Member, video: Video, form: z.infer<typeof clipFormSchema>): Promise<number> {
	if (video.status !== "ready" || !video.streamUid) throw conflict("The game video isn't ready yet.");
	const start = parseClock(form.start, "Start");
	const end = parseClock(form.end, "End");
	if (end <= start) throw badRequest("The end has to be after the start.");
	if (end - start < MIN_CLIP_SECONDS) throw badRequest(`A clip needs to be at least ${MIN_CLIP_SECONDS} seconds long.`);
	if (end - start > MAX_CLIP_SECONDS) throw badRequest("A clip can be at most 5 minutes long.");
	if (video.durationSeconds && end > video.durationSeconds) throw badRequest(`The game video is only ${formatDuration(video.durationSeconds)} long.`);
	const { db } = deps;
	if ((await listClipsForVideo(db, deps.team.id, video.id)).length >= MAX_CLIPS_PER_VIDEO) throw conflict("This game already has 50 clips.");
	const players = await checkPlayers(deps, form.players);
	const label = form.label || `Highlight at ${formatDuration(start)}`;
	// Stream refuses a scheduled deletion under 30 days away; retention deletes clips with their video anyway.
	const keepDate = streamDeletionDate(video.deleteAfter, deps.now());
	let uid: string;
	try {
		uid = await deps.clipper.clip({ sourceUid: video.streamUid, startSeconds: start, endSeconds: end, name: label, teamId: deps.team.id, scheduledDeletion: keepDate });
	} catch (err) {
		if (/storage capacity exceeded|quota/i.test(String(err))) {
			throw new HttpError(503, "stream_storage_full", `Video storage is full, so clips can't be made right now. ${teamCopy(deps.team).Ask} is sorting it out.`, { cause: err });
		}
		throw new HttpError(502, "clip_failed", "Couldn't make the clip. Please try again.", { cause: err });
	}
	let id: number;
	try {
		id = await insertClip(db, deps.team.id, { videoId: video.id, label, startSeconds: start, endSeconds: end, streamUid: uid, createdBy: member.id }, players);
	} catch (err) {
		// Nothing was saved, so don't leave Stream holding a clip nobody can see or delete.
		await deps.stream.deleteVideo(uid);
		throw err;
	}
	await record(deps, { kind: "clip_made", gameId: video.gameId, memberId: member.id, detail: label });
	return id;
}

export async function requireClip(db: D1Database, teamId: string, id: number): Promise<Clip> {
	const clip = await getClip(db, teamId, id);
	if (!clip) throw notFound("Clip");
	return clip;
}

/** Only a team manager deletes a clip (only the team manager deletes anything); everyone else,
 * its maker too, asks for it to be removed. */
export const canDeleteClip = (member: Member) => member.role === "manager";

/** Its maker, or a team manager, can change who's in a clip. */
export const canEditClip = (member: Member, clip: Clip) => member.role === "manager" || clip.createdBy === member.id;

/** Removes the Stream copy first, so a failure leaves the row for a retry; then the row and its open removal requests
 * closed, together (one without the other would leave a request nobody can see or answer). */
export async function deleteClip(deps: TeamDeps, clip: Clip, actorId: number | null = null): Promise<void> {
	const { db } = deps, nowIso = deps.now().toISOString();
	if (clip.streamUid) await deps.stream.deleteVideo(clip.streamUid);
	await db.batch([
		softDeleteClipWrite(db, deps.team.id, clip.id, nowIso),
		resolveRequestsForClipWrite(db, deps.team.id, clip.id, { status: "clip_deleted", note: "", resolvedBy: actorId, nowIso }),
	]);
}

export async function deleteClipsForVideo(deps: TeamDeps, videoId: number): Promise<void> {
	for (const clip of await listClipsForVideo(deps.db, deps.team.id, videoId)) await deleteClip(deps, clip);
}

/** Cron: processing clips become ready (and get their MP4 started) or failed. */
export async function advanceClips(deps: TeamDeps) {
	const counts = { clipsReady: 0, clipsFailed: 0 };
	const processing = (await listClipsByStatus(deps.db, deps.team.id, "processing")).slice(0, BATCH);
	const result = await runEach(processing, async (clip) => {
		const uid = clip.streamUid as string;
		const state = await deps.stream.details(uid);
		if (!state) {
			// Stream no longer has it (deleted there by hand, say): failed, so it can be made again.
			await setClipStatus(deps.db, deps.team.id, clip.id, "failed", "Stream no longer has this clip");
			counts.clipsFailed++;
		} else if (state.state === "ready" && state.readyToStream) {
			await setClipStatus(deps.db, deps.team.id, clip.id, "ready");
			counts.clipsReady++;
			await requestHd(deps, uid, { clipId: clip.id });
		} else if (state.state === "error") {
			await setClipStatus(deps.db, deps.team.id, clip.id, "failed", state.errorReason || "Stream could not make this clip");
			counts.clipsFailed++;
		}
	});
	return { ...counts, errors: result.errors };
}
