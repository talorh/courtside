// The bar along the top of a team's pages while one of its games is being streamed: LIVE NOW, the game, and Watch live,
// to the game's page. Not on Home or Watch games (their LIVE NOW cards say it), Go live (the filmer's own screen), or the
// live game's own page. Read from the database alone, so a page never waits on Stream: the 5-minute job notes a
// stream it sees sending, so the bar comes up within 5 minutes of Go live and goes at End game.
import { logProblem } from "../admin/problem-log.ts";
import type { TeamDeps } from "../../app/deps.ts";
import { html, type SafeHtml } from "../../shared/html.ts";
import { gameTitle } from "../games/game-format.ts";
import { gamesStreamingNow } from "./live-bar-repository.ts";
import { LIVE_DOT } from "./views/live-card.ts";

// A run of the 5-minute job, and a little more: a phone that stops without End game drops off after this.
const SEEN_MINUTES = 8;
const WITHOUT = new Set(["/", "/games", "/live"]);

/** The bar for a page at `path`, or nothing. Never fails a page: a database hiccup only leaves the bar off (logged). */
export async function liveBar(deps: TeamDeps, path: string): Promise<SafeHtml | ""> {
	if (WITHOUT.has(path) || path.startsWith("/api/")) return "";
	const since = new Date(deps.now().getTime() - SEEN_MINUTES * 60_000).toISOString();
	const games = await gamesStreamingNow(deps.db, deps.team.id, since).catch((err: unknown) => {
		console.error(JSON.stringify({ event: "live_bar_failed", teamId: deps.team.id, error: String(err) }));
		return logProblem(deps, { kind: "site_problem", teamId: deps.team.id, what: "The LIVE NOW bar couldn't be checked, so it was left off", error: err }).then(() => []);
	});
	const shown = games.filter((g) => path !== `/games/${g.id}`);
	return shown.length ? html`${shown.map((g) => html`<a class="livebar" href="/games/${g.id}"><span class="livebar-on">${LIVE_DOT}LIVE NOW</span>
<span class="livebar-game">${gameTitle(g)}</span><span class="livebar-go">Watch live</span></a>`)}` : "";
}
