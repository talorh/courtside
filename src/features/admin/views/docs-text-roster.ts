// The Documentation page's roster section: the duties each game needs, how they're shared out fairly, what changes
// them, and what families see, as src/features/roster/ does it.
import { html } from "../../../shared/html.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";
import { rosterChangeDiagram, rosterFillDiagram } from "./docs-diagrams-roster.ts";

export const roster = (): DocSection => ({ id: "roster", title: "The roster", body: html`
<p>The Roster says which family does which game-day duty. Every member sees it; the team manager runs it from the
same page. It's built from the fixture: each week (Monday to Sunday) of the team's season with a game in it has duties,
and the roster follows the fixture as games are added, moved or deleted.</p>
<h3>Duties</h3>
${table(["Duty", "Each game", "The team manager can"], [
		["Scoring", "Always two scorers", "Nothing to set: every team has it"],
		["The extra duty", "One family (Lollies, unless the team manager names it otherwise)", "Switch it off, rename it, or give it to one family every week"],
		["Video", "One family, filming the game; none for a No video game", "Switch it off, or give it to one family every week"],
	])}
<ul class="docs-points">
<li><b>A family on a duty every week</b> (a parent who'd rather film every game than score) gets no other duty, and
isn't counted when the rest are shared out.</li>
<li><b>Saving the duties</b> changes them from this week on; earlier weeks keep what was done, and it still counts.
The weeks from next week on are shared out again, and this week stays as families already know it.</li>
<li><b>A week's own settings:</b> <b>No video this week</b> marks that week's games No video (a tournament that doesn't
allow filming). <b>Scorers only this week</b> drops the extra duty as well and marks its games No video, so the week
has two scorers a game and nothing else. A weekend whose games are all a tournament's starts as scorers only until
<b>All duties this week</b>.</li></ul>
<h3>How a week is filled</h3>
${rosterFillDiagram()}
<ul class="docs-points">
<li><b>Slots:</b> each game in the week, in playing order, wants video first (it takes the most organising), then two
scorers, then the extra duty. A slot is a week, a duty, a position and a game, so a tournament weekend's games each get
their own scorers.</li>
<li><b>Who's free:</b> the families with no duty yet that week, apart from every-week families, sorted by fewest
duties so far, then the longest since their last duty, then the order they were added.</li>
<li><b>The cheapest share:</b> among the families tied on fewest duties, up to five are tried at once in every order
(at most 120 ways a game), each way costing each family's count of that duty after this week, squared, so one family
two ahead costs more than two families one ahead, plus half a point for the same duty as the week before or after.
The cheapest wins; a tie keeps the first.</li>
<li><b>More slots than families</b> (a tournament weekend): a family takes a second game. Never the same game twice,
and not a game straight before or after its own while another family can take it; then the fewest duties, the
fewest of that duty, the one whose own game is furthest away, and the longest since its last duty.</li>
<li><b>Evening out:</b> going week by week can't see ahead, so afterwards two families swap duties whenever that evens
them out, in the same week or in two weeks where each is free in the other's. Totals stay as they were, and only the
new slots move.</li>
<li><b>The result:</b> every family's total, and each duty, within one of each other. It's tested for 4 to 16 families
and seasons up to 30 weeks, and a whole season takes a few milliseconds.</li></ul>
<h3>What changes it</h3>
${rosterChangeDiagram()}
<ul class="docs-points">
<li><b>Opening the Roster</b> brings it up to date once Generate roster has been tapped, while the season's on: new
games' weeks are filled, a week or a game that's gone loses its slots, and from this week on so does a slot the week no
longer wants (a duty switched off, video in a No video week).</li>
<li><b>Generate roster</b> needs families and an upcoming game. It clears next week on, keeping duties set by hand,
and shares the rest out around them. A duty left with a family that's since been taken off goes to one on the roster.</li>
<li><b>Change</b> on a week gives each duty a family picked by hand, or leaves it as <b>Roster's pick</b>, showing the
family the roster chose. A family picked comes off any other duty that week, a family does one duty a game at most, and
whatever's left is filled fairly. The week then says "Set by hand" for the team manager.</li>
<li><b>Time off the roster</b> (a child away or injured): taking a family off starts its time away, and adding the same
surname back ends it. Each week away, and each week before a family added partway through the season, counts as its
fair share of that week's duties (the week's duties over the families on the roster then), so a family back takes turns
like everyone else instead of duty after duty to catch up.</li>
<li><b>A closed season's</b> roster stays exactly as it was.</li></ul>
<h3>What families see</h3>
<ul class="docs-points">
<li><b>Your duty:</b> a member whose last name matches a family sees that family's next duty.</li>
<li><b>The weeks:</b> each week's games and who's on each duty. The next six weeks show; Earlier weeks and Later weeks
fold the rest, as a season runs to 40 weeks or more.</li>
<li><b>Roster fairness:</b> a plain verdict ("Fair", or "Not even yet" when families are more than one apart, which
tells the team manager to Generate roster), each family's count of each duty with its total and its time off, and a
week-by-week chart of who was on.</li>
<li><b>The WhatsApp message</b> (team managers, one a game): the opponent, the venue and when, arrive 30 minutes early,
the uniform (one of the club's, from src/club.ts, packing the other as the clash uniform when the club has more than one; a club with a reversible singlet has no choice to make) and who's on each duty, with Copy and Open WhatsApp. The team manager can change it in the box first; both send it as it stands (public/match-message.js), and it isn't saved: Update message makes it again from the roster.</li>
<li><b>Export to Excel</b> (everyone but Watch only): the season as an .xlsx, a row a week and a line a game.</li></ul>
${table(["Table", "Holds"], [
		[code("roster_families"), "Each family by surname: when it was added and removed, and its periods away"],
		[code("roster_slots"), "Who does each duty: the week, the duty, its position, the game, the family, and whether it was set by hand"],
		[code("roster_duties"), "The team's duties: the extra duty on or off and its name, video on or off, and any every-week families"],
		[code("roster_weeks"), "The weeks set to Scorers only, or back to All duties"],
	])}`});
