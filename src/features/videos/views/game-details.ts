import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate } from "../../../shared/time.ts";
import { competitionLabel } from "../../games/game-format.ts";
import type { Game } from "../../games/games-repository.ts";
import type { Score } from "../../scores/scores-repository.ts";
import { scoreSwitch, scoreWords } from "../../scores/views/score-line.ts";
import type { Team } from "../../teams/team.ts";

export interface GameResult {
	score: Score | null;
	/** The hour after tip-off, with no final score yet. */
	inProgress: boolean;
	/** This member hides scores (spoilers off). */
	hidden: boolean;
	/** This page, for the Hide scores switch to come back to. */
	back: string;
}

/** The game page's side panel: when, which competition, where, and how it went (or that it's being played). */
export function gameDetails(game: Game, r: GameResult, team: Team): SafeHtml {
	const result = r.score ? (r.hidden ? "Hidden" : scoreWords(r.score)) : r.inProgress ? "In progress" : null;
	return html`<div class="panel"><div class="eyebrow">Game details</div><dl class="kv">
<dt>Date</dt><dd>${formatGameDate(game.startsAt)}</dd><dt>Comp</dt><dd>${competitionLabel(game.competition, team)}</dd>
<dt>Venue</dt><dd>${game.venue}</dd>${result ? html`<dt>Result</dt><dd>${result}</dd>` : ""}</dl>${r.score ? scoreSwitch(r.hidden, r.back) : ""}</div>`;
}
