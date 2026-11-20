// A team manager's questions on Help: notifications and scores, and the end of the season.
import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";

/** Notifications and scores, and the end of the season. */
export const managerSeason = (h: HelpFor) => html`<h2 class="faqgroup">Notifications and scores</h2>
${faqItem("g-notifications", "What Notifications shows", html`<p><b>Notifications</b> (in the small links at the top) lists what's
streaming, uploading or processing now, and the last 30 days: uploads, clips, live streams and removal requests.</p>`)}
${faqItem("g-score", "Entering a score", html`<p>Once a game has started, its page has the score: type both, then tap
<b>Save score</b>. PlayHQ games fill in by themselves when PlayHQ says the game's final. To take off a score you typed,
tap <b>Clear score</b>, then <b>Yes, clear it</b>.</p>`)}
<h2 class="faqgroup">End of the season</h2>
${faqItem("g-end", "When the season's over", html`<ul class="steps">
<li>Your team's site stays open, and everything on it is kept, until the end of <b>31 December ${h.season.end}</b> (the end
of the year your ${h.season.label} season ends), as Help tells families. Then it closes by itself, and its videos and photos
are deleted that night.</li>
<li>The site's admin can end the season earlier. From then it's read only: families can still watch, download and ask for
something to be removed, but nothing new is added.</li>
<li>Before then, the <b>end-of-season pack</b> at the bottom of <b>Manage team</b> has everything to keep: every game's HD
video to download (tap <b>Get every HD copy ready</b> first, and they're all ready about 15 minutes later), each player's
highlight clips under their name, and where to save the photos and the roster.</li>
<li>Next season's team is a new team on the site: ask with <a href="#ask-admin">Contact support</a>, at the end of
Running your team (or on your <a href="/support">Support</a> page), and they'll set it up.</li></ul>`)}`;
