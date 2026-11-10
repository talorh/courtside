import { htmlResponse } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { listGamesWithVideoStatus } from "../games/games-repository.ts";
import { listLibrary } from "../games/library-repository.ts";
import { liveGames } from "../live/live-service.ts";
import { homePage } from "./views/home-page.ts";
import { listPlayers } from "../players/players-repository.ts";
import { viewerFor } from "../videos/video-views-repository.ts";
import { getScore } from "../scores/scores-repository.ts";
import { footageDue } from "../teams/team-code.ts";
import { localTime } from "../../shared/time.ts";

/** How long before a season's videos and photos go that Home says so. */
const NOTICE_MS = 60 * 86_400_000;

/** The last day the season's footage is kept ('YYYY-MM-DD', the 31 December before its deadline), while it's under 60 days off. */
function goesAfter(seasonStart: number, now: Date): string | null {
	const left = Date.parse(footageDue({ seasonStart })) - now.getTime();
	return left > 0 && left <= NOTICE_MS ? `${seasonStart + 1}-12-31` : null;
}

export function registerHomeRoutes(router: Router): void {
	router.get("/", "watcher", async ({ frame, member, deps }) => {
		const [games, live, players, fixture] = await Promise.all([
			listLibrary(deps.db, deps.team.id, "", viewerFor(member.id, deps.now())),
			liveGames(deps),
			listPlayers(deps.db, deps.team.id),
			listGamesWithVideoStatus(deps.db, deps.team.id),
		]);
		const newest = games.findLast((e) => e.streamUid !== null);
		const newCount = games.filter((e) => e.isNew).length;
		const latestScore = newest ? await getScore(deps.db, deps.team.id, newest.game.id) : null;
		const deletesAfter = goesAfter(deps.team.seasonStart, deps.now());
		// The soonest game still to come (the list is newest first).
		const nowLocal = localTime(deps.now());
		const next = fixture.findLast((g) => g.game.startsAt > nowLocal)?.game ?? null;
		return htmlResponse(homePage({ frame, latest: newest?.game ?? null, latestIsNew: newest?.isNew ?? false, latestScore, newCount, live, players, deletesAfter, next }));
	});
}
