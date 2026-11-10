import { html, type SafeHtml } from "../../../shared/html.ts";
import type { RosterDuties } from "../../roster/roster-duties.ts";
import { parseTeamCode, teamSeason } from "../../teams/team-code.ts";
import { type TeamCopy, teamCopy } from "../../teams/team-copy.ts";
import type { Team } from "../../teams/team.ts";

/**
 * Who Help is for: the team's names and who to ask, its players' words (boys or girls), its own
 * season (when its videos go) and its roster's duties.
 */
export interface HelpFor {
	c: TeamCopy;
	kids: string; kid: string; child: string; their: string;
	season: { start: number; end: number; label: string };
	duties: RosterDuties;
}

export function helpFor(team: Team, duties: RosterDuties): HelpFor {
	const girls = parseTeamCode(team.code)?.gender === "g";
	return {
		c: teamCopy(team), kids: girls ? "girls" : "boys", kid: girls ? "girl" : "boy", child: girls ? "daughter" : "son", their: girls ? "her" : "his",
		season: teamSeason(team), duties,
	};
}

/** One question on the Help page: a card that starts closed and opens when tapped. */
export const faqItem = (id: string, question: string, body: SafeHtml) =>
	html`<details class="panel faq" id="${id}"><summary>${question}</summary><div class="faqbody">${body}</div></details>`;
