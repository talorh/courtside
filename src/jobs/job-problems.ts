// A job's failures, each a job_failed line in the Worker's logs and a problem in the admin Log
// (features/admin/problem-log.ts): the 5-minute job's under the team whose step it was, where it was one, and the
// nightly job's. The log line names its step and record (shared/failure-ids.ts); the problem its step alone, so an
// outage over many records is still one line in the Log, and the same failure every run counts on it. Failures
// gathered into one (an AggregateError: the teams that couldn't close) are each their own.
import type { AppDeps } from "../app/deps.ts";
import { logProblem, said } from "../features/admin/problem-log.ts";
import { failureIds, tagFailure } from "../shared/failure-ids.ts";
import type { TeamRun } from "./teams.ts";

const JOBS = { sync: "The 5-minute job", daily: "The nightly job" } as const;

/** `runs`: the teams' runs, to find each failure's team; `errors`: every failure of the run, the teams' among them. */
export async function logJobProblems(deps: AppDeps, job: keyof typeof JOBS, runs: Array<TeamRun<{ errors: unknown[] }>>, errors: unknown[]): Promise<void> {
	const teamOf = new Map<unknown, string>();
	for (const run of runs) for (const err of "error" in run ? [run.error] : run.result.errors) teamOf.set(err, run.team.id);
	for (const gathered of errors) {
		for (const error of each(gathered)) {
			const ids = failureIds(error), teamId = teamOf.get(gathered) ?? (typeof ids.teamId === "string" ? ids.teamId : null);
			console.error(JSON.stringify({ event: "job_failed", job, ...ids, teamId, error: String(error), cause: causeOf(error), stack: error instanceof Error ? error.stack : undefined }));
			await logProblem(deps, { kind: "job_failed", teamId, what: JOBS[job], detail: `${ids.step ? `${String(ids.step)}: ` : ""}${said(error)}` });
		}
	}
}

/** The failures inside one gathered from several, each with the ids noted on the whole (its step). */
const each = (err: unknown): unknown[] => (err instanceof AggregateError ? err.errors.flatMap((e) => each(tagFailure(e, failureIds(err)))) : [err]);

/** A run stopped by a failure of its own (not the failures it collected, which are already problems: logJobProblems). */
export async function logRunStopped(deps: AppDeps, job: keyof typeof JOBS, err: unknown): Promise<void> {
	if (!(err instanceof AggregateError)) await logProblem(deps, { kind: "job_failed", teamId: null, what: JOBS[job], error: err });
}

const causeOf = (err: unknown) => (err instanceof Error && err.cause !== undefined ? String(err.cause) : undefined);
