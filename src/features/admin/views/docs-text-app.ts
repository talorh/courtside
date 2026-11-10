// The Documentation page's sections on how the site works: requests, signing in, teams and roles, and photos.
import { html } from "../../../shared/html.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";
import { requestDiagram, signInDiagram } from "./docs-diagrams-core.ts";
import { photoDiagram, teamLifecycleDiagram } from "./docs-diagrams-more.ts";

export const requests = (): DocSection => ({ id: "requests", title: "How a request is handled", body: html`
<p>Every page, form and page script call goes through the same checks, in the same order, before the page itself
runs. The pages are plain HTML drawn on the server, with small scripts for the pages that need them (uploading, Go live,
Photos, Ask) and no framework.</p>
${requestDiagram()}
<ul class="docs-points">
<li><b>Before the sign-in:</b> a write from another website is refused, and only the sign-in pages, their few files,
the opening spinner and security.txt answer without a session. Even the site's static files need one.</li>
<li><b>The current team</b> comes from a cookie, so every team shares the same addresses. Someone in one team just
has it; someone in several picks with Switch team.</li>
<li><b>Every write names its team.</b> Each form and page script says which team it was made for, so a page left open on
one team can never save into another. A closed team is read-only.</li>
<li><b>Errors</b> come back as a plain page (or a JSON answer for the API), are logged with their team, and every
server error is counted by the hour for Platform's alert.</li></ul>`});

export const signIn = (): DocSection => ({ id: "signin", title: "Signing in", body: html`
<p>There are no passwords. Someone types their email, gets a six-digit code by email, types it, and stays signed in for
30 days on that device. A code is only ever sent to an address on a team's list, or a site admin's, and only once
Cloudflare Turnstile says a person, not a script, asked: the check is invisible unless Cloudflare wants a tap, and if
Cloudflare can't be reached the code still goes, with the limits below holding.</p>
${signInDiagram()}
${table(["Limit", "Why"], [
		["10 codes an hour for one address (then a 15-minute wait, again while the hour still has 10), and 20 a day (then a day's wait)", "Stops one inbox being flooded, and code after code being guessed. A team manager can end the wait from Manage team"],
		["15 wrong codes a day for one address, then a day's wait", "However many internet addresses try, a code can't be guessed. A team manager can end the wait"],
		["30 codes in 15 minutes from one internet address", "Stops one device asking for everyone's codes; generous enough for a gym's Wi-Fi"],
		["10 unknown addresses in 15 minutes from one internet address", "Makes guessing who's on a list slow"],
		["200 codes an hour across the whole site", "Past it, codes pause and the admins get a Sign-in flood ticket"],
		["30 wrong codes an hour from one internet address, and five a code", "Makes guessing a code hopeless"],
	])}
<p>The session's token lives in a secure, HttpOnly cookie, and only its hash is kept in D1, with the device's name and,
once its first page says (a second cookie the page sets), which view it uses: the mobile view, or the desktop view on a
computer. The Log says when that's first seen or changes, and Insights sets mobile against desktop, counting each device
once a week. On every request the Worker checks the teams' lists again, so taking someone off a list works straight away. When a
session has under four hours left, Go live asks for a new code first, so it can't run out part way through a game.</p>`});

export const teams = (): DocSection => ({ id: "teams", title: "Teams and roles", body: html`
<p>Each team is one season's squad. A person can be in several teams, with a role in each. Roles come only from the
team's list in D1.</p>
${table(["Role", "Can do"], [
		["Watch only", "Watch, download, make highlight clips, star favourites, add photos and delete their own, and ask for something to be removed"],
		["Watch and film", "Everything Watch only can, plus upload a game's video and Go live (the usual role for a parent)"],
		["Coach", "Everything Watch and film can, plus private notes on each game"],
		["Team manager", "Runs the team: people, players, the fixture, the roster, scores, deleting things and removal requests"],
		["Site admin", "This admin area, and any team, opened as its team manager or viewed as any role"],
	])}
<p>A new team's Manage team starts with a setup checklist (at least 7 players in the squad; someone set to Watch and film, the coach and a
team manager; the fixture; the roster), gone once it's all done; admin Teams shows each running team's progress on it.</p>
${teamLifecycleDiagram()}
<p>A team is running, then closed at the end of its season (read-only straight away), then deleted with all its
footage on the night it's due: 31 December of the year its season ends, unless an admin picks an earlier night. Until
then, Manage team's end-of-season pack lists every game's HD video (with one button to get them all made), each
player's clips and where to save the photos and roster.</p>`});

export const photos = (): DocSection => ({ id: "photos", title: "Photos", body: html`
${photoDiagram()}
<ul class="docs-points">
<li><b>Adding:</b> anyone on the team chooses photos, or on a computer drops them on Add photos. Each is read on the
phone or computer for when it was taken (EXIF DateTimeOriginal, from the start of the file), then redrawn at most
2560 px along its longer side as a JPEG (quality 0.88), which turns it upright and leaves off everything else the
camera saved, where it was taken included. They're drawn one at a time, as a phone has room to draw only so many,
and sent after the first goes alone, so a refusal that would stop them all (signed out, say) stops at the first. Then
three at once if the first was in within 5 seconds, or else one at a time, and one at a time for the rest after any
dropped connection: on a weak signal three at once share it, and none may be in before it drops. A dropped connection
is waited out and tried again; one the site turns down is listed and the rest carry on. A page left before they're all
sent says how many weren't, the next time Photos is opened on that phone (kept in its browser for a day).</li>
<li><b>In the Worker:</b> 10 MB at most, checked as a whole JPEG with any metadata left taken out. Its row is saved
first, out of sight, so the photo has its number; then Images keeps it privately, named as it downloads
(${code("saints-b12-1-<date>-photo-<id>.jpg")}), and the row is filled in. A photo with no date, or one still to come,
gets the time it was added.</li>
<li><b>Looking:</b> newest taken first under each day, 60 a page, through signed links that last six hours. A photo's
page has Newer and Older (on a phone a swipe slides between photos in place, the neighbours' pictures already on the page: public/photo-swipe.js) and Download photo.</li>
<li><b>Several at once:</b> Select photos ticks them, then Download sends them as one zip (stored, written a photo at a
time so a page of 60 is never in memory at once), or on an iPhone opens the share menu with them all; Delete deletes
them together, all or none, offered only when every one is the member's own (or for a team manager).</li>
<li><b>Deleting:</b> whoever added a photo, or a team manager, deletes it, Images first; anyone else asks for it to be
removed.</li>
<li><b>Every download is logged</b> with who took it, a photo's alone or each one in a zip, and kept two years.</li>
<li><b>Saving on an iPhone</b> goes through the share menu, so photos and clips land in Photos rather than Files.</li></ul>
<p>Everything a team keeps (videos, clips and photos) is deleted with the team at the end of 31 December of the year
its season ends, ${code("delete_after")} on each row.</p>`});
