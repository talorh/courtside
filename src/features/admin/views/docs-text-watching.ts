// The Documentation page's sections on what members do day to day: watching, highlight clips and coaches' notes; and
// Home, the desktop view, the Home Screen app, Notifications and removal requests.
import { html } from "../../../shared/html.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";
import { clipDiagram, removalDiagram } from "./docs-diagrams-features.ts";

export const watching = (): DocSection => ({ id: "watching", title: "Watching, clips and coaches' notes", body: html`
<h3>Watch games and a game's page</h3>
<ul class="docs-points">
<li><b>Watch games</b> lists the season's games oldest first, upcoming ones at the bottom, filtered by competition, each
card showing its state: ready to watch, processing or uploading, upcoming, waiting for video, or No video. A video a
member hasn't opened is tagged New for 21 days (not for whoever uploaded it), from who opened what, kept 30 days.
Each member's starred games and clips sit at the top.</li>
<li><b>A game's page</b> plays the video through a signed link that runs out, remembers how far in the phone or
computer got (Carry on from), and has Watch full screen for a computer on the TV.</li>
<li><b>Download HD video</b> is Stream's HD MP4, made the first time anyone asks (the page says it's being prepared).
Every download is logged with who took it, a clip's and a photo's too, and the log is kept two years. On an iPhone or iPad a clip's Save opens the
share menu so it lands in Photos; a whole game, 1 to 3 GB, goes to Files with how to move it to Photos.</li>
<li><b>Team managers</b> can move a video to another of the team's games without one, and delete it: it leaves the
site at once, but its media is kept a day in case that was a mistake.</li></ul>
<h3>Highlight clips</h3>
${clipDiagram()}
<ul class="docs-points">
<li><b>Making one:</b> any member marks a start and an end while watching, 3 seconds to 5 minutes apart, and gives it a
label; a game has 50 clips at most. Stream's clip API isn't on the Worker's binding, so the Worker asks Stream's REST
API, with a token that can only use Stream (${code("STREAM_API_TOKEN")}).</li>
<li><b>Ready:</b> each 5-minute run asks Stream how processing clips are going; a ready one has its MP4 started, so it
can be downloaded, and a failed one is marked failed.</li>
<li><b>Who's in it:</b> players ticked when it's made, or later by its maker or a team manager. At the season's end
the pack lists each player's clips under their name.</li>
<li><b>Removing:</b> only a team manager deletes a clip; anyone else, its maker included, asks for it to be removed.
Deleting takes Stream's copy first, so a failure leaves the clip to try again, and a game's clips go with its video.</li></ul>
<h3>Coaches' notes</h3>
<p>Private notes on a game, for members whose role is exactly Coach: not Watch only, Watch and film or team managers,
and the panel says so. A note can be at a time in the video, or about the whole game. Either coach can delete any
coach's note, and a game's notes export to Excel, in the order the page shows them.</p>
${table(["Table", "Holds"], [
		[code("clips"), "Each clip: its video, start and end, label, Stream copy, state and maker"],
		[code("favourites"), "Each member's starred games and clips"],
		[code("downloads"), "Every game's video downloaded, with who took it: kept two years"],
		[code("media_downloads"), "Every clip and photo downloaded (each photo in a zip too), with who took it and the file it came as: kept two years"],
		[code("video_views"), "Who opened which video, for the New tag: kept 30 days"],
		[code("coach_notes"), "The coaches' notes, with their time in the video if they have one"],
	])}`});

export const home = (): DocSection => ({ id: "home", title: "Home, notifications and removal requests", body: html`
<h3>Home</h3>
<p>The landing page after sign-in: the court picture with the team's name, big Upload video and Go live buttons for
those who film, Watch games, then the Roster, Fixture, Photos and Help, the latest game with its score, what's coming
up, and the squad. Each game's line on its page ("The Saints take on Northside 2 at Saints Stadium, Court 1.") comes
from templates, not AI, so nothing is made up about the players and a game always gets the same line: the club's, or the
team's own for any group its team manager changed (Manage team, Game lines, ${code("game_lines")}), checked as they're
saved and in the Log. Team managers see when the season's
videos and photos go, pointing to the end-of-season pack.</p>
<h3>On a computer, and on the Home Screen</h3>
<ul class="docs-points">
<li><b>The desktop view</b> is one stylesheet (${code("public/desktop.css")}) whose every rule sits inside one media
query: a window at least 1024px wide, a pointer as fine as a mouse, and real hover. A phone or a touch tablet fails it
and keeps the phone's view to the pixel, and so does a narrow window on a computer. The page's HTML is the same either
way; the top bar becomes a sidebar and Go live is left out, as nobody streams from a desktop.</li>
<li><b>Switch to mobile view</b> on a computer turns the desktop view off at any width, and Switch to desktop view
turns it back on. The choice is kept on that device in a cookie for 30 days (${code("public/view.js")}), which also tells
the site which view each device uses: the Log notes it when it's first seen or changes, and Insights counts them.</li>
<li><b>On a phone's Home Screen</b> the site opens full screen like an app, on a green launch screen. A page can be
pulled down to refresh, except mid Go live, mid upload or while photos are being added. Go live opens in Safari or
Chrome instead, as a phone locked for a moment in the Home Screen app can lose its microphone for good.</li></ul>
<h3>Notifications</h3>
<p>For team managers: what's uploading, processing or waiting for its HD MP4 now, and the last 30 days of uploads,
videos ready or failed, HD copies ready, clips and removal requests, refreshed every 2 minutes. It's read from the
team's activity feed (${code("activity")}, kept 90 days). The admin Log shows the same for every team: what's happening
in its Right now, and the feed as lines in its Videos and Photos.</p>
<h3>Removal requests</h3>
${removalDiagram()}
<p>Any member can ask for a video, a clip or a photo to be removed, with a reason: a family whose child shouldn't be
shown, say. The team manager sees it on Manage team (a photo's request shows the photo) and in Notifications, and the
admins see every team's waiting requests on Insights. Deleting closes every open request for it; keeping closes them
with the team manager's note. Requests are kept even after what they named has gone.</p>
${table(["Table", "Holds"], [
		[code("removal_requests"), "Requests to remove a video: who asked, why, and how it was settled"],
		[code("clip_removal_requests"), "The same for clips"],
		[code("photo_removal_requests"), "The same for photos"],
	])}`});
