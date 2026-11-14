import type { AppDeps, TeamDeps } from "../app/deps.ts";
import { advanceClips } from "../features/clips/clips-service.ts";
import { checkPlayhqFixturesDue } from "../features/games/playhq-service.ts";
import { advanceLive } from "../features/live/live-sync.ts";
import { enforcePhotoRetention } from "../features/photos/photos-service.ts";
import { isBeingDeleted, type TeamStatus } from "../features/teams/team.ts";
import { advanceProcessing, retryStreamCopies, trackHdDownloads } from "../features/videos/processing-service.ts";
import { enforceRetention } from "../features/videos/retention-service.ts";
import { clearTombstones } from "../features/videos/tombstones-service.ts";
import { checkFinalScores } from "../features/scores/scores-service.ts";
import { FetchBudgetSpent } from "../platform/fetch-budget.ts";
import { retryTicketEmails } from "../features/admin/support-desk-service.ts";
import { checkEmailAllowance, checkJobRan, checkEmails, checkSiteErrors, checkStreamStorage, recordSyncRun } from "../features/admin/usage-checks.ts";
import { checkComingGames } from "../features/admin/game-day-checks.ts";
import { localDate } from "../shared/time.ts";
import { listTeamsIn } from "../features/teams/teams-repository.ts";
import { busyTeamIds } from "./all-teams-repository.ts";
import { deleteTeamsDue, removeLeftovers } from "./delete-teams.ts";
import { runTeams } from "./teams.ts";
import { setUnfilmedNoVideo } from "../features/games/no-video-after.ts";
import { logJobProblems, logRunStopped } from "./job-problems.ts";
import { alertFailed } from "../features/admin/problem-log.ts";

const ZERO = {
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
const MEDIA: Step[] = [retryStreamCopies, advanceProcessing, trackHdDownloads, advanceClips, enforceRetention, enforcePhotoRetention, clearTombstones];
const STEPS: Record<TeamStatus, Step[]> = {
	active: [advanceLive, ...MEDIA, checkPlayhqFixturesDue, checkFinalScores],
	closed: [advanceLive, ...MEDIA],
	deleted: [enforceRetention, removeLeftovers],
};

/** Runs are five minutes apart: the run's number picks whose turn it is. */
const RUN_MS = 300_000;
/** Quiet teams a run takes a turn of (about 18 trips to the database each): with this many teams or fewer, every team
 * runs every five minutes; past it, a quiet team is reached once in every ceil(quiet / 12) runs. */
export const QUIET_TEAMS_A_RUN = 12;

/**
 * Which teams this run works on (so the site scales past 55 teams inside D1's 1,000 queries a run): every
 * busy team (a game today, a live stream open, a video or clip being processed, an HD copy awaited: all-teams-repository.ts),
 * and the next turn of the quiet ones. Each turn starts where the last left off, so every quiet team gets its retention,
 * PlayHQ check and the rest within the hour, and busy teams never wait.
 */
export function teamsThisRun<T extends { id: string }>(teams: T[], busy: Set<string>, runIndex: number): { busy: T[]; turn: T[] } {
	// A different team first from one run to the next, among the busy and among the quiet, so one busy team can't use up
	// every run's outside calls: a whole turn's worth of quiet teams moves on each run; fewer than that just rotate.
	const from = <U,>(list: U[], start: number, count: number) => Array.from({ length: count }, (_, i) => list[(start + i) % list.length]!);
	const busyTeams = teams.filter((t) => busy.has(t.id)), quiet = teams.filter((t) => !busy.has(t.id));
	const take = Math.min(QUIET_TEAMS_A_RUN, quiet.length);
	const step = take === quiet.length ? 1 : take;
	return {
		busy: busyTeams.length ? from(busyTeams, runIndex % busyTeams.length, busyTeams.length) : [],
		turn: quiet.length ? from(quiet, (runIndex * step) % quiet.length, take) : [],
	};
}

/** One team's steps, every one even if another fails, outright or record by record. Work past the run's budget of
 * outside calls waits for the next run. */
async function syncTeam(deps: TeamDeps): Promise<{ summary: SyncSummary; errors: unknown[]; deferred: number }> {
	const summary = { ...ZERO };
	const all: unknown[] = [];
	if (isBeingDeleted(deps.team, deps.now())) return { summary, errors: all, deferred: 0 };
	for (const step of STEPS[deps.team.status]) {
		try {
			const { errors, ...counts } = await step(deps);
			for (const [key, n] of Object.entries(counts) as Array<[keyof SyncSummary, number]>) summary[key] += n;
			all.push(...errors);
		} catch (err) {
			all.push(err);
		}
	}
	const errors = all.filter((err) => !(err instanceof FetchBudgetSpent));
	console.log(JSON.stringify({ event: "sync_team", teamId: deps.team.id, ...summary, deferred: all.length - errors.length, errorCount: errors.length }));
	return { summary, errors, deferred: all.length - errors.length };
}

/**
 * Cron (every 5 minutes), for every team: each team's steps with its own deps, a failure in one team not
 * stopping the next. PlayHQ fixtures are checked every 8 hours (every hour while a tournament's on), and PlayHQ games
 * that are over get their final score.
 * Idempotent: every step reads current state, so a re-run is safe. Any failures are rethrown at the end so the run
 * shows as failed. Steps share one budget of outside calls (`platform/fetch-budget.ts`): work past it isn't a failure,
 * it's counted as `deferred` and the next run (five minutes on) picks it up.
 */
export async function runSync(deps: AppDeps): Promise<SyncSummary> {
	let failure: unknown = null;
	try {
		return await syncAll(deps);
	} catch (err) {
		failure = err;
		await logRunStopped(deps, "sync", err);
		throw err;
	} finally {
		// Six failed runs in a row raises a ticket for the admins (features/admin/usage-checks.ts); recording it never fails the run.
		await recordSyncRun(deps, failure).catch((err: unknown) => alertFailed(deps, "sync_job", err));
	}
}

async function syncAll(deps: AppDeps): Promise<SyncSummary> {
	const now = deps.now();
	const summary = { ...ZERO };
	const errors: unknown[] = [];
	const teams = await listTeamsIn(deps.db, ["active", "closed"]);
	// A deleted team's work (its download log's two years, then what that named) can wait days, and there's one more every
	// season: one a run, in turn (288 runs a day), so they never take live teams' turns.
	const deleted = await listTeamsIn(deps.db, ["deleted"]);
	const runIndex = Math.floor(now.getTime() / RUN_MS);
	// Who's busy can't be read (a database hiccup): this turn still runs, and the run fails loudly at the end.
	const busy = await busyTeamIds(deps.db, localDate(now)).catch((err: unknown) => { errors.push(err); return new Set<string>(); });
	const picked = teamsThisRun(teams, busy, runIndex);
	const tombstone = deleted.length ? [deleted[runIndex % deleted.length]!] : [];
	const runs = await runTeams(deps, [...picked.busy, ...picked.turn, ...tombstone], syncTeam);
	let deferred = 0;
	for (const run of runs) {
		if ("error" in run) { errors.push(run.error); continue; }
		for (const key of Object.keys(ZERO) as Array<keyof SyncSummary>) summary[key] += run.result.summary[key];
		errors.push(...run.result.errors);
		deferred += run.result.deferred;
	}
	// Games nobody filmed in the week after tip-off: No video (features/games/no-video-after.ts), one read for all.
	const unfilmed = await setUnfilmedNoVideo(deps, teams).catch((err: unknown) => ({ noVideoSet: 0, errors: [err] }));
	errors.push(...unfilmed.errors);
	// After every team's own steps: deleting closed teams whose date has passed, a slice a run.
	const deleting = await deleteTeamsDue(deps).catch((err: unknown) => ({ deleted: 0, errors: [err] }));
	errors.push(...deleting.errors);
	// Support tickets' emails that didn't go, every team's and the site's own. One that
	// fails again is logged, and the email alert raises it: only failing to look for them fails the run.
	await retryTicketEmails(deps).catch((err: unknown) => void errors.push(err));
	// Basic monitoring: Stream's minutes, the site failing, emails not going, the 3am job running, and each live game 8
	// hours before tip-off (game-day-checks.ts). A check that fails
	// (a database hiccup) is one more failure of the run, never one that loses the others before they reach the Log.
	const checks = [checkStreamStorage, checkSiteErrors, checkEmails, checkEmailAllowance, (d: AppDeps) => checkJobRan(d, "daily_job"), checkComingGames];
	for (const check of checks) await check(deps).catch((err: unknown) => void errors.push(err));
	console.log(JSON.stringify({ event: "sync_videos", teams: teams.length, deletedTeams: deleted.length, busy: picked.busy.length, turn: picked.turn.length, ...summary, teamsDeleted: deleting.deleted, noVideoSet: unfilmed.noVideoSet, deferred, errorCount: errors.length }));
	await logJobProblems(deps, "sync", runs, errors);
	if (errors.length > 0) throw new AggregateError(errors, `sync_videos: ${errors.length} record(s) failed`);
	return summary;
}
