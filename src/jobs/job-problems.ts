// A job's failures, each a problem in the admin Log (features/admin/problem-log.ts): the 5-minute job's under the team
// whose step it was, where it was one, and the nightly job's. The same failure every run counts on one line.
import type { AppDeps } from "../app/deps.ts";
import { logProblem } from "../features/admin/problem-log.ts";
import type { TeamRun } from "./teams.ts";

const JOBS = { sync: "The 5-minute job", daily: "The nightly job" } as const;

/** `runs`: the teams' runs, to find each failure's team; `errors`: every failure of the run, the teams' among them. */
export async function logJobProblems(deps: AppDeps, job: keyof typeof JOBS, runs: Array<TeamRun<{ errors: unknown[] }>>, errors: unknown[]): Promise<void> {
	const teamOf = new Map<unknown, string>();
	for (const run of runs) for (const err of "error" in run ? [run.error] : run.result.errors) teamOf.set(err, run.team.id);
	for (const error of errors) await logProblem(deps, { kind: "job_failed", teamId: teamOf.get(error) ?? null, what: JOBS[job], error });
}

/** A run stopped by a failure of its own (not the failures it collected, which are already problems: logJobProblems). */
export async function logRunStopped(deps: AppDeps, job: keyof typeof JOBS, err: unknown): Promise<void> {
	if (!(err instanceof AggregateError)) await logProblem(deps, { kind: "job_failed", teamId: null, what: JOBS[job], error: err });
}
