import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";
import { shot } from "./faq-mock.ts";

/** The Roster tab: who's on game day duties at each game, and how it's kept fair. Said as "game day duties" whatever the
 * team's duties are, since teams' duties differ. `films`: whether they film, so get the video duty checklist to point to
 * (Watch only people don't). */
export function faqRoster(h: HelpFor, films: boolean) {
	const d = h.duties;
	return faqItem("roster", "The roster: game day duties", html`
<p>The <b>Roster</b> tab shows which families are on game day duties for every game.</p>
${shot("roster", "The Roster page: each game with the families on duty, and Export to Excel at the top")}
<ul class="steps">
<li><b>Your turn:</b> if your name on the site ends with your family's surname, your family's next duty shows at the
top of the Roster.</li>
<li><b>Fair shares:</b> duties go to the families who've had the fewest so far. <b>Roster fairness</b> at the bottom
shows each family's count.</li>
<li><b>A tournament weekend:</b> each game has its own duties, shown under that game.</li>
${d.video ? html`<li><b>No filming?</b> When a game can't be filmed, there's no video duty for it.</li>
` : ""}<li><b>New games:</b> they get duties by themselves, so check the Roster when the fixture changes.</li>
<li><b>The whole season:</b> tap <b>Later weeks</b> or <b>Earlier weeks</b> under the next six weeks.</li>
<li><b>Can't make it?</b> Swap with another family, then let ${h.c.ask} know so the Roster can be updated.</li>
<li><b>In a spreadsheet:</b> anyone set to Watch and film, coaches and the team manager can tap <b>Export to Excel</b> at the top of the
Roster.</li>
${d.video && films ? html`<li><b>On video?</b> See <a href="#duty">On video duty this week? Start here</a>.</li>` : ""}</ul>`);
}
