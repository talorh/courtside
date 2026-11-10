import type { AppDeps } from "../app/deps.ts";
import { runEach } from "../shared/run-each.ts";
import { everyTeamsRecords } from "./all-teams-repository.ts";

// Only things made at least this long ago: an upload or Go live in progress can be in Stream (a photo in Images) before
// it's saved here.
const GRACE_HOURS = 48;
// Staging (docs/runbooks/staging.md) shares Stream and Images, labelling what it makes (platform/site-label.ts). Its
// things are tests: never counted towards the brake below, and removed once they're a week old (tests done by then).
const STAGING_GRACE_HOURS = 7 * 24;
const isStaging = (thing: { site: string | null }) => thing.site === "staging";
// A few per day keeps it inside the run's outside calls; anything left goes the next day.
const MAX_DELETES = 20;

/**
 * The database looks wrong (empty, or the wrong one): most of Stream (or Images) is things it has never heard of. Delete nothing
 * and fail loudly for a person to look. Leftovers it knows about (a closed stream's input, a deleted video's copy)
 * don't count: a busy week can leave several, say Go live opened on a few games.
 */
const looksWrong = (unknown: number, total: number) => unknown > 5 && unknown * 2 > total;

/**
 * Daily: removes Stream videos and live inputs, and photos' images in Cloudflare Images, that no team's records point to
 * any more, so nothing is left behind (a failed delete, a test stream's input, a copy or a photo whose save failed).
 * Stream and Images hold only this site's things, every team's. R2 tidies itself (lifecycle rules, infra/r2-lifecycle.json).
 */
export async function sweepOrphans(deps: AppDeps) {
	// Staging's database knows none of the live site's things, so there everything would look left behind.
	if (deps.config.staging) throw new Error("The clean-up never runs on staging: it would take the live site's things for leftovers");
	const now = deps.now();
	const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
	const cutoff = hoursAgo(GRACE_HOURS), stagingCutoff = hoursAgo(STAGING_GRACE_HOURS);
	const old = (made: string, thing: { site: string | null }) => made < (isStaging(thing) ? stagingCutoff : cutoff);
	// Images not answering mustn't keep Stream's leftovers too: its error still fails the night (recordSweep).
	const imagesListed = deps.images.list()
		.then((list) => ({ list, error: [] as unknown[] }), (err: unknown) => ({ list: [] as Array<{ id: string; uploaded: string; site: string | null }>, error: [err] }));
	// Every team's records in one trip (all-teams-repository.ts): a database that can't be read fails the night here,
	// before anything is deleted, as with part of the picture a team's things would look like leftovers.
	const records = everyTeamsRecords(deps.db, now.toISOString()).catch((err: unknown) => {
		throw new Error(`Orphan sweep refused: couldn't read every team's records (${err instanceof Error ? err.message : String(err)})`, { cause: err });
	});
	const [known, listed, inputs, { list: images, error: imagesError }] = await Promise.all([records, deps.stream.listVideos(), deps.live.listInputs(), imagesListed]);
	// Stream gives a live recording (an external app's) only a name: it's staging's when the input it came from is.
	const inputSite = new Map(inputs.map((i) => [i.uid, i.site]));
	const videos = listed.map((v) => ({ ...v, site: v.site ?? (v.liveInput ? inputSite.get(v.liveInput) ?? null : null) }));
	const oldVideos = videos.filter((v) => old(v.created, v) && !known.inUse.has(v.uid));
	// An external app's input stays while a recording made from it is in use: Stream doesn't say a deleted input keeps
	// its recordings, and once the recording has gone the input goes too.
	const recordingInputs = new Set(videos.filter((v) => v.liveInput && known.inUse.has(v.uid)).map((v) => v.liveInput));
	const oldInputs = inputs.filter((i) => old(i.created, i) && !known.openInputs.has(i.uid) && !recordingInputs.has(i.uid));
	// An image whose upload time isn't known is kept (it doesn't parse, and NaN is never before the cutoff).
	const oldImages = images.filter((i) => Date.parse(i.uploaded) < Date.parse(isStaging(i) ? stagingCutoff : cutoff) && !known.photosInUse.has(i.id));
	// The brake counts only the live site's own things: staging's are always unknown here.
	const ours = <T extends { site: string | null }>(list: T[]) => list.filter((x) => !isStaging(x));
	const unknownVideos = ours(oldVideos).filter((v) => !known.knownVideos.has(v.uid)).length;
	const unknownInputs = ours(oldInputs).filter((i) => !known.knownInputs.has(i.uid)).length;
	const unknownImages = ours(oldImages).filter((i) => !known.knownPhotos.has(i.id)).length;
	const [allVideos, allInputs, allImages] = [ours(videos).length, ours(inputs).length, ours(images).length];
	if (looksWrong(unknownVideos, allVideos) || looksWrong(unknownInputs, allInputs) || looksWrong(unknownImages, allImages)) {
		throw new Error(`Orphan sweep refused: ${unknownVideos} of ${allVideos} Stream videos, ${unknownInputs} of ${allInputs} live inputs and ${unknownImages} of ${allImages} photos are unknown to the database`);
	}
	const work = [
		...oldVideos.map((v) => () => deps.stream.deleteVideo(v.uid)), ...oldInputs.map((i) => () => deps.live.deleteInput(i.uid)),
		...oldImages.map((i) => () => deps.images.delete(i.id)),
	];
	const result = await runEach(work.slice(0, MAX_DELETES), async (remove) => void (await remove()));
	const summary = { orphanVideos: oldVideos.length, orphanInputs: oldInputs.length, orphanImages: oldImages.length, orphansDeleted: result.succeeded };
	const errors = [...imagesError, ...result.errors];
	console.log(JSON.stringify({ event: "orphan_sweep", ...summary, errorCount: errors.length }));
	// How many photos Images holds (for its alert), unless Images didn't answer.
	return { ...summary, imagesStored: imagesError.length ? null : images.length, errors };
}

/** Where the night's clean-up keeps how it went (custom metadata), for the admin area's Platform page: Workers Logs can
 * drop a whole night's lines. Written over each night; the bucket's 30-day rule never gets to it. */
export const SWEEP_RECORD = "backups/sweep.json";

/** `outcome`: what sweepOrphans returned, or why it failed (`failed`). */
export async function recordSweep(deps: AppDeps, outcome: Awaited<ReturnType<typeof sweepOrphans>> | { failed: unknown }): Promise<void> {
	const problems = "failed" in outcome ? [outcome.failed] : outcome.errors;
	const [found, removed] = "failed" in outcome ? [0, 0] : [outcome.orphanVideos + outcome.orphanInputs + outcome.orphanImages, outcome.orphansDeleted];
	const custom = {
		at: deps.now().toISOString(), ok: problems.length === 0 ? "yes" : "no", found: String(found), removed: String(removed),
		problem: problems.length === 0 ? "" : String(problems[0]).slice(0, 300),
	};
	await deps.originals.put(SWEEP_RECORD, JSON.stringify(custom), "application/json", { custom });
}
