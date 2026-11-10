// A team manager's questions on Help: videos and live streaming; and clips, photos and removal requests, which come at
// the bottom of Help, just before child safety.
import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";

/** Videos, then live streaming. */
export const managerFootage = (h: HelpFor) => html`<h2 class="faqgroup">Videos</h2>
${faqItem("g-after", "After an upload", html`<p>A game's video is ready to watch about 20 to 25 minutes after it's uploaded (or the stream stops), and its HD
download about 10 to 15 minutes after that. A stream that was carried on after a closed page takes about ten minutes longer,
while its parts are joined into one video. <b>Notifications</b> shows where each one is up to.</p>`)}
${faqItem("g-move", "A video on the wrong game", html`<p>Open the game, and under <b>Team manager</b> pick the right game and tap
<b>Move video</b>. Nothing is uploaded again. Only games without a video are offered.</p>`)}
${faqItem("g-delete-video", "Replacing or deleting a video", html`<p>On the game's page, tap <b>Delete video</b>, then
<b>Yes, delete it</b>. It's kept for 24 hours in case it was a mistake, then it's gone for good, and the game is free for
a new upload.</p>`)}
${faqItem("g-kept", "Downloads, and how long videos are kept", html`<p>Every download is logged. Videos, clips and photos are
deleted at the end of <b>31 December ${h.season.end}</b> (the end of the year your ${h.season.label} season ends), so remind families to
download the ones they want before then.</p>`)}
<h2 class="faqgroup">Live streaming</h2>
${faqItem("g-live", "Who can go live, and stopping a stream", html`<ul class="steps">
<li>People set to <b>Watch and film</b>, coaches and team managers can <b>Go live</b> on a game set to <b>Live stream</b>.</li>
<li>Ending the game is final, so only after the final buzzer: <b>End game</b>, then <b>Yes, end game</b>. The phone filming, a coach or a
team manager can end it.</li>
<li>Page closed by mistake? On the same phone, open <b>Go live</b> again and tap <b>Carry on streaming</b>, then the red
<b>Carry on</b> once the camera's back: the game carries on and saves as one video. From any other phone you're signed in on, <b>Save what was recorded</b> saves what
reached the site.</li>
<li>Says the video's parts couldn't be joined? That's a carried-on stream the site couldn't put back together.
The site tries for about an hour before it says so. On the
game's page, <b>Keep the first part</b> keeps what was filmed before the page closed as the game's video.</li></ul>
<p class="small"><a href="#live-game">Live streaming a game</a>, further down this page, has the steps for whoever films.
An AI tracking camera? <a href="#ai-cameras">Filming with an AI tracking camera</a> says which can live stream.</p>`)}`;

/** Deleting clips and photos, and deciding removal requests. */
export const managerRemovals = () => html`<h2 class="faqgroup">Removal requests</h2>
${faqItem("g-clips", "Highlight clips", html`<p>Anyone in the team can make one on a game's page and tick who's in it. To take one
off, tap <b>Delete</b> on it, then <b>Yes, delete it</b>.</p>`)}
${faqItem("g-photos", "Deleting a photo", html`<p>Open the photo and tap <b>Delete photo</b>, then <b>Yes, delete it</b>. As team
manager you can delete anyone's photos. Everyone else can delete only their own.</p>`)}
${faqItem("g-requests", "A request to remove something", html`<p>Requests show at the top of <b>Manage team</b>, with the reason
given. Take it off with <b>Delete video</b> (or <b>Delete clip</b>, <b>Delete photo</b>), or leave it with <b>Keep video</b>
(<b>Keep clip</b>, <b>Keep photo</b>).</p>`)}`;
