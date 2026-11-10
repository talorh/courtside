import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";
import { shot } from "./faq-mock.ts";

/** Photos: adding them, what's left off, looking and downloading, deleting your own, and asking for one to be removed.
 * Everyone on the team adds them (families too). */
export const faqPhotos = (h: HelpFor) => faqItem("photos", "How do photos work?", html`<p>Got a photo worth sharing with the team? Add it on <b>Photos</b>
(the grey button at the top).</p>
<ul class="steps">
<li><b>Adding:</b> anyone on the team can add photos. Tap <b>Photos</b>, then <b>Choose photos</b>, and
pick as many as you like. On a computer you can drag them onto the <b>Add photos</b> box instead. Keep the page open
until it says <b>Photos added</b>: on a weak signal they go up one by one, so it takes longer (Wi-Fi is quicker). If
the page is closed part way, it says how many weren't added next time you open Photos: choose those again.</li>
<li><b>Privacy:</b> a photo's location is removed when it's added.</li>
${shot("photos", "The Photos page with Add photos at the top and a green Choose photos button, before any photos are added")}
<li><b>Looking:</b> the newest are first. Tap one to see it bigger, then swipe left or right to flick through (or tap <b>Newer</b> and <b>Older</b>). <b>Select photos</b> on the Photos page downloads or deletes several at once.</li>
<li><b>Download:</b> on a photo, tap <b>Download photo</b>. On an iPhone it's <b>Save photo</b>: then tap
<b>Save Image</b> to put it in Photos.</li>
<li><b>Several at once:</b> tap <b>Select photos</b>, tap the ones you want, then <b>Download</b> (they come as one zip
file). On an iPhone it's <b>Save to Photos</b>: then tap <b>Save Images</b>. You can delete the ones you added the
same way.</li>
<li><b>Added one by mistake?</b> Open it and tap <b>Delete photo</b>, then <b>Yes, delete it</b>. You can delete the ones
you added.</li>
<li><b>Remove:</b> on someone else's photo, tap <b>Ask for this photo to be removed</b>, and ${h.c.ask} will take a look.</li></ul>
<p class="small">They're kept as long as the videos (<a href="#kept">How long are the videos and photos kept?</a>).</p>`);
