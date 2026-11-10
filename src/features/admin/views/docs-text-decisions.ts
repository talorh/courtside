// The Documentation page's section on the technology decisions: what the site is built on, why each piece, and what
// was left out, so a reader knows the reasoning rather than just the result.
import { CLUB } from "../../../club.ts";
import { html } from "../../../shared/html.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";

export const decisions = (): DocSection => ({ id: "decisions", title: "Technology decisions", body: html`
<p>The site is for busy parents on game night, run by a volunteer. Every choice below follows from that: as little to
run as possible, nothing that can fall over at 7pm on a Friday, and a bill a club can carry. Where a choice was between
building something and leaning on the platform, the platform won.</p>
<h3>One platform</h3>
<p>Everything runs in one Cloudflare account: the Worker, its database, the uploaded files, the video, the photos, the
AI, the email, the code and the deploys. One login, one bill, one place to look when something's wrong, and no server
to patch. The alternative, a small VM with a video pipeline, a database and a CDN in front, would be more to run than
the site itself. The cost is about US$10 a month for the plans and a few dollars a team for its games' storage; the
admin area's Costs page reads Cloudflare's own bill and shows each team's share.</p>
${table(["Need", "Choice", "Why this and not something else"], [
		["The site", "A Worker, server-rendered HTML, no framework", "Pages are built as strings on the server and sent whole: fast on a weak signal, nothing to hydrate, and a strict Content Security Policy with no inline scripts. A front-end framework would add a build, a bundle and a class of bugs for pages that are mostly lists and forms."],
		["The data", "D1 (SQLite)", "One database for every team, every row carrying its team, and every query naming it. SQL that a reader knows, migrations in files, 30 days of Time Travel to undo a mistake. A document store would hide the one rule the site lives by: which team a row belongs to."],
		["Uploaded videos", "R2, multipart, pre-signed links", `The phone sends 16 MB parts straight to the bucket; the Worker only hands out links and completes the upload. A 3 GB game never passes through the Worker, a dropped connection carries on at the next part, and R2 charges nothing to serve it to Stream.`],
		["Live video", "Stream: WHIP in, WHEP out", "WebRTC from the phone's browser, no app to install, and families watching about a second behind the court. Stream can't record a browser's stream, so the phone records as it goes and uploads that; the recording is the game's video, at full quality whatever the signal did."],
		["Joining a game streamed in parts", "Cloudflare Containers", "ffmpeg needs a real process and a disk. A tiny Worker holds one container that wakes for a minute when a game needs joining and sleeps otherwise, so there's no always-on machine for something that happens a few times a season. The site never waits on it: the joined file in R2 is the only proof it trusts."],
		["Photos", "Cloudflare Images", "Private, resized on the fly, served through signed links that expire. The alternative was a second bucket and an image resizer; Images comes with the Stream bundle the site already pays for."],
		["Help and fixtures", "Workers AI, one model", "A helper that answers only from the person's own Help page, and a reader for any public fixture page. One model named in one place, tried on staging first. No API keys to a third party, and no data leaves the account."],
		["Sign-in", "The site's own: an email code, then a 30-day session", "Nothing to remember, nothing to install, and no per-seat cost: a club's families can be any number. Turnstile keeps scripts from asking for codes, and the limits make the six digits useless to guess. Cloudflare Access did this first and was dropped when it priced per person past fifty."],
		["Email", "Email Sending from the club's own domain", "Codes, welcomes and alerts come from one address the binding alone can send as, with SPF, DKIM and DMARC set. No mail provider account."],
		["Jobs", "Two cron triggers: every 5 minutes, and 3am", "A job asks Stream how each video is going, so no webhook has to find its way into the site. Everything is safe to run twice: a job reads the current state each time, and a retry of a step that worked is told it's done."],
		["Code and deploys", "Cloudflare Artifacts and Workers Builds", `The code sits in the account beside the site; a push to ${code("main")} is checked again by Workers Builds and deployed, with the changelog line as the deployment's message. The release script refuses to push unless every check passed, nothing is uploading or streaming, and the commit was tried on staging.`],
		["Staging", "A Worker Preview of the same Worker", "The same code, told it's staging at build time, on its own database and bucket, deployed from the computer in a minute. Every change is tried there on real phones before it goes live."],
	])}
<h3>Roads not taken</h3>
${table(["Not this", "This instead", "Because"], [
		["Phone apps for streaming", "The browser's camera and WebRTC", "Every app needed installing and setting up, and each phone was different. A page everyone already has works on every phone the same way."],
		["Webhooks from Stream", "Polling every 5 minutes", "A webhook needs a public endpoint, a secret and retries of its own; the job does the same work with none of that, and nothing outside needs a way in."],
		["A JavaScript framework", "Server-rendered pages and small page scripts", "The pages are lists and forms. The few things that need a script (uploads, Go live, the live player, photos) are plain ES modules, one job each."],
		["Several videos a game", "One video a game, with clips", "A second video wasn't useful to anyone, and it would have added a main-video rule and a switcher to every page."],
		["Comments, chat and stats", "Nothing", "Teams have those elsewhere. The site does game video and photos, privately, and stays small enough to keep working."],
		["Per-environment settings for the AI model", "One model in the code", `Staging and the live site must run the same model, or staging proves nothing. A new model is a code change: tried on staging, then released.`],
		["Keeping originals forever", "30 days in R2, then gone", "Stream holds the playback copy and the HD download; the original is only the file Stream copied from. A season's games would otherwise cost more in storage than everything else together."],
	])}
<p>The club's own choices (its names, colours, league, time zone and currency) sit in one file, ${code("src/club.ts")},
and where it runs in another, ${code("deploy.config.ts")}, so a club changes two files and nothing else. For
${CLUB.siteName}, the rest of this Documentation says how each piece is set up and run.</p>`});
