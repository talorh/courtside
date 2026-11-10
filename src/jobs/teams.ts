// The jobs for every team: each team's work with that team's deps, one team's failure not stopping the
// next, and a different team first from one run to the next, so a busy team can't use up every run's outside calls.
import { type AppDeps, type TeamDeps, withTeam } from "../app/deps.ts";
import type { Team } from "../features/teams/team.ts";

export type TeamRun<T> = { team: Team; result: T } | { team: Team; error: unknown };

/** `work` for each of `teams`, in that order, one after another. */
export async function runTeams<T>(deps: AppDeps, teams: Team[], work: (deps: TeamDeps) => Promise<T>): Promise<TeamRun<T>[]> {
	const runs: TeamRun<T>[] = [];
	for (const team of teams) {
		try {
			runs.push({ team, result: await work(withTeam(deps, team)) });
		} catch (error) {
			runs.push({ team, error });
		}
	}
	return runs;
}
