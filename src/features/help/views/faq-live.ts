import { CLUB } from "../../../club.ts";
import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";
import { PAUSE_ICON, PLAY_ICON, STOP_ICON } from "../../live/views/web-live-card.ts";
import { mock, shot } from "./faq-mock.ts";

// Go live's camera screen, as the filmer sees it (web-live-card.ts): live with Pause and End game, then the question
// End game asks first.
const LIVE_SCREEN = mock("Go live's camera screen while live: LIVE 24 minutes, families can watch, with the yellow Pause button ringed and the red End game button beside it", html`
<span class="m-cam"><span class="m-ctl"><b>● LIVE 24 min · Families can watch</b><span class="m-b pause m-tap">${PAUSE_ICON}Pause</span><span class="m-b stop">${STOP_ICON}End game</span></span></span>`, "wide");
const STOP_ASK = mock("After tapping End game, the question: End the game? Only at the final buzzer: the stream can't be started again. Yes, end game is ringed, beside Keep streaming", html`
<span class="m-cam"><span class="m-ctl m-ask"><b>End the game?</b> Only at the final buzzer: the stream can't be started again.
<span class="m-b stop m-tap">${STOP_ICON}Yes, end game</span><span class="m-b keep">Keep streaming</span></span></span>`, "wide");

const CAMERA_GONE = mock("Go live's camera screen after the phone locked: CAMERA STOPPED, families see Game break, tap Resume camera to carry on, with the Resume camera button ringed beside End game", html`
<span class="m-cam"><span class="m-ctl"><b>⏸ CAMERA STOPPED · Families see "Game break". Tap Resume camera to carry on.</b><span class="m-b resume m-tap">${PLAY_ICON}Resume camera</span><span class="m-b stop">${STOP_ICON}End game</span></span></span>`, "wide");

export const faqLiveGame = (h: HelpFor) => faqItem("live-game", "Live streaming a game", html`
<p><b>You need:</b> to be set to <b>Watch and film</b> (ask ${h.c.ask}), the game in the <b>Fixture</b>, your phone's web browser
(<b>Chrome</b> on Android, <b>Safari</b> on iPhone), a tripod, a power bank, and 2 to 3 GB of mobile data.</p>
<ol class="steps">
<li>Open <b>${CLUB.domain}</b> and tap <b>Go live</b>. Check it shows the right game.${shot("golive", "The Go live page: Which game? with today's game picked, then Stream from this phone with its steps")}</li>
<li>Phone <b>sideways</b> on the tripod, up high near halfway, with <b>Portrait Orientation Lock off</b> so the picture turns with the phone
(iPhone: swipe down from the top-right corner and tap the padlock so it isn't lit up; Android: turn on <b>Auto-rotate</b>).
Turn on <b>Do Not Disturb</b>, so a call doesn't stop the camera.
Tap <b>Start camera</b>, then tap <b>Allow</b> for the <b>camera</b> and the
<b>microphone</b> (it needs both).</li>
<li>During the warm-up, with the phone sideways, tap <b>Go live</b> (still upright? It waits, and goes live as soon as you turn it). Keep the page open right through the quarter breaks. <b>Don't lock the phone or
switch apps</b>: that turns the camera off (see <b>Camera stopped</b> below if it happens).</li>
<li><b>Not filming a part?</b> For the warm-up or half-time, tap <b>Pause</b>. Families see a Game Break screen and that part is left out of the video. Tap
<b>Resume</b> before play starts (the screen stays yellow until you do). Don't tap <b>End game</b> for a break: it ends the stream for good.${LIVE_SCREEN}</li>
<li>After the final buzzer, tap the red <b>End game</b> button, then <b>Yes, end game</b>. Keep the page open until it
says <b>Saved</b>. The game is in Watch games about 20 to 25 minutes later, and its HD copy to save about 10 to 15 minutes after that.${STOP_ASK}</li></ol>
<h3>Good to know</h3>
<ul class="steps">
<li><b>Ending the game is final</b>: the game can't be streamed again. Tapped End game by mistake? Tap <b>Keep streaming</b>.</li>
<li><b>Weak signal?</b> The live picture reconnects by itself, and the saved video is unaffected. The video may be sent
behind the game: if the page says minutes of the game are only on this phone, keep the page open after the final
buzzer until it says <b>Saved</b> (on Wi-Fi if you can). Closed it before then? Those minutes are kept on the phone:
open <b>Go live</b> again on that phone and tap <b>Save what was recorded</b>, and they're sent first.</li>
<li><b>Safari's bars back over the picture?</b> They can come back if the phone turns or locks. On an iPhone, tap the
button at the left of the address and choose <b>Hide Toolbar</b> (on older iPhones it's under <b>aA</b>). The stream and
the recording carry on either way.${shot("golive-safari-bars", "Go live streaming in Safari on an iPhone held sideways, with Safari's address bar and tabs back over the top of the camera picture, and the button at the left of the address ringed: tap it, then Hide Toolbar", 600, 277)}</li>
<li><b>Says to turn the phone sideways when it already is?</b> Portrait Orientation Lock is on (Auto-rotate is off on
Android), which keeps the picture upright. Turn it off as in step 2; the page says how too.</li>
<li><b>Camera stopped</b> (the phone locked, a call came, or another app took the camera)? Nothing ends. While you're
away, families see the Game Break screen and the recording waits. Unlock the phone and go back to Safari or Chrome. If
the camera's still there, it carries on by itself; if it says <b>CAMERA STOPPED</b>, tap <b>Resume camera</b>:
it carries on in the same video, without the gap. On a break when it stopped? It's still on its break: tap <b>Resume</b>
when play starts. Says a call or another app may still have the camera? Finish the call or close that app, then tap
<b>Resume camera</b> again.${CAMERA_GONE}</li>
<li><b>Page closed mid-game</b> (Safari closed, the phone restarted)? The game isn't over. Open <b>Go live</b> again on the same phone and
tap <b>Carry on streaming</b>. The button may count down for up to two minutes while the last of the recording arrives.
Then the camera starts (tap Allow if it asks). Tap the red <b>Carry on</b> button and you're streaming and recording again.
<br>The game still saves as <b>one video</b>, without the minutes the page was closed. After End game it takes
about ten minutes longer than usual to reach Watch games, while its parts are joined together. Anything recorded that hadn't been
sent when the page closed is kept on the phone and goes up by itself.
<br>Meanwhile, families see "Live stream will resume shortly". Their picture comes back by itself within about half a minute of the red Carry on tap.
<br>Not the same phone? Tap <b>Save what was recorded</b> instead, and film the rest with the <b>Camera</b> app.</li>
<li><b>The camera screen says the recording isn't saving, or has stopped?</b> Tap <b>Reload and carry on</b>: the page
comes back, finds the recording and offers Carry on streaming. If the warning goes away by itself, the recording has carried on: keep filming.</li>
<li><b>End game tapped too early?</b> It can't be restarted, so keep filming: open the <b>Camera</b> app and record the
rest of the game. Afterwards, send that video to ${h.c.ask} (Google Drive, Dropbox or AirDrop) and ${h.c.ask} will add
it. Can't get back to Go live to save? What reached the site saves itself a day later.</li>
<li><b>Asked for a new code when you open Go live?</b> That's so your sign-in can't run out part way through the game.</li>
<li><b>Try it at home first, for under a minute.</b> Anything that short is a test: it's thrown away when you tap End
game, and the game can still be streamed for real. A paused stretch doesn't count.
A minute or more is kept as the game's video, and the game can't be
streamed again.</li>
<li><b>Camera or microphone blocked?</b> iPhone: tap <b>aA</b> next to the web address → <b>Website Settings</b> → Allow
both. Android: tap the icon next to the web address → <b>Permissions</b> → allow both. Then reload the page.</li></ul>`);

export const FAQ_LIVE_BROWSER = faqItem("live-browser", "Live streaming: which browser?", html`
<ul class="steps">
<li><b>Android: Chrome</b> works best. Firefox and Samsung Internet work too.</li>
<li><b>iPhone: Safari.</b> Chrome and Firefox also work on iPhone (they work the same way underneath).</li>
<li><b>Not the Courtside app on your Home Screen.</b> Go live from Safari or Chrome itself: in the app, a phone locked
for a moment loses its sound for the rest of the game (in Safari and Chrome it carries on). The app's Go live page has a
button to open it in Safari or Chrome; sign in there with the code from your email.</li>
<li><b>Not inside WhatsApp, Facebook or Messenger.</b> Links tapped there open in the app's own browser, which can't
stream. Use the menu (⋯ or ⋮) → <b>Open in Safari</b> or <b>Open in Chrome</b>. The Go live page warns you if this
happens.</li></ul>`);
