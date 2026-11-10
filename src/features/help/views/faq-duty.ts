import { CLUB } from "../../../club.ts";
import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";

/** How the team films (its roster's duties): a different family each week, one family every week,
 * or nobody rostered (anyone set to Watch and film can still film). */
function intro({ duties }: HelpFor) {
	if (!duties.video) return html`<p>Your team doesn't roster anyone to film, but anyone set to Watch and film can still record or stream a game.
Filming one? Thank you!</p>`;
	if (duties.videoFamily !== null) return html`<p>One family films every game: the <a href="/roster">Roster</a> says which. Thank
you!</p>`;
	return html`<p>Each game, a family takes a turn filming: the <a href="/roster">Roster</a> says whose turn it is. Thank you!</p>`;
}

/** The checklist for whoever films the game. */
export const faqDuty = (h: HelpFor) => faqItem("duty", h.duties.video ? "On video duty this week? Start here" : "Filming a game? Start here", html`
${intro(h)}
<ol class="steps">
<li><b>Check the Fixture:</b> each game says <b>Recorded</b> (film on your phone and upload afterwards, the best picture),
<b>Live stream</b> (from the Go live page, so families can watch from home) or <b>No video</b>.</li>
<li><b>Before game day</b>, check you can see <b>Upload video</b> and <b>Go live</b> on ${CLUB.domain}. If not, ask
${h.c.ask}. Live streaming? Do a test at home first, under a minute, so it's thrown away.</li>
<li><b>Bring</b> your phone (charged, a few GB free), a tripod and a power bank.</li>
<li><b>At the game</b>, phone sideways, up high near halfway, so the whole court is in shot.</li>
<li><b>That night</b>, check the game is in <b>Watch games</b>. If it isn't, let ${h.c.ask} know.</li></ol>`);
