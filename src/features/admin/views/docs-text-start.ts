// The Documentation page's opening section for a new admin: what the site is, what the admin area's pages are for,
// the routine, the rules that matter, and where to read more.
import { html } from "../../../shared/html.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";

export const start = (): DocSection => ({ id: "start", title: "Start here", body: html`
<p>Courtside is a private website where each Saints team keeps its game videos and photos for its
families. It runs entirely on Cloudflare, in one account called <b>Courtside</b>, as one program (a Worker) with
one database, plus a small helper that joins a live stream's parts into one video. Team managers run their own teams; a site admin looks after the whole site from this admin area, and can
open any team to help. This page explains how it all works. If Cloudflare's words are new to you, the Glossary at the
end puts each one in plain English.</p>
<h3>What you need</h3>
<ul class="docs-points">
<li><b>Your email on the Admins page</b>: that's what makes you an admin. You sign in like everyone else, with a code.</li>
<li><b>A seat in the Cloudflare account</b>, for the dashboard and the ${code("cf")} command line: the owner invites you.</li>
<li><b>The code</b>, if you'll change anything: two folders from the site's own repository (Where the code lives), one
for staging and one for production, and a ${code("cf")} login bound to each.</li></ul>
<h3>The admin area, page by page</h3>
${table(["Page", "What it's for", "When you look"], [
		["Insights", "Is the site all right, in one answer, with every check as a light and what needs an admin (tickets waiting, removal requests, a team without a manager); then the whole site in numbers over 12 weeks, mobile against desktop, and the teams side by side. Counts only, never anyone's email.", "Whenever you open the admin area: it's the landing page"],
		["Teams", "Onboard a team; open any team as its team manager, or view it as any role; each running team's setup progress; end a season, reopen, or delete a team tonight.", "A new team, or a team manager asking for help"],
		["Support", "Team managers' questions and the site's own monitoring tickets, with replies, private notes and status.", "Daily, and whenever an email says a ticket's waiting"],
		["Platform", "The site's health, each thing once: every figure watched with its limit and alert, last night's backup and clean-up, Cloudflare's last 30 days.", "Weekly, and when an alert is raised"],
		["Costs", "What each team costs on Cloudflare, this month and this season, against its budget, in Australian or US dollars.", "Monthly, and when the Team budgets alert is raised"],
		["Admins", "Who the site's admins are.", "Adding or removing an admin"],
		["Changelog", "One line for every deploy, newest first: what changed on the site and when.", "After a release, or when someone asks what changed"],
		["Log", "What's happening right now in every team (live streams, uploads, processing, removal requests waiting), then everything that happened: who changed what, videos and photos, every sign-in attempt from the last month, and anything that didn't work (Problems), each with the device it came from.", "Game nights and the morning after; something odd about a sign-in, or a problem; who changed what"],
		["Documentation", "This page.", "Now"],
	])}
<h3>The routine</h3>
${table(["When", "What"], [
		["Most days", "Open the admin area: Insights says all green and nothing needs you, or what does. A ticket from a team manager gets an answer the same day."],
		["Game nights (Friday to Sunday)", "Nothing is released. The Log's Right now shows streams going live and uploads arriving, and its Problems anything that didn't work on a phone or on the site; a video that fails raises a ticket by itself."],
		["Weekly", "Platform: the backup ran last night and passed its checks; the clean-up ran; nothing near its limit."],
		["Monthly", "Costs: each team against its budget, and the whole site's bill. Cloudflare emails the owner at US$50 and US$100 of spend."],
		["Each October", "New teams onboarded for the season (Teams); last season's teams are closed and deleted on their dates by themselves."],
	])}
<h3>The rules that matter</h3>
<ul class="docs-points">
<li><b>Absolutely private.</b> Every page and file sits behind the sign-in. Nothing about a child or a family is ever public, and no real player is named outside their own team's pages: Help and tests use made-up names.</li>
<li><b>Every change goes to staging first, then live through one command</b>, ${code("npm run release")}, which refuses to deploy unless every check passes (Environments and releases). Nothing is deployed any other way.</li>
<li><b>No releases on game days</b>, unless it fixes something broken: families rely on the site then.</li>
<li><b>Cloudflare changes need the owner's go-ahead</b>: anything that deletes data, costs money or changes the account's settings. Reading is always fine.</li>
<li><b>Everything the site needs lives in the club's own Cloudflare account</b>, and nowhere else.</li></ul>
<h3>Where to read more</h3>
<p>Read this page's sections in order: they go from what the site is, through how it works, to how it's run and how it's
released. The repository's ${code("README.md")} is the same story for people reading the code; ${code("docs/spec.md")}
is what the site is meant to do, ${code("docs/architecture.md")} how it does it, and ${code("docs/runbooks/")} the
step-by-step for the Cloudflare setup, staging and the maintenance page. When something's unclear, ask the owner.</p>`});
