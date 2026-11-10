import { CLUB } from "../../../club.ts";
import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";
import { I_CAMERA, I_CLOUD, I_COPY, I_FOLDER, I_PHONE, I_PHOTO, I_PLUS, mock, row, shot } from "./faq-mock.ts";

// The iPhone's steps that trip people up, as mock screens: Save to Files in Photos, then Choose File (not Photo Library).
const SAVE_TO_FILES = html`<div class="mocks">${mock("The Photos Share menu for the video, with Save to Files ringed", html`
<span class="m-head m-center"><b>1 Video Selected</b></span><span class="m-list">${row("Copy", I_COPY)}${row("Duplicate", I_PLUS)}
${row("Save to Files", I_FOLDER, true)}</span>`)}${mock("Choosing where to save it: On My iPhone ringed, then Save ringed at the top right", html`
<span class="m-top"><span class="m-link">Cancel</span><span></span><span class="m-link m-tap">Save</span></span>
<span class="m-list">${row("iCloud Drive", I_CLOUD)}${row("On My iPhone", I_PHONE, true)}</span>`)}</div>`;
const CHOOSE_FILE = mock("The menu after tapping Choose the video, with Choose File ringed at the bottom (not Photo Library)", html`
<span class="m-list">${row("Photo Library", I_PHOTO)}${row("Take Video", I_CAMERA)}${row("Choose File", I_FOLDER, true)}</span>`);

const UPLOAD_PAGE = shot("upload", "The Upload game video page: Which game? with the next game picked, then a green Choose the video button");
const UPLOAD_STEPS = html`<li><b>Check "Which game?"</b> shows the right game.${UPLOAD_PAGE}</li>`;
const AFTER_UPLOAD = html`<li><b>Keep the page open</b> until it says the upload is complete (about 25 minutes on home
Wi-Fi). If the Wi-Fi drops, it carries on by itself. If the page reloads, choose the same game and video again and it
picks up where it left off.</li>
<li>The game is in <b>Watch games</b> about 20 to 25 minutes later, and its HD copy to save about 10 to 15 minutes after that.</li>`;

export const FAQ_RECORD_IOS = faqItem("record-iphone", "Recording and uploading a game: iPhone", html`
<h3>Before the first game</h3>
<ol class="steps">
<li><b>Set the camera once.</b> In <b>Settings</b> → <b>Camera</b>, set <b>Record Video</b> → <b>1080p HD at 30 fps</b>, and <b>Formats</b> → <b>High Efficiency</b>.
A game is then about 4 GB. 4K makes it three times that and looks no better on a phone.</li></ol>
<h3>At the game</h3>
<ol class="steps">
<li>Turn on <b>Do Not Disturb</b> (swipe down from the top-right corner, tap <b>Focus</b>) and plug in a power bank.</li>
<li>Open the <b>Camera</b> app, swipe to <b>Video</b> and start recording <b>before tip-off</b>. Keep it running through the
breaks and stop at the final buzzer: <b>one video for the whole game</b>.</li></ol>
<h3>After the game</h3>
<ol class="steps">
<li><b>Upload the same day</b>, ideally on home Wi-Fi.</li>
<li><b>Save the video to Files first.</b> In <b>Photos</b>, open the video, tap <b>Share</b> → <b>Save to Files</b> →
<b>On My iPhone</b> → <b>Save</b>. Picked from Photos instead, the iPhone converts the whole game before handing it over
(a circle shows on it while it does): many minutes' wait, and a file twice the size to upload. Files skips all that.${SAVE_TO_FILES}</li>
<li>Open <b>${CLUB.domain}</b> in Safari (or ${CLUB.siteName} on your Home Screen) and tap <b>Upload video</b>.</li>
${UPLOAD_STEPS}
<li>Tap <b>Choose the video</b> → <b>Choose File</b>, and pick the video from <b>Files</b> (On My iPhone).${CHOOSE_FILE}</li>
${AFTER_UPLOAD}</ol>
<p class="small">Saving to Files needs as much free space as the video (a few GB). Once the game is in Watch games, you
can delete the copy in Files; the original stays in Photos. If the video is already on a computer (iCloud Photos on a
Mac, say), you can open ${CLUB.domain} there instead and drag it onto the Upload page.</p>`);

export const FAQ_RECORD_ANDROID = faqItem("record-android", "Recording and uploading a game: Android", html`
<h3>Before the first game</h3>
<ol class="steps">
<li><b>Set the camera once.</b> In the <b>Camera</b> app's settings, set video to <b>1080p (FHD) at 30 fps</b>, not 4K. A game is
then about 4 GB; 4K makes it three times that and looks no better on a phone.</li></ol>
<h3>At the game</h3>
<ol class="steps">
<li>Turn on <b>Do Not Disturb</b> (swipe down from the top of the screen) and plug in a power bank.</li>
<li>Open the <b>Camera</b> app, switch to <b>Video</b> and start recording <b>before tip-off</b>. Keep it running through the
breaks and stop at the final buzzer: <b>one video for the whole game</b>.</li></ol>
<h3>After the game</h3>
<ol class="steps">
<li><b>Upload the same day</b>, ideally on home Wi-Fi.</li>
<li>Open <b>${CLUB.domain}</b> in Chrome (or ${CLUB.siteName} on your Home Screen) and tap <b>Upload video</b>.</li>
${UPLOAD_STEPS}
<li>Tap <b>Choose the video</b> and pick it from your Gallery, Photos or Files.</li>
${AFTER_UPLOAD}</ol>
<p class="small">If Google Photos offers to "free up space", don't let it remove the video from your phone until the upload
is complete.</p>`);

export const faqUploadHelp = (h: HelpFor) => faqItem("upload-help", "The upload won't work. What can I do?", html`
<p><b>iPhone, and choosing the video just sits there</b> (a circle on it, or Preparing)? The iPhone converts the whole game
before it hands it over, which takes many minutes and doubles its size. Don't wait: save the video to Files first. In <b>Photos</b>, open
the video, tap <b>Share</b> → <b>Save to Files</b> → <b>On My iPhone</b> → <b>Save</b>. Then on <b>Upload video</b>, tap
<b>Choose the video</b> → <b>Choose File</b> (not Photo Library) and pick it from <b>On My iPhone</b>.</p>
<p>Otherwise, try again on good Wi-Fi. <b>If all else fails</b>, put the video in <b>Google Drive</b> or <b>Dropbox</b>
and send ${h.c.ask} the link. ${h.c.Ask} will add it for you.</p>
<p class="small">Please keep the video on your phone until it appears in Watch games.</p>`);
