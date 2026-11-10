import { CLUB } from "../../../club.ts";
// The Documentation page's costs and billing section: what Cloudflare charges, what a team costs, and how Costs works.
import { html } from "../../../shared/html.ts";
import { type DocSection, table } from "./docs-blocks.ts";

export const costs = (): DocSection => ({ id: "costs", title: "Costs and billing", body: html`
<p>Cloudflare bills the club's account monthly, in US dollars. The admin area's Costs page
turns that into what each team costs, in ${CLUB.currency.name} at the day's rate, against the team's season budget. It shows
one season at a time (October to September): this one, or pick any season a team was onboarded for.</p>
${table(["What", "Cloudflare's price", "Notes"], [
		["Workers Paid", "US$5 a month", "The plan the Worker runs on; it includes the database, 3,000 emails a month and far more requests than the site makes"],
		["Images and Stream bundle", "US$5 a month", "The first 1,000 minutes of video stored, and 100,000 photos"],
		["Stream storage past the bundle", "US$5 for each further 1,000 minutes stored, a month", "About 60 minutes a game: a 30-game season is about 1,800 minutes, so the second thousand"],
		["Stream watching", "US$1 for each 1,000 minutes watched", "Nine families watching a game twice is about 1,000 minutes a game"],
		["R2 originals", "US$0.015 a GB a month past the free 10 GB", "Originals are kept 30 days, so a few games' worth at a time"],
		["The domain", "About US$14 a year", `${CLUB.domain}, renewing by itself`],
		["Containers (the video joiner)", "Inside Workers Paid: 25 GiB-hours of memory, 375 vCPU-minutes and 200 GB-hours of disk a month, then about US$0.04 for each hour it's awake", "Awake about ten minutes a night for its test (about 20 of the 25 GiB-hours a month) and about a quarter of an hour for each game joined, so a busy month costs a few cents"],
		["Everything else", "US$0", "D1, the WAF, Turnstile, Email Routing, Workers AI's daily free allowance and Artifacts all sit inside free tiers"],
	])}
<p>Put plainly: a game's video costs under 50 cents a month to keep and under 10 cents each time it's watched. The
site's fixed costs are about US$10 a month however many teams run.</p>
<h3>What the Costs page shows</h3>
<p>A dashboard, a widget for each question, in ${CLUB.currency.name} unless $USD is chosen (figures carry no A or US: the
switch says which). Every figure says whether it's <b>Actual</b> (Cloudflare's own bill) or <b>Estimated</b>. Along the
top, the figures as tiles: this month (with the months as a small bar chart and the change on last month), the season so
far (and how much of the estimate that is), the season estimated (and how much of it is actual), the running teams' budgets (and where the estimate lands against them), a player
a season (with a month and this month under it), and the minutes Stream is storing against the 1,000 the bundle includes. Under them: every team's months
stacked by kind of cost beside where the money goes (this month and the season) and what the teams used this month
(minutes stored and watched, originals kept, games with a video); then Cloudflare's bill for the billing period (the
usage it charged so far, the plan's fees each period, and each product's use against its free allowance, a meter that's
amber from 80% and red past it); then the season's running total against the budgets
beside each team's season on one scale (spent, the rest estimated, its budget a tick); then Team by team, every team
month by month in one grid (each cell its dollars, the darker the dearer, the months to come lighter, every team's
total under them); then each team as a row. A
past season leaves out the estimate and Stream's storage, which are about now. A team's own page is laid out the same
way, with its budget beside its running total.</p>
<h3>Actual and estimated</h3>
<p>Every night at 3am, and whenever Costs opens and its copy is 20 hours old, the site reads Cloudflare's billable usage:
the day-by-day records Cloudflare's own invoices are made from, with each product's use, the part past its free allowance
and what that cost. It needs Billing Read on the read-only token (courtside-insights-read). For every day the bill covers,
what Cloudflare charged for watching and for R2 stands in place of the site's own figures, shared out between the teams
as before (by minutes watched, by GB of originals), and anything else it charged is shared like the fees. The plan's
fees and the storage bought aren't in that bill: they're charged at their price, so they count as actual too. The days
the bill hasn't reached yet (it runs about a day behind) and the months to come are estimated, and the estimate leaves
out as many minutes of watching a billing period as the bill shows were free. A month on the chart says which it is.
When the bill can't be read, the 3am job raises its ticket and Costs shows the copy last read.</p>
<h3>How Costs works it out</h3>
<p>In short below; where each figure comes from, and how it's kept, is in The admin area and its figures.</p>
<ul class="docs-points">
<li><b>A team's own costs</b> are its storage (its videos' and clips' minutes in Stream), its watching (Stream's minutes
watched, read from Cloudflare by video) and its uploads (its originals in R2).</li>
<li><b>The site's fixed costs</b> (Workers Paid, the bundle, the domain) are shared by the days each team ran in the
month, so a team that joined mid-month carries its share only from then.</li>
<li><b>Dollars</b> are Cloudflare's US dollars, or Australian at the European Central Bank's rate for the day, read a
few times a day and kept if the rate can't be read.</li>
<li><b>The estimate</b> for a season uses the team's own figures once it has three games; before that, 30 games of an
hour, three clips a game and nine families each watching twice.</li>
<li><b>The budget</b> is $200 a season until one is set on the team's Costs page. Over budget so far is urgent, and
estimated to go over is a warning: the Team budgets alert, checked each night.</li>
<li><b>Download for Excel</b>, beside the seasons, is the season and currency on the page as a workbook: Summary (the
tiles' figures, each actual or estimated), Teams (a row each), Months (a row a team's month, by kind of cost, to sort
or pivot), Team by team, and Cloudflare's bill for the season's days (US dollars). Figures stay numbers, so Excel adds
them up.</li></ul>
<h3>Cloudflare's own alerts about money</h3>
<p>Cloudflare emails the owner when the month's spend passes US$50 and US$100, whatever the site itself is doing. The
bill, the invoices and the card are under Billing in the dashboard.</p>`});
