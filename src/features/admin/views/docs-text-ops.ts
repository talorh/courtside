// The Documentation page's sections on running the site: the data, monitoring, recovery and the code.
import { html } from "../../../shared/html.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";
import { dataDiagram } from "./docs-diagram-data.ts";
import { alertDiagram, recoveryDiagram } from "./docs-diagrams-more.ts";

export const data = (): DocSection => ({ id: "data", title: "The data", body: html`
<p>D1 holds everything but the media itself. Times are kept in UTC, apart from a game's start and a photo's date, which
are local time as people see them. Changes to the database are numbered migrations, applied to the live database
before the release that needs them, and never edited afterwards. Each adds beside what's there rather than changing it in
place: the live site keeps running on the database between the migration and the release, so a new value or column goes
in next to the old, the release reads either, and a later migration drops the old once the release is known good.</p>
${dataDiagram()}
${table(["What", "How long it's kept"], [
		["Videos, clips and photos", "Until the end of 31 December of the year the team's season ends"],
		["A deleted video", "Gone from the site at once; its copies are kept one more day, in case it was a mistake"],
		["A deleted video, clip, game or photo's row", "90 days, unless the download log or a removal request names it. A deleted game from PlayHQ stays while its PlayHQ fixture is on the site, so the next check doesn't add it again"],
		["Uploaded originals in R2", "30 days (unfinished uploads 7 days)"],
		["Download log", "Two years"],
		["Notifications' activity", "90 days"],
		["Sign-in codes and events", "A day, and a month (the Log shows the events)"],
		["Problems (anything that failed)", "A month (the Log's Problems)"],
		["Devices a week, by view", "12 weeks (Insights' Mobile and desktop)"],
		["Database backups", "14 days"],
	])}`});

export const monitoring = (): DocSection => ({ id: "monitoring", title: "Monitoring and support", body: html`
<p>The site watches itself and raises a ticket on the Support desk only when something needs doing, emailing the admins
once. It emails again only if things get worse, resolves the ticket by itself when it clears, and never sends
reminders. Two checks of the same thing at once (a job's run and Check again) still raise one ticket, and one email.</p>
${alertDiagram()}
<p>The admin area's <b>Log</b> starts with what's happening right now in every team, then shows what admins and team
managers change (teams, people and players, letting someone sign in, games added, changed or deleted, and videos deleted
or moved), the teams' videos and photos (uploads, processing, clips, Go live, photos added and deleted, removal
requests), and every sign-in attempt from the last month, with the internet address it came from: a code sent, a wrong
code, an email on no list, a limit reached, a failed robot check, a Request access try. It also says which view each signed-in device uses,
the mobile view or the desktop one, when a device's first page says and whenever it switches, and which device every
line from a person came from. Its <b>Problems</b> are anything that failed: a page or request that failed, a job's
step, an email that didn't send, Stream, PlayHQ, Images, Cloudflare or the AI not answering, and what the phones report
(Go live's camera or sound lost, its connection dropping, an upload or photos that stopped, up to 30 a person an hour). The same problem again within
half an hour counts on its line, so an outage is a line. Filter it by group, and by day in the club's time zone: the last 7 days
unless today, yesterday or the last month is chosen, or any two dates typed in (the newest 5,000 of each kind of line
at most). What admins and team managers changed is kept for good; the teams' videos and photos lines 90 days; the
sign-in's lines and problems, a month.</p>
${table(["Watched", "Warns", "Urgent"], [
		["Stream's minutes left", "Under 300 a running team", "Under 150 a team"],
		["Photos in Images (of 100,000)", "80,000", "95,000"],
		["The database's size (of 10 GB)", "4 GB", "9 GB"],
		["Server errors", "", "10 or more in an hour"],
		["Emails waiting over an hour", "", "Any"],
		["The month's emails (of 3,000)", "2,400", "2,850"],
		["The 3am job", "", "A failed night, or not run for 26 hours (the 5-minute job watches it)"],
		["The 5-minute job", "", "Six failed runs in a row, or not run for 15 minutes (the 3am job watches it)"],
		["A team's costs (Costs)", "Its season estimated over its budget", "Over its budget so far"],
		["An AI model (Workers AI)", "A planned retirement date", "Two weeks before it, or gone from the catalog"],
		["The video joiner", "Not answering its nightly test, or the test join failed", "A game's parts couldn't be joined after six tries (Keep the first part, or deleting the video, clears it once no team's game is still waiting)"],
		["The game check (each live game 8 hours before tip-off, and Platform's button)", "A game's Go live input gone from Stream, the joiner not answering, another alert at a warning (not budgets, AI models, photos in Images, the 3am job's own alert or video storage, whose minutes it checks itself)", "Stream not answering or short of minutes for the coming games, the 5-minute job stopped, another alert at urgent"],
	])}
<p>A team manager's question is a ticket too: answered on the site, emailed both ways, with private notes only admins
see. Tickets are New, Open, Waiting (on the team manager) or Resolved. A ticket's emails are saved before they're
sent, and the 5-minute job sends any that didn't go. Platform shows every one of these figures, with Cloudflare's own
for the last 30 days. Insights' Alerts section puts them all in one answer: all green, or each problem first, with the backup,
Stream, stuck or failed videos, the Worker's errors and refused sign-ins checked as it opens. What each team costs,
and the Team budgets alert, are in Costs and billing.</p>`});

export const recovery = (): DocSection => ({ id: "recovery", title: "When something goes wrong", body: html`
<p>First, find out what: the top of Insights says what's wrong, and the Log's Problems has each failure with its team,
person and device (a job's with its step and the video or game it was for). The Worker's own logs (${code("npm run logs")},
kept 7 days) have every request and job run: a 5xx is a ${code("request_error")} line, a job's failure a
${code("job_failed")} one, each with its ids and the error's cause, and an error page shows a Reference (its Ray ID) that
finds its line. The phones add their side: the filming phone's events, each family's player trouble (the live picture
not coming or stopping, and when it came back) and an upload that stopped, with how far it got. Traces time every
database query and outside call. The incident runbook, ${code("docs/runbooks/incident.md")},
goes through it in order. Then one of these, each spelt out step by step in the Cloudflare runbook. Anything that deletes
or restores data needs the owner's go-ahead first.</p>
${recoveryDiagram()}
${table(["Problem", "What to do"], [
		["A fix will take a while", "Switch the maintenance page on: everyone but admins sees Back soon, and admins see the real site to check it (the sign-in still opens, so an admin can sign in)"],
		["A bad deploy", "Roll the Worker back to its previous version in the Cloudflare dashboard (its secrets and bindings stay)"],
		["A bad change to the data", "D1's Time Travel puts the database back to any minute in the last 30 days"],
		["The database itself is gone", "Restore the newest nightly backup from R2 into a new database, with the restore script"],
		["Something deleted by mistake", "A video is kept for a day after it's deleted, and can be brought back in that time"],
	])}`});

export const codeLayout = (): DocSection => ({ id: "code", title: "Where things are in the code", body: html`
${table(["Folder", "What's in it"], [
		[code("src/app"), "The request's path: routing, the current team, errors"],
		[code("src/auth"), "The sign-in: codes, sessions, roles and admins"],
		[code("src/features"), "Each part of the site in its own folder (games, videos, photos, roster, support, admin and so on), with its routes, logic, queries and pages"],
		[code("src/platform"), "A small client for each outside service: Stream, R2, Images, Workers AI, email, PlayHQ"],
		[code("src/jobs"), "The 5-minute and 3am jobs"],
		[code("join"), "The video joiner: its small Worker (index.ts), the container's Dockerfile and the Node programs that run ffmpeg in it, and the image's tag"],
		[code("maintenance"), "The Back soon page's own small Worker"],
		[code("public"), "Stylesheets and the page scripts, as plain files with no build step"],
		[code("migrations"), "The database's numbered changes"],
		[code("infra"), "The Cloudflare settings as files: R2's rules, Images' variants, the zone's rules"],
		[code("tests"), "Unit tests, two-team isolation tests for every route, and the browser tests"],
	])}
<p>Changes flow one way: routes call services, services call repositories, repositories query D1. Each file stays
small (140 lines or fewer), and every query names its team. The README and the docs folder in the repository go into
more detail.</p>`});
