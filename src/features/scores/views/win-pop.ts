import { CLUB } from "../../../club.ts";
import { html, raw, type SafeHtml } from "../../../shared/html.ts";
import { gameTitle } from "../../games/game-format.ts";
import type { Game } from "../../games/games-repository.ts";
import type { Score } from "../scores-repository.ts";

/** A win to celebrate: a final score with the club ahead, for a member who doesn't hide scores. */
export const isWinToShow = (score: Score | null, hidesScores: boolean): boolean => score !== null && !hidesScores && score.ours > score.opponent;

// The court's centre circle and halfway line behind the club's logo, in the Full time card's line colour.
const COURT = raw('<svg class="court" viewBox="0 0 400 520" preserveAspectRatio="xMidYMin slice" aria-hidden="true"><circle cx="200" cy="96" r="116"/><path d="M-10 96H84M316 96H410"/></svg>');

/** The confetti's colours (public/win.js reads them): the club's bright colour, its pale tint and white, with a little gold. */
const confetti = (): string => {
	const { button, soft } = CLUB.colors.light, bright = CLUB.colors.dark.button;
	return [button, button, bright, bright, soft, soft, "#FFFFFF", "#FFFFFF", "#FFFFFF", "#C9A256"].join(",");
};

/**
 * The win pop-up ("Saints win!"): about a second over the game's page, then gone by itself (app.css times it;
 * public/win.js throws the confetti and takes it away). Nothing to tap, and taps pass through it. It never says the score.
 */
export function winPop(game: Game): SafeHtml {
	return html`<div class="winpop" role="status" data-confetti="${confetti()}"><canvas aria-hidden="true"></canvas>
<div class="wincard">${COURT}<img src="/club-mark.webp" alt="" width="400" height="320"><h2>${CLUB.nickname} win!</h2><p class="wingame">${gameTitle(game)}</p></div><canvas aria-hidden="true"></canvas></div>`;
}
