import { CLUB, mailFrom, onSubdomain } from "../../../club.ts";
// The Documentation page's opening sections: what the site is, and how it's set up on Cloudflare.
import { html } from "../../../shared/html.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";
import { placementDiagram, systemDiagram } from "./docs-diagrams-core.ts";

export const overview = (): DocSection => ({ id: "overview", title: "The site at a glance", body: html`
<p>Courtside (${CLUB.domain}) is a private site where each team keeps its game videos and photos. Families sign in
with a code sent to their email, watch and download the games, and add photos. Those set to Watch and film upload a game's video
or stream it live from their phone's browser. Team managers run their team, and site admins look after the whole
site from this admin area.</p>
<p>The whole thing is one Cloudflare Worker, called ${code("courtside")}, in one Cloudflare account, Courtside. It
draws the pages on the server and answers a small API for the upload, Go live, Photos and Ask pages. Everything it
keeps lives in Cloudflare too: the data in D1, uploaded videos in R2, playback copies in Stream and photos in Images.</p>
<p>It has one helper, the video joiner: a second small Worker, ${code("courtside-join")}, that runs ffmpeg in a container on
Cloudflare Containers. When a live stream was stopped and carried on, it joins the parts into one video (Videos and live
streaming). Nothing else runs outside the main Worker.</p>
${systemDiagram()}
<ul class="docs-points">
<li><b>One database for every team.</b> Every team's rows carry its team, and every query names it.</li>
<li><b>Big files skip the Worker.</b> Phones send videos straight to R2 and photos are signed links from Images, so
the Worker only ever handles small requests. The joiner is handed signed links too, never the files.</li>
<li><b>Nothing waits on a callback.</b> A job every five minutes asks Stream how each video is going, so no outside
service needs a way in.</li>
<li><b>Everything is safe to run twice.</b> Jobs read the current state each time, and a phone retrying a step that
already worked is told it's done.</li></ul>`});

export const platform = (): DocSection => ({ id: "cloudflare", title: "Cloudflare setup", body: html`
<p>Everything runs in the club's own Cloudflare account (its id in ${code("deploy.config.ts")}), on the
Workers Paid plan (US$5 a month) with the Images and Stream bundle (US$5 a month), and ${onSubdomain()
		? html`a subdomain of the club's own ${CLUB.zone}, a zone in the same account that the club's website shares`
		: "the domain registered through Cloudflare Registrar, renewing by itself, with DNSSEC on"}. Each piece below is one Cloudflare product; the Glossary says
what each is in plain English, and the dashboard's left-hand menu is organised the same way (Compute for the Worker,
Artifacts, Builds and Containers; Storage &amp; databases for D1 and R2; Images &amp; Stream; Email; the domain under its zone).</p>
${table(["Piece", "What it is", "What it's for"], [
		["Domain", html`${code(`${CLUB.domain}`)}, its zone id in ${code("deploy.config.ts")}`, onSubdomain()
			? `A subdomain of the club's own ${CLUB.zone}: the zone's rules for the site are its own, each matching ${CLUB.domain} alone, and the zone's own settings stay the club's`
			: "Registered at Cloudflare, renewing automatically, with DNSSEC on"],
		["Worker", html`${code("courtside")} on the custom domain ${CLUB.domain} only`, "Every page, the API, the sign-in and the scheduled jobs. Its workers.dev address is off"],
		["D1", html`${code("courtside")}, in the region nearest the club`, "All the site's data, with 30 days of Time Travel to undo a bad change"],
		["R2", html`${code("courtside-originals")}, in the same region`, "Uploaded videos (deleted after 30 days, once Stream has its copy) and the nightly backups (kept 14 days, locked so nothing can delete or overwrite one before then)"],
		["Stream", "The account's Stream", "Playback copies, highlight clips, HD downloads and a live input for each streamed game. Signed links only"],
		["Images", html`Variants ${code("thumb")} (512 px) and ${code("large")} (1600 px)`, "Photos, private, shown only through signed links that last six hours"],
		["Workers AI", html`The ${code("AI")} binding`, "One model (Gemma 4, platform/workers-ai.ts): Ask Virtual Team Manager, which answers from the person's own Help page, the Documentation AI assistant, and reading PlayHQ fixture pages"],
		["Email Sending", html`From ${code(`${mailFrom()}`)}`, "Sign-in codes, welcomes, support tickets and the site's alerts"],
		["Email Routing", html`${code(`security@${CLUB.domain}`)}`, "Where security reports go (named on the site's security.txt), forwarded to the owner"],
		["Artifacts", html`Repository ${code("courtside/courtside")}`, "The site's code, hosted by Cloudflare in this account; a push to its main branch is a deploy (Where the code lives)"],
		["Workers Builds", "On the courtside, courtside-maintenance and courtside-join Workers, branch main only", "Checks every push to main again and deploys it; the two small Workers only when their folders change (Where the code lives)"],
		["Turnstile", html`Widgets ${code("courtside sign-in")} (${CLUB.domain}) and ${code("courtside staging sign-in")}, managed`, "The sign-in page's check that a person is asking for a code, before any email goes"],
		["Maintenance Worker", html`${code("courtside-maintenance")}`, `The Back soon page, which takes over ${CLUB.domain} only while it's switched on`],
		["Video joiner (Cloudflare Containers)", html`${code("courtside-join")}: a small Worker whose Durable Object runs one container with ffmpeg. Instance type ${code("standard-1")}: half a vCPU, 4 GiB of memory, 8 GB of disk. One instance, wherever Cloudflare has room`, "Joins a carried-on live stream's parts into one video. The site reaches it through its JOINER binding and hands it signed links only. It has no address of its own, sleeps after ten quiet minutes and wakes when asked. Its image is in Cloudflare's registry, built by npm run join -- image"],
	])}
<h3>Where the Worker runs</h3>
<p>The Worker's placement is set to a region in ${code("deploy.config.ts")} (${code("aws:ap-southeast-2")}, Sydney, for a club
in Melbourne). That's Cloudflare's way of naming a place: it runs the Worker in its own data centre nearest that cloud
region. Nothing runs on AWS and nothing is billed there, and placement costs nothing extra: a Worker is charged by
requests and CPU time wherever it runs.</p>
${placementDiagram()}
<p>Beside the database, because a page runs several queries one after another. Left to the default, the Worker runs
wherever the request arrives, and when a phone network sends a local phone through another continent, every query
crosses an ocean and a page takes seconds. Pinned beside the database, each query takes a millisecond or two and the
person pays one hop to the region. The zone's protections still run at the
data centre nearest the person, and every answer carries a ${code("cf-placement")} header (${code("remote-SYD")}) that
shows the placement working. Smart Placement would most likely settle on the same place, but only after watching traffic,
and with a sample of requests left unplaced; naming the region is Cloudflare's advice for one database in one known
place. Read replicas add nothing when everyone who uses the site is in one region.</p>
<h3>Protection at the edge</h3>
<p>The site's own sign-in is the main gate. Before a request even reaches it, the zone's rules turn away attacks and
anyone who isn't a real browser.</p>
${table(["Protection", "What it does"], [
		["DDoS protection", "Network and HTTP floods are absorbed automatically, at high sensitivity"],
		["Managed WAF rules", "Cloudflare's free managed ruleset blocks known attacks"],
		["Allowed methods", "Only the request methods the site uses get through"],
		["Human check", "A page load from someone not signed in gets Cloudflare's \"verify you are human\" check first. Never the API or static files. The sign-in form itself has Turnstile too (Signing in)"],
		["Rate limiting", "More than 60 writes or API calls in 10 seconds from one address are blocked for 10 seconds"],
		["Bots", "AI crawlers are blocked, and every page tells search engines not to index it"],
		["HTTPS", "HTTP redirects to HTTPS, and HSTS (with preload) is sent on every answer"],
	])}
<h3>Email and DNS</h3>
<p>The site sends from ${code(`${mailFrom()}`)} only, through Email Sending's binding, which refuses any other
sender. Its SPF and DKIM records sit on ${code(`cf-bounce.${CLUB.domain}`)}. DMARC reports go to Cloudflare's DMARC
Management, which shows who sends mail as ${CLUB.domain}. The domain's own SPF and a DMARC policy of
reject mean mail forged in ${CLUB.domain}'s name is refused. Email Routing forwards ${code(`security@${CLUB.domain}`)}.</p>
<h3>Keys and secrets</h3>
<p>Secrets are stored on the Worker, never in the code. Most services are bindings and need no key at all.</p>
${table(["Secret", "What it unlocks"], [
		[code("STREAM_API_TOKEN"), "Every call to Stream: copies, clips, downloads, live inputs (token courtside-stream-clips, Stream Edit)"],
		[code("STREAM_KEY_ID, STREAM_KEY_JWK"), "Stream's signing key, to sign playback links without a call each time"],
		[code("R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"), "Signed upload links for the originals bucket only (token courtside-r2-originals)"],
		[code("CF_INSIGHTS_TOKEN"), "Read-only analytics and billing: Platform's Cloudflare figures, the Worker's errors on Insights' Alerts, and for Costs Stream's minutes watched by video and Cloudflare's bill (token courtside-insights-read, with Billing Read)"],
		[code("TURNSTILE_SECRET"), "Checking the sign-in page's Turnstile tokens with Cloudflare (staging has its own widget and secret)"],
	])}
<h3>Cloudflare's own alerts</h3>
<p>Cloudflare emails the owner when the month's spend passes US$50 and US$100, when the Worker starts failing in a new
way, when it stops an HTTP DDoS attack, when the certificate changes, and if someone reports abuse. These work even if
the Worker itself is down, alongside the site's own alerts on Platform and Insights.</p>
<h3>Outside the account</h3>
<p>Costs reads the day's US dollar rate for the club's currency from Frankfurter (the European Central Bank's reference
rate; free, with no key), a few times a day, and keeps the last one if it doesn't answer.</p>`});
