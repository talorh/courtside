// A week's own settings on the Roster: No video this week, and Scorers only this week (a tournament weekend).
import type { TeamDeps } from "../../app/deps.ts";
import { badRequest } from "../../app/errors.ts";
import { clearNoVideoUnlessSite, setNoVideo } from "../games/no-video-repository.ts";
import { closeUnusedLive } from "../live/live-service.ts";
import { setWeekExtraOff } from "./roster-repository.ts";
import { rosterWeeks } from "./roster-service.ts";

/** "No video this week" (a tournament that doesn't allow filming): marks the week's games No video, or undoes it (not
 * the site's own No video on a game nobody filmed: a team manager undoes that one game at a time). */
export async function setWeekVideo(deps: TeamDeps, week: string, video: boolean): Promise<void> {
	const w = (await rosterWeeks(deps)).find((x) => x.week === week);
	if (!w) throw badRequest("That week has no games.");
	const now = deps.now().toISOString();
	for (const { game, videoStatus } of w.games) {
		if (video === !game.noVideo || (videoStatus !== null && videoStatus !== "failed")) continue;
		if (video) {
			await clearNoVideoUnlessSite(deps.db, deps.team.id, game.id, now);
			continue;
		}
		await closeUnusedLive(deps, game.id, "marked No video");
		await setNoVideo(deps.db, deps.team.id, game.id, now);
	}
}

/** "Scorers only this week" (a tournament with nothing to bring and no filming): the week keeps its
 * two scorers and loses the extra duty, and its games are marked No video; "All duties this week" undoes both. */
export async function setWeekScorersOnly(deps: TeamDeps, week: string, scorersOnly: boolean): Promise<void> {
	await setWeekVideo(deps, week, !scorersOnly);
	await setWeekExtraOff(deps.db, deps.team.id, week, scorersOnly, deps.now().toISOString());
}
