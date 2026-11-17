// One team's turn of the 5-minute job (sync-videos.ts): its steps, each named, and what they did.
import type { TeamDeps } from "../app/deps.ts";
import { advanceClips } from "../features/clips/clips-service.ts";
import { checkPlayhqFixturesDue } from "../features/games/playhq-service.ts";
import { advanceLive } from "../features/live/live-sync.ts";
import { enforcePhotoRetention } from "../features/photos/photos-service.ts";
import { checkFinalScores } from "../features/scores/scores-service.ts";
import { isBeingDeleted, type TeamStatus } from "../features/teams/team.ts";
import { advanceProcessing, retryStreamCopies, trackHdDownloads } from "../features/videos/processing-service.ts";
import { enforceRetention } from "../features/videos/retention-service.ts";
import { clearTombstones } from "../features/videos/tombstones-service.ts";
import { FetchBudgetSpent } from "../platform/fetch-budget.ts";
import { tagFailure } from "../shared/failure-ids.ts";
import { removeLeftovers } from "./delete-teams.ts";

export const ZERO = {
	copiesRequested: 0, joined: 0, ready: 0, failed: 0, expired: 0, abandoned: 0, purged: 0, downloadsPurged: 0, photosExpired: 0, hdReady: 0,
	clipsReady: 0, clipsFailed: 0, liveNow: 0, playhqChecked: 0, scoresEntered: 0, tombstonesCleared: 0,
};
export type SyncSummary = typeof ZERO;

type Step = (deps: TeamDeps) => Promise<Partial<SyncSummary> & { errors: unknown[] }>;

// Live streams go first (LIVE NOW, tidying up). A closed team's season is over: no new live streams, PlayHQ or scores,
// but what's on its way still finishes: a recording whose phone stopped is saved, an unused live input closed, videos
// and clips processed, and its retention runs. A closed team being deleted has no steps of its own: the run's last step
// deletes it (delete-teams.ts). A deleted team keeps only its download log for its two years, which retention purges,
// and then what that log named goes.
// Each step has a name, for its failures' log line (the build may rename functions).
const MEDIA: Array<[string, Step]> = [["stream_copies", retryStreamCopies], ["processing", advanceProcessing], ["hd_downloads", trackHdDownloads],
	["clips", advanceClips], ["retention", enforceRetention], ["photo_retention", enforcePhotoRetention], ["tombstones", clearTombstones]];
const STEPS: Record<TeamStatus, Array<[string, Step]>> = {
	active: [["live", advanceLive], ...MEDIA, ["playhq", checkPlayhqFixturesDue], ["scores", checkFinalScores]],
	closed: [["live", advanceLive], ...MEDIA],
	deleted: [["retention", enforceRetention], ["leftovers", removeLeftovers]],
};

/** One team's steps, every one even if another fails, outright or record by record. Work past the run's budget of
 * outside calls waits for the next run. */
export async function syncTeam(deps: TeamDeps): Promise<{ summary: SyncSummary; errors: unknown[]; deferred: number }> {
	const summary = { ...ZERO };
	const all: unknown[] = [];
	if (isBeingDeleted(deps.team, deps.now())) return { summary, errors: all, deferred: 0 };
	for (const [name, step] of STEPS[deps.team.status]) {
		try {
			const { errors, ...counts } = await step(deps);
			for (const [key, n] of Object.entries(counts) as Array<[keyof SyncSummary, number]>) summary[key] += n;
			all.push(...errors.map((err) => tagFailure(err, { step: name })));
		} catch (err) {
			all.push(tagFailure(err, { step: name }));
		}
	}
	const errors = all.filter((err) => !(err instanceof FetchBudgetSpent));
	console.log(JSON.stringify({ event: "sync_team", teamId: deps.team.id, ...summary, deferred: all.length - errors.length, errorCount: errors.length }));
	return { summary, errors, deferred: all.length - errors.length };
}
