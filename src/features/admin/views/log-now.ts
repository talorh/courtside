// The Log's Right now: every team's live streams, uploads, processing and HD downloads being made, and families' removal
// requests waiting for their team manager, each with its team and an Open button into the team; one quiet line when
// there's none. It follows the Log's Team filter alone: it's what's true now, not the days chosen.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime } from "../../../shared/time.ts";
import { STAGE } from "../../activity/views/notifications-page.ts";
import { gameTitle } from "../../games/game-format.ts";
import { teamLabel } from "../../teams/team-code.ts";
import type { Team } from "../../teams/team.ts";
import type { SiteGame, SiteInProgress, SiteWaiting } from "../activity-admin-repository.ts";
import { openTeamForm } from "./teams-page.ts";

export interface RightNow { now: SiteInProgress[]; waiting: SiteWaiting[]; teams: Team[] }

const tag = (t: Team | undefined) => html`<span class="teamtag">${t ? teamLabel(t) : "A deleted team"}</span>`;
const where = (game: SiteGame | null) => (game ? gameTitle(game) : "a deleted game");
const plural = (n: number, one: string) => (n ? [`${n} ${one}${n === 1 ? "" : "s"}`] : []);

export function rightNow(p: RightNow): SafeHtml {
	if (!p.now.length && !p.waiting.length) {
		return html`<p class="small rightnow-none" role="status">Right now: nothing live, uploading or processing, and no removal requests waiting.</p>`;
	}
	const team = (id: string) => p.teams.find((t) => t.id === id);
	const happening = p.now.map((i) => {
		const t = team(i.teamId);
		const open = t && i.game ? openTeamForm(t, "btn", "Open", `/games/${i.game.id}`, `Open ${where(i.game)} in ${teamLabel(t)}`) : "";
		return html`<li><span class="what">${tag(t)}${where(i.game)}: ${STAGE[i.stage]}</span><span class="small">since ${formatGameDate(localTime(new Date(i.since)))}</span>${open}</li>`;
	});
	const waiting = p.waiting.map((w) => {
		const t = team(w.teamId);
		const open = t ? openTeamForm(t, "btn", "Open", "/manage#removals", `Open ${teamLabel(t)}'s removal requests`) : "";
		const what = [...plural(w.videos, "video"), ...plural(w.clips, "clip"), ...plural(w.photos, "photo")].join(", ");
		return html`<li class="warn"><span class="what">${tag(t)}Removal requests waiting: ${what}</span>${open}</li>`;
	});
	return html`<section class="panel stack rightnow" aria-labelledby="rightnow-title"><h2 id="rightnow-title">Right now</h2>
<ul class="nowlist">${happening}${waiting}</ul></section>`;
}
