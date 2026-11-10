// The join: a processing video whose segments are whole in R2 becomes one file, joined by the joiner Worker's container
// (platform/joiner.ts), then goes to Stream as any upload. Run from the 5-minute job's Stream copies step
// (videos/processing-service.ts), which already knows which processing videos have segments. A join takes minutes, so
// no run waits for one: a run begins it, and a later run finds the joined file in R2. That file is the only proof
// trusted (it's whole or it isn't there), so a joiner that restarts or forgets loses nothing, and nothing is deleted
// until the file has been seen. A join that fails, is lost or can't be asked for is begun again ten minutes after the
// last was; after six, the team manager is asked (Keep the first part, videos/keep-first-service.ts) and the admins are
// alerted.
import type { TeamDeps } from "../../app/deps.ts";
import type { JoinAnswer } from "../../platform/joiner.ts";
import type { StoredObject } from "../../platform/r2-originals.ts";
import { runEach } from "../../shared/run-each.ts";
import { setAlert } from "../admin/alerts-service.ts";
import { logProblem } from "../admin/problem-log.ts";
import { requestStreamCopy } from "../videos/upload-finish.ts";
import { countJoinTry, setJoinFailed } from "../videos/video-writes-repository.ts";
import type { Video } from "../videos/videos-repository.ts";
import { logLive } from "./live-log.ts";
import { joinedKey, listSegments, replaceSegmentsWith } from "./recording-segments-repository.ts";

export const JOIN_TRIES = 6;
const TRY_AGAIN_MS = 10 * 60_000;
// The joiner works one join at a time and reads its links when a join's turn comes, which can be after another game's.
const LINK_TTL_SECONDS = 2 * 3600;

async function gaveUp(deps: TeamDeps, video: Video, parts: number, reason: string): Promise<void> {
	await setJoinFailed(deps.db, deps.team.id, video.id, deps.now().toISOString());
	await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "A streamed game's parts couldn't be joined (its team manager is offered Keep the first part)", detail: reason });
	await logLive(deps, null, "join_failed", video.gameId, `${parts} parts, ${JOIN_TRIES} tries: ${reason}`.slice(0, 300));
	await setAlert(deps, "joiner", "urgent", `A game's video couldn't be joined after ${JOIN_TRIES} tries: ${reason}`.slice(0, 300));
}

/** The joined file is in R2: it's the video's original now, the segments go, and Stream is asked for its copy. */
async function finish(deps: TeamDeps, video: Video, keys: string[], written: StoredObject): Promise<void> {
	await replaceSegmentsWith(deps.db, deps.team.id, video.id, written.key);
	for (const k of keys) await deps.originals.remove(k);
	const minutes = video.joinTriedAt ? Math.round((Date.parse(written.uploaded) - Date.parse(video.joinTriedAt)) / 60_000) : NaN;
	const took = minutes >= 0 ? `, ${Math.max(1, minutes)} min` : "";
	await logLive(deps, null, "video_joined", video.gameId, `${keys.length} parts joined into one video (${Math.round(written.size / 1e6)} MB${took})`);
	await requestStreamCopy(deps, { ...video, r2Key: written.key, status: "processing", r2UploadId: null });
}

/** One waiting video's turn. True once its joined file is the video. */
async function joinOne(deps: TeamDeps, video: Video): Promise<boolean> {
	const keys = [video.r2Key!, ...(await listSegments(deps.db, deps.team.id, video.id)).map((s) => s.r2Key)];
	const output = joinedKey(video.r2Key!);
	const stored = async () => (await deps.originals.list(output)).find((o) => o.key === output && o.size > 0);
	const written = await stored();
	if (written) {
		await finish(deps, video, keys, written);
		return true;
	}
	const now = deps.now();
	const waited = video.joinTriedAt === null || now.getTime() - Date.parse(video.joinTriedAt) >= TRY_AGAIN_MS;
	const spent = video.joinTries >= JOIN_TRIES;
	const start = waited && !spent;
	const links = await Promise.all(keys.map((k) => deps.presigner.getUrl(k, { ttlSeconds: LINK_TTL_SECONDS })));
	const answer = await deps.joiner!.join({ segments: links, output: await deps.presigner.putUrl(output, LINK_TTL_SECONDS), container: /\.webm$/.test(output) ? "webm" : "mp4", start })
		.catch((err: unknown): JoinAnswer => ({ ok: false, reason: `the joiner didn't answer: ${err instanceof Error ? err.message : String(err)}` }));
	if (answer.ok && answer.state === "running") {
		if (answer.started) await countJoinTry(deps.db, deps.team.id, video.id, now.toISOString());
		return false;
	}
	// Done, and told only this once: it finished after the look above, so look again.
	const landed = answer.ok && answer.state === "done" ? await stored() : undefined;
	if (landed) {
		await finish(deps, video, keys, landed);
		return true;
	}
	if (answer.ok && answer.state === "none") {
		if (spent && waited) await gaveUp(deps, video, keys.length, "the joiner stopped part way through its last try");
		return false;
	}
	// A join that ran and failed (or says it's done with no file to show) had its try counted when it began. A joiner
	// that refused the ask or didn't answer is a try of its own, when one was due.
	const ran = answer.ok || answer.state === "failed";
	const reason = answer.ok ? "the joined file isn't in storage" : answer.reason;
	if (!ran && start) await countJoinTry(deps.db, deps.team.id, video.id, now.toISOString());
	const tries = video.joinTries + (!ran && start ? 1 : 0);
	console.error(JSON.stringify({ event: "join_failed", teamId: deps.team.id, videoId: video.id, tries, reason }));
	if (tries >= JOIN_TRIES && (ran || waited)) await gaveUp(deps, video, keys.length, reason);
	return false;
}

/** Every processing video with segments (`waiting`) that hasn't been given up on. Without a joiner (cf dev) they wait, logged. */
export async function joinRecordings(deps: TeamDeps, waiting: Video[]) {
	const picked = waiting.filter((v) => v.joinFailedAt === null);
	if (picked.length && !deps.joiner) {
		console.warn(JSON.stringify({ event: "join_no_joiner", teamId: deps.team.id, videos: picked.map((v) => v.id) }));
		return { joined: 0, errors: [] as unknown[] };
	}
	let joined = 0;
	const result = await runEach(picked, async (video) => { if (await joinOne(deps, video)) joined++; });
	return { joined, errors: result.errors };
}
