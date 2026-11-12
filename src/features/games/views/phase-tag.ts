import { CLUB } from "../../../club.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { PHASE_LABELS, type SeasonPhase } from "../season-phase.ts";

/** The competition's tag, and after it the league season's phase when the game has one (season-phase.ts). */
export function competitionTags(game: { competition: string; phase?: SeasonPhase | null }): SafeHtml {
	const phase = game.competition === CLUB.league && game.phase ? html` <span class="t src">${PHASE_LABELS[game.phase]}</span>` : "";
	return html`<span class="t src">${game.competition}</span>${phase}`;
}
