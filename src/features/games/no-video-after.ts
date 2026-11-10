// A game nobody uploaded or streamed in the week after tip-off is set to No video (the 5-minute job, one read for every
// active team: all-teams-repository.ts), so the Fixture and Home stop waiting for footage that isn't coming. Until then
// it's Waiting for video. A Go live that was only opened is closed with it. A team manager who sets the game back to
// Video (to upload it after all) gives it another week from then. In the Log, by the site.
import { type AppDeps, withTeam } from "../../app/deps.ts";
import { addDays, localTime } from "../../shared/time.ts";
import { unfilmedGames } from "../../jobs/all-teams-repository.ts";
import { logTeamChange } from "../admin/team-log.ts";
import { closeUnusedLive } from "../live/live-service.ts";
import type { Team } from "../teams/team.ts";
import { gameName } from "./game-log.ts";
import { setNoVideoBySite } from "./no-video-repository.ts";

/** How long a game waits for its video: from tip-off, or from being set back to Video. */
export const WAIT_DAYS = 7;

/** `teams`: the run's teams (only active ones' games are read). */
export async function setUnfilmedNoVideo(deps: AppDeps, teams: Team[]): Promise<{ noVideoSet: number; errors: unknown[] }> {
	const now = deps.now();
	const waited = addDays(now, -WAIT_DAYS);
	const due = await unfilmedGames(deps.db, localTime(waited), waited.toISOString());
	const byId = new Map(teams.map((t) => [t.id, t]));
	const errors: unknown[] = [];
	let noVideoSet = 0;
	for (const game of due) {
		const team = byId.get(game.teamId);
		if (!team) continue;
		const teamDeps = withTeam(deps, team);
		try {
			await closeUnusedLive(teamDeps, game.id, "marked No video");
			if (!(await setNoVideoBySite(deps.db, team.id, game.id, now.toISOString()))) continue;
			await logTeamChange(teamDeps, "site", "game_changed", `${gameName(game)}: No video, as nothing was uploaded or streamed in the week it waited for video`);
			noVideoSet++;
		} catch (err) {
			errors.push(err);
		}
	}
	return { noVideoSet, errors };
}
