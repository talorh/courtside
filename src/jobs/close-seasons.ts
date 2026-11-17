// The 3am job's close of every running team whose season is over: at the end of 31 December of the year its season
// ends its videos and photos are due, so the team closes as End season's "When they're due" would close it, and the
// 5-minute job deletes it from that night (jobs/delete-teams.ts).
import type { AppDeps } from "../app/deps.ts";
import { closeSeasonOver } from "../features/admin/team-lifecycle-service.ts";
import { listTeamsIn } from "../features/teams/teams-repository.ts";
import { runEach } from "../shared/run-each.ts";

/** Each running team in turn. One still uploading or streaming at 3am is left running, as End season would refuse it,
 * and tried again the next night: no failure, only a log line. A team that can't be closed fails the night. */
export async function closeSeasonsOver(deps: AppDeps): Promise<void> {
	const { errors } = await runEach(await listTeamsIn(deps.db, ["active"]), async (team) => {
		const outcome = await closeSeasonOver(deps, team);
		if (outcome === "closed") console.log(JSON.stringify({ event: "season_closed", teamId: team.id }));
		if (outcome === "busy") console.log(JSON.stringify({ event: "season_close_waits", teamId: team.id }));
	}, (t) => ({ teamId: t.id }));
	if (errors.length) throw new AggregateError(errors, `closing seasons: ${errors.length} team(s) couldn't be closed`);
}
