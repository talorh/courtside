import { CLUB } from "../../../club.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { postButton } from "../../../ui/components.ts";
import type { Game } from "../../games/games-repository.ts";
import type { Score } from "../scores-repository.ts";

/** "Won 34 to 28", "Lost 28 to 34", "Drew 30 all": the club's score first. */
export const scoreWords = (s: Score) => (s.ours === s.opponent ? `Drew ${s.ours} all` : `${s.ours > s.opponent ? "Won" : "Lost"} ${s.ours} to ${s.opponent}`);

/** The result as a tag (Watch games, the Fixture, Home): nothing without a score, or for a member who hides scores. */
export const scoreTag = (s: Score | null | undefined, hidden: boolean): SafeHtml | "" => (s && !hidden ? html`<span class="t score">${scoreWords(s)}</span>` : "");

/** Hide scores or Show scores (spoilers): saved for this member, then back to `back`. */
export const scoreSwitch = (hidden: boolean, back: string): SafeHtml => html`<form method="post" action="/me/scores" class="inline scoreswitch">
<input type="hidden" name="hide" value="${hidden ? "0" : "1"}"><input type="hidden" name="back" value="${back}"><button class="btn quiet" type="submit">${hidden ? "Show scores" : "Hide scores"}</button></form>`;

/**
 * Team managers, once a game has started: enter or fix its final score (a PlayHQ game also gets it by itself). Only a
 * score typed in can be cleared: PlayHQ would put its own straight back, so that one is fixed by saving over it.
 */
export function scorePanel(game: Game, score: Score | null, hidden: boolean): SafeHtml {
	const now = score
		? (hidden ? "Its final score is in. You hide scores, so it isn't shown here." : `${scoreWords(score)}${score.source === "playhq" ? ", from PlayHQ" : ""}.`)
		: game.fromPlayhq ? "PlayHQ's final score goes in by itself after the game, or enter it here." : "Enter it after the game.";
	const value = (n: number | undefined) => (hidden || n === undefined ? "" : String(n));
	const box = (name: string, label: string, n: number | undefined) =>
		html`<label>${label}<input name="${name}" type="number" inputmode="numeric" min="0" max="300" required value="${value(n)}"></label>`;
	return html`<div class="panel"><div class="eyebrow">Final score</div><p class="small">${now}</p>
<form method="post" action="/games/${game.id}/score" class="scoreform">${box("ours", CLUB.nickname, score?.ours)}${box("opponent", game.opponent === "TBC" ? "Opponent" : game.opponent, score?.opponent)}
<button class="btn primary">Save score</button></form>${score?.source === "manual" ? postButton(`/games/${game.id}/score/clear`, "Clear score", "btn quiet") : ""}</div>`;
}
