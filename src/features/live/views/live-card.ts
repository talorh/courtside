import { html, raw, type SafeHtml } from "../../../shared/html.ts";
import { gameTitle } from "../../games/game-format.ts";
import type { Game } from "../../games/games-repository.ts";

/** The round "on air" dot, as an SVG so it stays a circle at every size. */
export const LIVE_DOT = raw('<svg class="ondot" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="currentColor"/></svg>');

/** Big red "LIVE NOW" card(s) at the top of Home and Watch games. Nothing when no game is live. */
export function liveCards(games: Game[]): SafeHtml | "" {
	if (games.length === 0) return "";
	return html`${games.map((g) => html`<a class="livecard" href="/games/${g.id}">
<span class="livethumb"><img src="/court.webp" alt=""><span class="livebadge">${LIVE_DOT}LIVE NOW</span></span>
<span class="livemeta"><b>${gameTitle(g)}</b><span class="small">Streaming from the stadium</span></span>
<span class="livego">Watch live</span></a>`)}`;
}
