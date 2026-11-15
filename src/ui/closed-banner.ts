// A closed season: its site is read-only until its delete date. Every page says so, and offers
// someone in a current team a way there.
import { lastDayKept } from "../features/season/season-pack.ts";
import { teamLabel } from "../features/teams/team-code.ts";
import type { Team } from "../features/teams/team.ts";
import { html, type SafeHtml } from "../shared/html.ts";
import { MONTHS, seasonLabel } from "../shared/time.ts";
import { pageHead } from "./components.ts";
import { layout, type NavKey, type PageFrame } from "./layout.ts";

export const isClosed = (team: Team) => team.status !== "active";

/** "31 Dec 2027": the last whole day a closed team's things are kept, the same day the end-of-season pack names. */
function lastDay(team: Team): string {
	const [year, month, day] = lastDayKept(team).split("-");
	return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

export function closedBanner(frame: PageFrame): SafeHtml | "" {
	const { team, viewer } = frame;
	if (!isClosed(team)) return "";
	const until = team.deleteAfter ? html` Its videos and photos stay until ${lastDay(team)}, then they're deleted.` : "";
	const current = viewer.memberships.find((m) => m.team.status === "active" && !m.member.hidden)?.team;
	const go = current ? html`<form method="post" action="/teams/switch" class="inline"><input type="hidden" name="team" value="${current.id}">
<button class="btn">Go to ${teamLabel(current, { season: current.code === team.code })}</button></form>` : "";
	return html`<div class="note warn closedbanner" role="status"><b>${teamLabel(team)}'s ${seasonLabel(team.seasonStart)} season is over.</b>${until}${go}</div>`;
}

/** Upload and Go live on a closed team: nothing to add, so just the banner and why. */
export function seasonOverPage(frame: PageFrame, title: string, current: NavKey): SafeHtml {
	return layout({ title, frame, current }, html`${pageHead(teamLabel(frame.team), title)}
<p>${teamLabel(frame.team)}'s season is over, so nothing new can be added. Watching and downloading still work.</p>`);
}
