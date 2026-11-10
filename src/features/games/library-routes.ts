import { htmlResponse } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { gameThumbSeconds, thumbnailUrl } from "../../platform/stream-tokens.ts";
import { COMPETITIONS, type Competition } from "./games-repository.ts";
import { listLibrary, listLibraryCompetitions } from "./library-repository.ts";
import { liveGames } from "../live/live-service.ts";
import { listOpenLive, wasStreamed } from "../live/live-repository.ts";
import { localTime } from "../../shared/time.ts";
import { libraryPage } from "./views/library-page.ts";
import { viewerFor } from "../videos/video-views-repository.ts";
import { listScores } from "../scores/scores-repository.ts";
import { listStarredClips, starredBy } from "../favourites/favourites-repository.ts";
import { teamSeason } from "../teams/team-code.ts";

const asCompetition = (value: string | null): Competition | "" =>
	COMPETITIONS.find((c) => c === value) ?? "";

export function registerLibraryRoutes(router: Router): void {
	router.get("/games", "watcher", async ({ url, frame, member, deps }) => {
		const { db, config, tokens } = deps;
		const competition = asCompetition(url.searchParams.get("c"));
		const [rows, competitions, live, open, scores, starred, starredClips] = await Promise.all([
			listLibrary(db, deps.team.id, competition, viewerFor(member.id, deps.now())),
			listLibraryCompetitions(db, deps.team.id),
			liveGames(deps),
			listOpenLive(db, deps.team.id),
			listScores(db, deps.team.id),
			starredBy(db, deps.team.id, member.id),
			listStarredClips(db, deps.team.id, member.id),
		]);
		const saving = new Set(open.filter((l) => l.endRequestedAt).map((l) => l.gameId));
		const streaming = new Set(open.filter((l) => wasStreamed(l) && !l.endRequestedAt).map((l) => l.gameId));
		const entries = await Promise.all(rows.map(async (e) => ({
			...e,
			thumbUrl: e.streamUid ? thumbnailUrl(config.streamCustomerCode, await tokens.sign(e.streamUid), gameThumbSeconds(e.durationSeconds)) : null,
		})));
		// Favourites sit above every game, so not on a competition's list (its games alone would leave some out).
		const favourites = competition ? { games: [], clips: [] } : {
			games: entries.filter((e) => starred.games.has(e.game.id)),
			clips: await Promise.all(starredClips.map(async (c) => ({ ...c, thumbUrl: thumbnailUrl(config.streamCustomerCode, await tokens.sign(c.streamUid), 1) }))),
		};
		return htmlResponse(libraryPage({ frame, entries, competition, competitions, live, saving, streaming, scores, favourites, nowLocal: localTime(deps.now()), season: teamSeason(deps.team).label }));
	});
}
