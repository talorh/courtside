import { html, raw, type SafeHtml } from "../../../shared/html.ts";
import { LIVE_DOT } from "./live-card.ts";

// Stop, pause and play symbols, as SVGs so they look the same on every phone.
export const STOP_ICON = raw('<svg class="stopicon" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="1.5" fill="currentColor"/></svg>');
export const PAUSE_ICON = raw('<svg class="stopicon" viewBox="0 0 10 10" aria-hidden="true"><rect width="3.5" height="10" rx="1" fill="currentColor"/><rect x="6.5" width="3.5" height="10" rx="1" fill="currentColor"/></svg>');
export const PLAY_ICON = raw('<svg class="stopicon" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 0l9 5-9 5z" fill="currentColor"/></svg>');

/**
 * Go live from this page. public/golive.js runs it (camera, live stream, recording, upload). The card is only the
 * controls; without JavaScript it says so. `recordingVideoId` is this game's recording still uploading: the phone that
 * made it (golive.js matches it to what it remembers) can carry on streaming or save it; any phone of the filmer's
 * (`mine`) can save it. `ended`: End game was tapped, so the game can't be streamed again; the recording can only be saved. `ask`: who to send
 * footage to ("Sam", or "your team manager").
 */
export function webLiveCard(gameId: number, recordingVideoId: number | null, ended: boolean, mine: boolean, ask: string): SafeHtml {
	return html`<section class="appcard weblive" aria-labelledby="web-title" data-game="${gameId}" data-recording="${recordingVideoId ?? ""}"${ended ? html` data-ended="1"` : ""}${mine ? html` data-mine="1"` : ""}>
<h3 id="web-title">Stream from this phone</h3>
<div class="note warn browsercheck" data-browser role="status" hidden></div>
<div class="recover panel" data-recover hidden><p data-recover-carry hidden><b>The page was closed mid-game.</b> What was recorded up to then is
safe. Carry on from here: the camera starts again (allow it if asked), then the red <b>Carry on</b> button streams and
records again. The game saves as one video, without the minutes the page was closed.</p>
<p data-recover-here hidden><b>The last recording stopped early</b> (the page was closed). Saving keeps the game up to that
moment; it can't carry on streaming. <b>Game still going?</b> Record the rest with the phone's Camera app and send it to
${ask} afterwards.</p>
<p data-recover-other hidden><b>Your recording of this game isn't on this phone</b>: it was started on another phone or tab, or its
start didn't finish. If nothing's filming it now, save what was recorded, or delete it and start again from here.</p>
<button class="btn livebtn bigpick" type="button" data-act="continue" hidden>Carry on streaming</button>
<button class="btn" type="button" data-act="save">Save what was recorded</button>
<button class="btn quiet" type="button" data-act="discard">Delete it and start again</button>
<p class="small" data-recover-msg role="status"></p></div>
<ol class="steps"><li>Phone <b>sideways</b> on the tripod, with <b>Portrait Orientation Lock off</b> (Android:
<b>Auto-rotate</b> on). Tap <b>Start camera</b>, then <b>Allow</b> the camera and the microphone.</li>
<li>Tap <b>Go live</b> during the warm-up. Phone still upright? It waits until you turn it sideways.
Not filming a part, like the warm-up or half-time? Tap <b>Pause</b>, then <b>Resume</b> before play starts.
<b>Keep the phone unlocked and on this page</b>, with Do Not Disturb on. Camera stopped anyway? Tap <b>Resume camera</b>.</li>
<li>Only after the final buzzer, tap <b>End game</b>, then <b>Yes, end game</b>: once ended, it can't start again.
<b>Then wait for it to finish saving</b>: keep the page open while it says <b>Saving</b>, until it says <b>Saved</b>.</li></ol>
<div class="webcam" data-cam hidden><video muted playsinline autoplay></video>
<div class="camctl"><p class="camstatus" data-status role="status"></p>
<button class="btn livebtn" type="button" data-act="live" hidden>${LIVE_DOT}Go live</button>
<button class="btn pausebtn" type="button" data-act="pause" hidden>${PAUSE_ICON}Pause</button>
<button class="btn resumebtn" type="button" data-act="resume" hidden>${PLAY_ICON}Resume</button>
<button class="btn resumebtn" type="button" data-act="recam" hidden>${PLAY_ICON}Resume camera</button>
<button class="btn resumebtn" type="button" data-act="reload" hidden>${PLAY_ICON}Reload and carry on</button>
<button class="btn danger stopbtn" type="button" data-act="stop" hidden>${STOP_ICON}End game</button>
<div class="stopask" data-stopask role="alertdialog" aria-labelledby="stop-q" hidden><p id="stop-q"><b>End the game?</b>
Only at the final buzzer: the stream can't be started again.</p>
<button class="btn danger stopbtn" type="button" data-act="stopyes">${STOP_ICON}Yes, end game</button>
<button class="btn keepbtn" type="button" data-act="stopno">Keep streaming</button></div></div></div>
<div class="saving panel" data-saving hidden><p data-saving-text><b>Saving the video…</b> Keep this page open.</p>
<progress max="1" value="0"></progress></div>
<button class="btn livebtn bigpick" type="button" data-act="camera" hidden>Start camera</button>
<p class="small" data-msg role="status"></p>
<noscript><p class="small">This needs JavaScript turned on in the browser.</p></noscript>
<p class="small">Use <b>Safari</b> (or Chrome) on iPhone, <b>Chrome</b> on Android: not the Home Screen app. Uses 2 to 3 GB of mobile data a game. Plug into a power bank.</p></section>`;
}
