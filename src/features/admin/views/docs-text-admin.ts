import { CLUB } from "../../../club.ts";
// The Documentation page's section on the admin area: what each page shows and where its figures come from, how Costs
// works its figures out, and what sets each alert, as src/features/admin/ does it.
import { html } from "../../../shared/html.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";
import { adminDataDiagram, costFlowDiagram } from "./docs-diagrams-admin.ts";

export const admin = (): DocSection => ({ id: "admin", title: "The admin area and its figures", body: html`
<p>The admin area is for site admins only; anyone else gets "Page not found" there. Its pages read every team at
once, so each of their queries is a listed exception to the rule that every query names its team (${code("CROSS_TEAM")}
in ${code("scripts/rules.mjs")}), and they show counts and figures, never a family's email. Each page works its figures out as it opens, from five sources.</p>
${adminDataDiagram()}
${table(["Page", "What it shows", "Where its figures come from"], [
		["Insights", "Is the site all right (the Alerts section), what needs an admin, then the whole site in numbers over 12 weeks, when families watch, mobile against desktop, and the teams side by side", "The database only, so it opens quickly: one query for every team's counts, and hourly counts put into the club's weeks in code. Mobile and desktop come from the devices counted each week (view_weeks)"],
		["Insights' Alerts", "Every check as a light, worst first, then what's going on now", "Each alert's saved level (platform_alerts), plus checks made as it opens: the nightly backup and clean-up, Stream answering, videos processing over 4 hours, uploads failed in a week, the Worker's errors in a day (Cloudflare's analytics) and sign-ins refused"],
		["Teams", "Every team that isn't deleted, its season, status, people, setup checklist and open tickets, with Open, View as, Edit, End season, Reopen and Delete tonight", "The teams, their members and the checklist's own rules (team-setup.ts)"],
		["Support", "The ticket desk: support questions and feature requests as two queues, each with its figures, views (what needs an answer, yours, waiting or a feature request's stage, resolved), and filters by team, owner and words", "support_requests and support_messages; the site's own tickets come from its alerts"],
		["Platform", "A row for each thing watched with its figure, limit and alert, the 3am job's backup and sweep, and Cloudflare's last 30 days", "The database, each alert's level, the month's emails, the hour's server errors, Stream's API (3 seconds) and Cloudflare's analytics (4 seconds); the page opens without either if they're slow"],
		["Costs", "What each team costs this month, its season so far and estimated, against its budget, in the club's currency or US$", "Below"],
		["Log", "Right now first: every team's live streams, uploads, processing and HD downloads, and removal requests waiting, each with Open (it follows the Team filter alone). Then everything that happened, in six groups: admins' changes; teams' people, players, games and game lines; videos (uploads, processing, clips, Go live, removal requests); photos (added, deleted, removal requests, a run of one person's photos as one line); every sign-in attempt from the last month, and which view each device uses; and problems, anything that failed. Each line says the device it came from (\"iPhone, Safari\"). A table a day at a time (100 lines a page): the last 7 days unless today, yesterday, the last month or any two dates are chosen, filtered by group, who, team, event, device or words (a person, team, event, device or address in the table filters to it), only warnings or device views hidden if asked, and the lines shown downloadable for Excel", "admin_log, sign_in_events, the teams' activity and problems, merged newest first; Right now from the videos, live streams and removal requests"],
		["Admins, Changelog, Documentation", "Who the admins are; release notes under a heatmap of the last twelve months; this page", "The admins table; CHANGELOG.md, built in; and the code itself"],
	])}
<p>The counts beside Support in the menu (tickets waiting for an answer, and alerts that aren't ok) are read on every
admin page.</p>
<h3>Cloudflare's own figures</h3>
<p>Platform's last 30 days, the Worker's errors on Insights' Alerts and the minutes watched behind Costs come from
Cloudflare's GraphQL analytics, read with a read-only account token (${code("CF_INSIGHTS_TOKEN")}, named
courtside-insights-read). One query covers the Worker's requests, CPU time and errors, D1's reads and writes, the
originals in R2, Stream's minutes watched, Workers AI's neurons, and the zone's requests and threats. Without the
token, local development for instance, those panels say they need it and the rest of each page still works.</p>
<h3>How Costs gets its figures</h3>
${costFlowDiagram()}
<ul class="docs-points">
<li><b>Storage</b> is worked out from the database: each team's videos' and clips' minutes, against the 1,000 the
bundle includes, priced at the further 1,000-minute blocks the account buys, and shared by the minutes each team
stores. A clip counts until it or its video goes.</li>
<li><b>Uploads</b> are each team's originals in R2 (kept 30 days each), from their sizes on the database's rows, past
the free 10 GB, by each team's share.</li>
<li><b>Watching</b> comes from Cloudflare's analytics, minutes viewed by video and day; each video is put to its team
(through its row, or its live input's), and the minutes are saved by month in ${code("cost_views")}. This month and
last are read again once they're over an hour old (last month's last days come in late), any other month of the season
only until it's saved, one query a month. Saved months are kept when a team is deleted, so a season's costs stay
right. Minutes no team has are shared like the fixed costs.</li>
<li><b>Fixed costs</b> (Workers Paid, the Images and Stream bundle, the domain) are shared between the teams running
each month by the days each ran in it, so a team that joined mid-month pays only from then.</li>
<li><b>Cloudflare's bill</b> (its billable usage, day by day) is read with the same read-only token, which has Billing
Read for it, every night at 3am and when Costs opens and the copy is 20 hours old (in a new billing period's first three
days the period before too, as its last days come in late), and saved in ${code("billed_usage")}, kept 400 days. The
days it covers are actual: its charges for watching and R2 take the place of the figures above, and its other charges
join the fixed costs. Its records name each product's free allowance, which Costs shows used.</li>
<li><b>Prices</b> are Cloudflare's list prices, kept in the code (${code("costs-prices.ts")}), in US dollars, by UTC
month as Cloudflare bills.</li>
<li><b>${CLUB.currency.name}</b> are at the European Central Bank's rate for the day, from Frankfurter (no key), saved in
${code("exchange_rates")} and read again after six hours. When Frankfurter doesn't answer, the last saved rate is used
and it's asked again 15 minutes later, not on every page; before any rate's been read, a set $1.42.</li>
<li><b>The estimate</b> spreads a running team's games left (30 a season, less those with a video) over its months
left, each adding an hour of video, three clips, nine families each watching twice and an original in R2. Once the team
has three games with a video, its own figures stand in.</li>
<li><b>Budgets</b> are set in ${CLUB.currency.name} on each team's own Costs page ($200 a season until one is), saved on
the team and logged. The Team budgets alert is urgent for a team over budget so far and warns for one estimated to go
over; it's checked whenever Costs or Insights opens and every night at 3am.</li></ul>
<h3>What sets each alert</h3>
${table(["Alert", "Set by", "From"], [
		["Stream's minutes left", "The 5-minute job, at most hourly", "Stream's API"],
		["Photos in Images, the database's size", "The 3am job", "The database; D1 says its size with every answer"],
		["Server errors", "Every 5-minute run", "The site's own count of the errors it answers, an hour at a time (server_errors)"],
		["Emails waiting, the month's emails", "Every 5-minute run", "Emails saved but not sent; every email counted by its UTC month (email_months)"],
		["The 5-minute job, the 3am job", "Each job, and each other", "Their own failures, and when each last ran"],
		["Team budgets", "Costs, Insights and the 3am job", "Costs' figures, as above"],
		["AI models", "Platform as it opens, and the 3am job", "Cloudflare's Workers AI catalog, read through the AI binding (no token)"],
		["Video joiner", "The 3am job (a warning), and the 5-minute job when a game's join gives up (urgent)", "The joiner's own answer to its nightly test join; a game's six failed tries"],
	])}
<p>Each level is saved in ${code("platform_alerts")} with its ticket. A level only drops once its figure is past the
clearing point, so one sitting on a threshold doesn't flap, and a check never fails its job.</p>`});
