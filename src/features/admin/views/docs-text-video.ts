// The Documentation page's section on videos and live streaming: uploading, Go live, carrying on after a closed page,
// how a carried-on game's parts are joined, and an external app's stream, as src/features/videos/ and
// src/features/live/ do it.
import { html } from "../../../shared/html.ts";
import { code, type DocSection } from "./docs-blocks.ts";
import { joinDiagram, liveDiagram, uploadDiagram } from "./docs-diagrams-video.ts";

export const video = (): DocSection => ({ id: "video", title: "Videos and live streaming", body: html`
<p>Each game has one video. It either comes from a phone's camera, uploaded after the game, or from a live stream,
which the filming phone records as it goes (or, from an external app, which Stream records).</p>
<h3>Uploading</h3>
${uploadDiagram()}
<p>Stream makes the playback copy, and the 5-minute job asks it how it's going: about 20 to 25 minutes later the game
is ready to watch, and its HD MP4 download about 10 to 15 minutes after that. The original in R2 is deleted after
30 days, as Stream has its own copy by then.</p>
<h3>Live streaming</h3>
${liveDiagram()}
<ul class="docs-points">
<li><b>Go live</b> runs in Safari or Chrome, never the Home Screen app, where a locked phone can lose its microphone.</li>
<li><b>Which game:</b> the one being filmed, else today's next game still to finish (one starting within half an hour
before one under way that nobody is streaming), else the next one coming up.</li>
<li><b>Pause</b> (the warm-up, half-time) shows families a Game Break card and leaves the break out of the recording.</li>
<li><b>The camera stopping ends nothing.</b> The phone locks, a call comes or another app takes the camera: families see
the Game Break card and the recording waits (on a laptop, another tab does the same). A camera that comes back carries on
by itself. One the phone switched off for good comes back with <b>Resume camera</b>, a tap on every phone, as an iPhone
starts a camera only from one. It's the same video, with the gap left out. End game while it waits (or during a
Pause) is fine too: Safari can then write a frame with an impossible length, which would make Stream refuse the whole
video as too long, so the phone puts every such frame right before anything is kept or sent.</li>
<li><b>Why a new camera can take over:</b> the phone records the preview drawn onto a canvas and the microphone through
Web Audio, not the camera itself. The recording is always landscape, whichever way the phone was held when the camera
started. A recording that hands over nothing for 20 seconds says so on the camera screen with Reload and carry on, and
takes the warning back if it carries on by itself.</li>
<li><b>Only End game ends a stream, and it's final.</b> Under a minute recorded (pauses left out), or nothing recorded
at all, counts as a test and is thrown away, so a try at home leaves the game free to stream. A game carried on with
Carry on streaming is never a test, however soon End game is tapped after it. On a weak signal the page says how many minutes of the
game are still only on the phone.</li>
<li><b>Watching</b> uses short-lived signed links, so only signed-in members can play anything. A picture that freezes
asks whether the game has ended: if so the page shows the Full time card (the Game Break card's look) within seconds,
otherwise "Live stream will resume shortly". The player then asks for the picture again by itself every 15 to 20 seconds, so a stream that's
carried on comes back without a tap; the card's line to refresh after five minutes is a last resort. A picture the
family paused isn't frozen: no card comes up, and a tap on the picture plays it again.</li>
<li><b>The live bar:</b> while a game is streaming, a red LIVE NOW bar with Watch live runs along the top of the team's
pages (not Home or Watch games, which have the Live now card, nor Go live or that game's page). It reads only the
database: a stream the 5-minute job saw sending in the last 8 minutes and not ended.</li></ul>
<h3>If the page closes mid-game</h3>
<p>A closed tab, a phone that restarts or a flat battery doesn't lose the game. The same phone, opening Go live again,
is offered two buttons, at the top of the card and on screen without scrolling.</p>
<ul class="docs-points">
<li><b>Carry on streaming</b> puts the live picture back for families and keeps recording, as the same game's video. Only
the phone that was filming is offered it. It first makes sure the closed page has really stopped, which can take up to
two minutes, with a countdown.</li>
<li><b>Save what was recorded</b> ends the game there, with whatever reached R2 (it waits, asking again every 20
seconds, while a part arrived in the last two minutes, the recording began less than two minutes ago (its first part
may still be going up) or Stream still sees a phone; <b>Delete it and start again</b> is refused then too). If nobody taps either, the
5-minute job saves it by itself: half an hour after End game with nothing more from the phone (it had only its last
parts to send), or after 12 quiet hours where End game said minutes of the game were still only on the phone
(${code("live_streams.end_kept_minutes")}, from a weak signal: the parent may lock it and go home) or the page died
mid-game with no End game, so a phone has the night to reach Wi-Fi or better signal. Each save's outcome is a ${code("live_save")} line in Workers Logs.</li>
<li><b>What the closed page hadn't sent is kept.</b> What a page has recorded but not yet sent sits on the phone
(IndexedDB, ${code("golive-store.js")}). The reopened page sends it while the game streams again, and keeps it through
a second close too (${code("golive-kept.js")}).</li>
<li><b>Each start is its own part.</b> The recording after Carry on is a new part of the same video (a segment: a row
in ${code("recording_segments")}, with its own upload in R2 beside the first). A game can have several.</li>
<li><b>End game</b> completes every part. A part nothing reached R2 for is dropped, and if only one part has anything in
it, that part is the video and nothing needs joining.</li>
<li><b>It takes about ten minutes longer.</b> A carried-on game is ready to watch about ten minutes longer after End
game than one streamed in one go, as its parts are joined first.</li></ul>
<h3>How the parts become one video</h3>
${joinDiagram()}
<p>The parts are joined by the <b>video joiner</b>: a second small Worker, ${code("courtside-join")}, that runs ffmpeg in a
container on <b>Cloudflare Containers</b>. It's the one piece of the site that isn't the main Worker, as a Worker can't
run ffmpeg. The site hands it short-lived signed links to the parts in R2 and one to write the joined file to, and
nothing else: no team, no names, no database.</p>
<ul class="docs-points">
<li><b>Asked for, not waited for.</b> A join takes a few minutes (two 590 MB parts took under three), so the 5-minute
job asks for it and moves on. Every later run looks in R2 for the joined file first. Once it's there it becomes the
video's original, the parts are deleted, and Stream is asked for its copy as for any upload. The Log says so with a
${code("video_joined")} line: how many parts, how big, how long it took.</li>
<li><b>Nothing is deleted on trust.</b> The parts go only once the joined file has been read back from R2, and a joined
file far smaller than its parts is refused rather than saved.</li>
<li><b>A join that fails</b>, or is lost because the container restarted, is tried again every ten minutes. After six
tries the site stops: the team manager gets <b>Keep the first part</b> on the game's page, the Log's Problems has a
line, and the admins get the Video joiner alert as urgent. Keep the first part, or deleting the video, clears it once
no team's game is still waiting (the alert is one for the whole site).</li>
<li><b>The parts are copied as they are.</b> ffmpeg copies each part into one transport stream (a cut-off last frame
dropped, each part's own decoder settings carried along, one clock), then wraps that as the MP4, so the video is what
the phone recorded. Parts that aren't H.264 (a browser that records VP8, as Firefox on Android can) are joined one after
the other instead, still copied. WebM parts whose picture is H.264, as some Android browsers record, are copied into a
Matroska file, which Stream reads the same way. Only when the parts don't line up for a copy (a different size or
codec partway through, say) is the video encoded again, as a fallback, so the join still makes one video.</li>
<li><b>A recording Stream refuses is repaired once.</b> If Stream can't process a Go live recording (the iPhone can write
a frame with an impossible length, which makes Stream read the video as days long), the joiner copies it, as one part,
into a fresh file, and Stream is asked again: the Log's Problems says so, and the ${code("video_joined")} line says it was
repaired. The file Stream refused is kept until the repaired copy plays (or the video is deleted). Refused again, or
not repaired, the video fails as any does, Stream's reason first, with its ticket for the admins and its line in the
Log. An upload, a phone's own file, isn't repaired.</li>
<li><b>Every team gets its turn.</b> The joiner runs one join at a time for every team. Those waiting take turns by
team, so one team's games can't hold up another's, and each starts with the newest links the site sent.</li>
<li><b>Each part is read only as video.</b> ffmpeg reads every part as the recording's own kind of file (MP4 or WebM),
never as whatever its contents claim to be, so a part holding a list of other links or files fails the join instead
of fetching them.</li>
<li><b>Tested every night.</b> The 3am job has the joiner join two small test files that ship in its image, so a broken
joiner is known before a game needs it (Background jobs).</li></ul>
<h3>From an external app (RTMPS)</h3>
<p>An AI tracking camera films through its own app, so the page can't have the phone's camera. On the Go live
page, below the red Start camera button (don't tap it), is a smaller green <b>Use an external app instead</b>. It
only helps if the camera's app can stream to a custom RTMPS server with a stream key. XbotGo and Trackd are two
examples of many, as they stood at the time of writing: XbotGo's app can, Trackd's can't yet, so a Trackd game is
recorded in its app and uploaded afterwards. Makers change their apps, so Help says to check.</p>
<ul class="docs-points">
<li><b>Choosing it</b> sets the game to the app and shows its RTMPS server and stream key to copy. The key
is that game's password: it's shown only there, to people who film, and never logged. Going back to the phone's
camera works until the app has streamed. Who chose it, went back or stopped it is in the Log.</li>
<li><b>Stream records it</b>, so there's no recording on a phone and no original in R2: Stream's copy is the only one,
and it's only as good as the signal was.</li>
<li><b>Families watch</b> in the same player as a saved video, about half a minute behind the court (a camera stream
is about a second behind). Home, Watch games and the Log's Right now show it the same way.</li>
<li><b>Saving:</b> after End game (the one on the app's card: whoever chose the app, a coach or a team manager; the
camera's End game is refused for an app's stream), or by itself 20 minutes after the app stops. Stream finishes its recording 10
minutes after the app stops sending, and the 5-minute job then makes it the game's video. A gap under 10 minutes stays
one recording; after a longer one the longest part is the video and the others are clips. Under a minute is a test:
the stream closes and its input is switched off, and the next Go live reopens it on the phone's camera (the same input
while Stream still has it, a new one once the nightly clean-up has taken it), so Help and Go live tell whoever films to
choose the app again on game day and copy the Server and Stream key in afresh.</li></ul>`});

