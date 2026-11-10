// The Documentation page's fair use policy: what a team may reasonably put on the site and take from it, with the
// limits the code enforces beside each. Written for teams, kept on the admin page until it's shared with them.
import { html } from "../../../shared/html.ts";
import { type DocSection, table } from "./docs-blocks.ts";

export const fairUse = (): DocSection => ({ id: "fairuse", title: "Fair use", body: html`
<p>The site is paid for by its owner and built for one thing: each team's own game footage and photos, for that team's
families. These are the limits that keep it that way. They're written for teams and will be shared with them in time;
for now they live here.</p>
${table(["What", "Fair use", "The hard limit"], [
		["Videos", "One video for each of your team's own games, the whole game in one file: about 30 to 40 a season. Not training, not other teams' games, not anything else.", "One video a game, up to 30 GB; a game set to No video can't be uploaded to"],
		["Live streams", "Your team's games only, from the Go live page (its camera, or an external app for an AI tracking camera), one stream a game.", "Only games marked Live stream on the fixture; a stream under a minute is treated as a test and thrown away"],
		["Highlight clips", "A few a game, the moments worth keeping. Not the whole game cut into pieces.", "50 clips a game, each 3 seconds to 5 minutes"],
		["Photos", "Photos of your team's games and team events, taken by the team: up to about 50 a game day and a few hundred a season. Not screenshots, memes or anything from elsewhere.", "10 MB a photo, redrawn to 2560 px. No count stops a team, so the nightly checks watch the numbers"],
		["Watching", "Watch any game as often as you like: that's what it's for. Don't leave a video looping or playing to an empty room.", "None; a team's viewing shows on its Costs page"],
		["Downloads", "The HD video and photos for your own household's keeping. Not for posting publicly or passing to anyone outside the team: these are children.", "Every download is logged with who took it: a game's video, a clip or a photo, each photo in a zip too"],
		["People", "Your team's families and coaches, one account each with their own email. Remove people when they leave the team.", "The team's list is checked on every request; codes go only to addresses on it, 10 an hour and 20 a day each"],
		["Squad", "Players' first names and numbers only.", "10 players"],
		["Ask and Support", "Ask Virtual Team Manager what you need, and raise a ticket when Help can't answer.", "20 questions a day; 5 tickets and 20 replies a day"],
	])}
<h3>Why it matters</h3>
<p>Each team's season is budgeted at about $200 (in the club's currency), covering its own storage, watching and uploads and its share of the
site's fixed costs. Within fair use a season costs far less: a game's video costs under 50 cents a month to keep and
under 10 cents each time it's watched, and photos are included in the plan. Costs shows every team against its budget
and raises an alert when one is heading over.</p>
<h3>How long things stay</h3>
<p>Everything a team puts up is deleted at the end of 31 December of the year its season ends. Nothing is archived, so
families download what they'd like to keep before then.</p>
<h3>When something's outside fair use</h3>
<p>The team manager is asked first. The site's admin can remove a video, clip or photo, or a person's access, and does
when something risks the children's privacy or the site's cost.</p>`});
