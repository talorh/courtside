import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";

/**
 * AI tracking cameras, for whoever films: one films through its own app, so it can live stream to the site only if
 * that app streams to a custom RTMPS server (Go live's Use an external app instead). XbotGo and Trackd are two examples
 * of many, as they stood at the time of writing: XbotGo's app does, Trackd's doesn't yet, and makers change their apps.
 */
export const faqAiCameras = (h: HelpFor) => faqItem("ai-cameras", "Filming with an AI tracking camera (XbotGo, Trackd and others)", html`
<p>An AI tracking camera follows the play by itself, but it films through <b>its own app</b>, so Go live can't use the
phone's camera at the same time. What it can do here depends on that app. XbotGo and Trackd below are two examples of
many, as they stood at the time of writing: makers change their apps, so check yours.</p>
<ul class="steps">
<li><b>To live stream, the camera's app must support RTMPS</b>: in its live streaming settings, it has to let you type in
a <b>custom RTMPS server</b> with a <b>stream key</b> (some call it Custom RTMP). Streaming only to YouTube, Facebook or
the maker's own service isn't enough.</li>
<li><b>XbotGo: yes, at the time of writing.</b> Its app streams to a custom address, so it can live stream to this site.</li>
<li><b>Trackd: not yet, at the time of writing.</b> Its app streams only to Trackd's own service; that may change. Until it does, record the game in the Trackd app,
export it to Photos or Files, then use <b>Upload video</b> after the game. Families still get the tracked video, just not live.</li>
<li><b>Any other camera:</b> look in its app's live streaming settings for a custom RTMPS server. Whatever the app can do, a game it has recorded can always be uploaded afterwards.</li></ul>
<h3>Live streaming from the camera's app</h3>
<ol class="steps">
<li>Open <b>Go live</b> and check it shows the right game. Under the red Start camera button, tap the green <b>Use an external app instead</b>.</li>
<li>Copy the <b>Server</b> and the <b>Stream key</b> into the app's Custom RTMP settings (each has a Copy button). The stream
key is that game's password, so don't share it. Every game has its own.</li>
<li>Start the stream in the app during the warm-up. The Go live page says <b>Live</b> once the site is receiving it.</li>
<li>After the final buzzer, stop the stream in the app, then tap <b>End game</b> on the Go live page. Forgot? The game
saves itself 20 minutes after the app stops.</li></ol>
<h3>Good to know</h3>
<ul class="steps">
<li><b>Families watch about half a minute behind the court.</b> Go live from the phone's camera is about a second behind.</li>
<li><b>The saved video is what reached the site</b>, so a weak signal at the stadium shows in it. (Go live records on the
phone, so its video doesn't have that problem.) If the app records the game too, keep that recording: ${h.c.ask} can put it in the video's place.</li>
<li><b>A gap in the stream</b> of under 10 minutes carries on the same video. After a longer one, the longest part is the
game's video and the others are kept as clips.</li>
<li><b>Try it at home first, for under a minute.</b> Anything that short is a test and isn't saved.</li>
<li><b>Changed your mind?</b> Until the app has streamed, tap <b>Use this phone's camera instead</b>.</li></ul>`);
