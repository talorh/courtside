// Finishing a carried-on recording: every segment's R2 upload is completed (the current one from the phone's parts, the
// others from R2's own list of what reached them), and the video waits for the join (join-service.ts) instead of a
// Stream copy. A segment nothing reached R2 for is dropped; one segment left whole is just the video.
import type { TeamDeps } from "../../app/deps.ts";
import type { UploadedPart } from "../../platform/r2-originals.ts";
import type { StoredPart } from "../../platform/r2-presigner.ts";
import { record } from "../activity/activity-service.ts";
import { finishUpload } from "../videos/upload-finish.ts";
import { markUploaded } from "../videos/video-writes-repository.ts";
import type { Video } from "../videos/videos-repository.ts";
import { closeBrowserLive } from "./browser-live-service.ts";
import { completeSegmentRow, deleteSegmentRow, deleteSegmentRows, listSegments, promoteSegment, type Segment } from "./recording-segments-repository.ts";

type Part = Pick<Segment, "n" | "r2Key" | "r2UploadId">;

/** Every segment, segment 1 (the video's own upload) first. */
export async function allSegments(deps: TeamDeps, video: Video): Promise<Part[]> {
	return [{ n: 1, r2Key: video.r2Key!, r2UploadId: video.r2UploadId }, ...(await listSegments(deps.db, deps.team.id, video.id))];
}

/** The parts from 1 up to the first gap: a file needs its start, and the phone sends its parts in order. */
export function leadingRun(parts: StoredPart[]): StoredPart[] {
	const run: StoredPart[] = [];
	for (const part of parts) {
		if (part.partNumber !== run.length + 1) break;
		run.push(part);
	}
	return run;
}

/** When the newest part of any still-open segment reached R2 (the recording's start if none has). */
export async function lastPartAt(deps: TeamDeps, video: Video): Promise<string> {
	let latest = video.createdAt;
	for (const s of await allSegments(deps, video)) {
		if (!s.r2UploadId) continue;
		for (const p of (await deps.presigner.listParts(s.r2Key, s.r2UploadId)) ?? []) if (p.uploaded > latest) latest = p.uploaded;
	}
	return latest;
}

/** A segment's upload completed with `parts`, or from R2's list; false if nothing reached R2 for it (its upload is aborted). */
async function completeSegment(deps: TeamDeps, s: Part, parts: UploadedPart[] | null): Promise<boolean> {
	if (!s.r2UploadId) return deps.originals.exists(s.r2Key); // completed on an earlier try
	const listed = parts ? null : await deps.presigner.listParts(s.r2Key, s.r2UploadId);
	// R2 drops an upload's part list once it's whole: completed on an earlier try that died before it was marked.
	if (!parts && listed === null) return deps.originals.exists(s.r2Key);
	const stored: UploadedPart[] = parts ?? leadingRun(listed ?? []);
	if (stored.length === 0) {
		await deps.originals.abort(s.r2Key, s.r2UploadId);
		return false;
	}
	const sorted = [...stored].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ partNumber: p.partNumber, etag: p.etag.replaceAll('"', "") }));
	await deps.originals.complete(s.r2Key, s.r2UploadId, sorted).catch(async (err: unknown) => {
		if (!(await deps.originals.exists(s.r2Key))) throw err;
	});
	return true;
}

/**
 * Ends a carried-on recording. `current`: the segment the phone just finished, with its parts (End game); null for
 * Save what was recorded, where every segment comes from R2's list. Answers as finishUpload does, "joining" when the
 * video now waits for the join, or "nothing" when no segment had anything in it.
 */
export async function finishSegments(deps: TeamDeps, video: Video, current: { n: number; parts: UploadedPart[] } | null): Promise<"processing" | "queued" | "joining" | "nothing"> {
	const whole: Part[] = [];
	for (const s of await allSegments(deps, video)) {
		if (await completeSegment(deps, s, current?.n === s.n ? current.parts : null)) whole.push(s);
		else if (s.n > 1) await deleteSegmentRow(deps.db, deps.team.id, video.id, s.n); // nothing in it: it was never part of the game
		if (s.n > 1 && whole.includes(s)) await completeSegmentRow(deps.db, deps.team.id, video.id, s.n, deps.now().toISOString());
	}
	if (whole.length === 0) return "nothing";
	const first = whole[0]!;
	// The first segment with anything in it is the video's own file (the page may have closed before a part went),
	// so the join and Keep the first part read files that exist.
	if (first.n > 1) await promoteSegment(deps.db, deps.team.id, video.id, first.n, first.r2Key);
	if (whole.length === 1) {
		// One file: the video is that file, and goes to Stream as any upload does.
		await deleteSegmentRows(deps.db, deps.team.id, video.id);
		return finishUpload(deps, { ...video, r2Key: first.r2Key, r2UploadId: null }, [], video.uploadedBy, { completed: true });
	}
	await markUploaded(deps.db, deps.team.id, video.id, deps.now().toISOString());
	await record(deps, { kind: "upload_finished", gameId: video.gameId, memberId: video.uploadedBy });
	await closeBrowserLive(deps, video);
	return "joining";
}
