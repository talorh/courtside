// A team manager's questions on Help: notifications and scores, and the end of the season.
import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";

/** Notifications and scores, and the end of the season. */
export const managerSeason = (h: HelpFor) => html`<h2 class="faqgroup">Notifications and scores</h2>
${faqItem("g-notifications", "What Notifications shows", html`<p><b>Notifications</b> (in the small links at the top) lists what's
streaming, uploading or processing now, and the last 30 days: uploads, clips, live streams and removal requests.</p>`)}
${faqItem("g-score", "Entering a score", html`<p>Once a game has started, its page has the score: type both, then tap
<b>Save score</b>. PlayHQ games fill in by themselves when PlayHQ says the game's final.</p>`)}
<h2 class="faqgroup">End of the season</h2>
${faqItem("g-end", "When the season's over", html`<ul class="steps">
<li>The site's admin closes your team. From then it's read only: families can still watch, download and ask for something
to be removed, but nothing new is added.</li>
<li>Its videos and photos are deleted at the end of <b>31 December ${h.season.end}</b>, as Help tells families.</li>
<li>Before then, the <b>end-of-season pack</b> at the bottom of <b>Manage team</b> has everything to keep: every game's HD
video to download (tap <b>Get every HD copy ready</b> first, and they're all ready about 15 minutes later), each player's
highlight clips under their name, and where to save the photos and the roster.</li>
<li>Next season's team is a new team on the site: contact support, with the form at the bottom of this page, and
they'll set it up.</li></ul>`)}`;
