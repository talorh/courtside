import { CLUB } from "../../../club.ts";
// The Documentation page's fixture section: adding games by hand, from PlayHQ, from any page read by AI and from a
// spreadsheet, the checks that keep PlayHQ's in step, and the final scores, as src/features/games/ and scores/ do it.
import { html } from "../../../shared/html.ts";
import { MODEL } from "../../../platform/workers-ai.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";
import { aiReadDiagram, fixtureInDiagram, playhqSyncDiagram, scoresDiagram } from "./docs-diagrams-fixture.ts";

export const fixture = (): DocSection => ({ id: "fixture", title: "The fixture and PlayHQ", body: html`
<p>The Fixture is every game the team plays. Everyone sees it; only team managers add, change and delete games. Much
of the site follows it: Upload and Go live offer its games, Watch games lists them, the roster gives each week with a
game its duties, and PlayHQ's games get their final scores by themselves.</p>
${fixtureInDiagram()}
<h3>A game by hand</h3>
<p><b>Add game</b> takes the date and tip-off (the coming Friday at the team's usual tip-off, below, to start with), the competition (${CLUB.league},
Tournament or Practice match), in the league the phase of the season (below), the round, the opponent and the venue, and the game's <b>Video</b>: Live stream (the
default), Record and upload after, or No video. No video takes the game out of Upload and Go live and off the roster's
video duty, and can't be chosen while the game has a video. Any game can be edited or deleted later.</p>
${table(["Age group", "Usual tip-off"], [["U12", "6:40pm"], ["U14", "7:40pm"], ["U16", "8:40pm"], ["U18", "9:40pm"]])}
<p>The usual tip-off comes from the team's code, boys and girls the same; an age between takes the younger group's
(${code("usualTipOff")} in ${code("team-code.ts")}). A new game starts there, and so does a game PlayHQ or a fixture page
gives no time for.</p>
<h3>The league season's phases</h3>
<p>A VJBL season (the example league; the labels are the club's, ${code("seasonPhases")} in ${code("club.ts")}) runs in phases, and each phase's rounds start again from 1: three rounds of <b>grading phase 1</b>, a
<b>crossover game</b>, three rounds of <b>grading phase 2</b>, then the <b>championship season</b> in the division the
grading settled, its rounds and finals. Every league game carries its phase (${code("games.phase")}: grading1, crossover,
grading2 or championship; ${code("season-phase.ts")}). PlayHQ gives it: each game's grade is named for its phase
("12 Boys Grading 1 - Pool 2D", "12 Boys Grading 1 - Crossover", "U12 Boys Grading 2 - AA Pool B", then the division,
"U12 Boys - VJL1 (P1)"), and the phase is read from that name on every check, anything that isn't grading or the
crossover being the championship season. A spreadsheet's Phase column and a page read by AI say it in words; the
game form has a Phase choice. It shows as a tag beside the league on the Fixture and Watch games, and a grading or
crossover game's title says it ("Grading phase 1, Round 2 · vs Hillcrest 2", "Crossover game · vs Hillcrest 2"); the
championship season's games are titled by their round alone. The phase stays on a game once PlayHQ drops it: after
each grading phase the played games leave PlayHQ, and here they're kept, marked "Not on PlayHQ any more". A tournament
or practice match never has one.</p>
<h3>From PlayHQ</h3>
<ul class="docs-points">
<li><b>The link</b> is a team's public page on playhq.com, with /org/ and /teams/ in it; its last part is PlayHQ's
id for the team. A My teams link (from a parent signed in to PlayHQ, with their own id in it) is refused and never
stored. A PlayHQ fixture is ${CLUB.league} or a tournament, never a practice match.</li>
<li><b>The feed</b> is not PlayHQ's official API, which needs a key PlayHQ issues to clubs. It's the same public feed
playhq.com's own team pages use: ${code("api.playhq.com/graphql")}, asked for ${code("discoverTeam")} and
${code("discoverTeamFixture")}, sent with Origin: https://www.playhq.com and a ${code("tenant")} header naming the sport
(example-association). If PlayHQ changes it, a check fails and says so, and nothing in the fixture changes.</li>
<li><b>What comes in</b> for each game: its date, its tip-off (the team's usual one until PlayHQ sets one), its round (${CLUB.league}'s
"Round 4" shows as 4; a tournament keeps PlayHQ's name, such as "Semi Final"), in the league its phase of the season from
its grade's name (the game's own grade, else its round's, else the team's), the opponent shortened ("Hillcrest U12
Boys 3" becomes "Hillcrest 3"), and the venue with its court. A game PlayHQ lists twice comes in once.</li>
<li><b>Adding it</b> saves the fixture and all its games at once, with no check page: they're PlayHQ's own. A game
added by hand on the same day in the same competition is taken over, not doubled (the one at the same time first, so a
tournament's two games on one day each take their own), and games of this fixture deleted here earlier come back if
they have no video. The team's name on PlayHQ is kept as the fixture's name.</li>
<li><b>No video for these games</b>, ticked when adding (a tournament that doesn't allow filming), marks every game
the fixture brings in, now or later, No video. Each fixture's No video and Allow video switch changes its games, and
the ones it adds later, either way.</li></ul>
<h3>How PlayHQ is kept in step</h3>
${playhqSyncDiagram()}
${table(["Fixture", "Checked", "Stops"], [
		[`The league (${CLUB.league})`, "every 8 hours", "six weeks after its last game, so rounds after a break and finals still come in"],
		["Tournament", "every 8 hours until it starts, then every hour from its first game's day to the end of its fourth (or its last game's day, if later)", "after that last day: finals appear on the team's fixture as they're made, sometimes hours before they're played"],
		["One that never gets a game", "every 8 hours", "60 days after it was added"],
	])}
<ul class="docs-points">
<li><b>Each check</b> is one call to the feed, from the 5-minute job's share of 200 outside calls a run; a check that
finds the calls used up waits for the next run, which isn't a failure. Matching is by PlayHQ's game id, deleted games
included, so a game a team manager deleted stays deleted. A game PlayHQ no longer lists (a grading game, say) is marked
"Not on PlayHQ any more" and never deleted. An empty answer (a fixture not out yet) marks nothing.</li>
<li><b>Check now</b> on the Fixture reads it at once. <b>Remove</b> stops the checks and keeps the games, no longer
linked. The Fixture says when each was last checked and the day its checks stop.</li>
<li><b>A failed read</b> (PlayHQ down, changed, or turning Cloudflare away) is saved on the fixture with its reason, and
every team manager sees "PlayHQ couldn't be read" at the top of every page until a check works. A fixture that keeps
failing stops on the same days as one that works.</li></ul>
<h3>From any fixture page, read by AI</h3>
${aiReadDiagram()}
<ul class="docs-points">
<li><b>Fetching:</b> the link is asked for over https (an http:// link is asked for securely), following up to five
redirects, each one https too, for 15 seconds, and only the first 2 MB is read. The page must be public: if it
doesn't open in a private window, the site can't read it either. A link to a file rather than a web page is pointed to
the spreadsheet instead.</li>
<li><b>Cutting it down:</b> scripts, styles and the page's head are dropped, table cells are kept apart with a "|" so a
row stays a row, and the first 30,000 characters (about 8,000 tokens) go on. A page with almost no text draws its fixture
with JavaScript after it loads, and the site says so rather than asking the model.</li>
<li><b>The model:</b> Workers AI's ${code(MODEL)}, the site's one model (the same as Ask's), with its thinking
off, in JSON mode (a schema of date, time, round, phase, opponent and venue for each game), at temperature 0, with
up to 4,000 tokens to answer in: under a hundred of the account's free daily neurons a page. It's told today's date in
local, so a page that leaves out the year gets the one that puts the game closest after today, and the names a
draw may give the team: b12.1 is "${CLUB.fixtureName} U12 Boys 1", which a page may write "${CLUB.fixtureName} U12 Boys 1",
"${CLUB.fixtureName} U12B1", or just "${CLUB.fixtureName} 1" on a page for U12 Boys alone. Its instructions say to list only that team's
games, to leave out byes, results, ladders and other teams' games, and: Never make up a game, date or time.</li>
<li><b>Checking its answer:</b> an answer that isn't the JSON asked for is refused (try again, or use a spreadsheet),
and at most 200 games are taken. A game without a real date is left out and listed; one without a clear tip-off gets
the team's usual tip-off and is listed to fix; no opponent is "TBC"; the round, opponent and venue are cut to 40, 80 and 120
characters.</li></ul>
<h3>From a spreadsheet</h3>
<p>A CSV, up to 300 KB, one game a row under a header row naming the columns in any order: Date, Time, Competition,
Phase (the league season's, in words), Round, Opponent, Venue and Video (other names work too, such as Against or Court). Dates are day first (31/10 is 31 October), a
semicolon works in place of a comma, and an Excel file is refused with how to save it as CSV. The Fixture has a
sample to download.</p>
<h3>Checking before adding</h3>
<p>Games from a page or a spreadsheet are shown first, sorted by date, with every problem listed. Games already in the
fixture (the same day and time, or the same day against the same opponent) are left out, and at most 100 are added at
once. The list travels in the form itself, so nothing is stored in between, and only the ticked games are added, in
one batch, skipping any that turned up in the fixture meanwhile.</p>
<h3>Final scores</h3>
${scoresDiagram()}
<p>During a game's hour it says In progress. For a game from a PlayHQ fixture, the 5-minute job then asks PlayHQ for
its result (${code("discoverGame")}), and enters the score only when PlayHQ's status is FINAL with both scores in, and
never over one a team manager typed. It stops 3 days after tip-off. A failed ask is logged and tried again later, on the
same back-off; it never fails the run. A team manager can enter or fix any game's score once it has started, and any member can
hide scores everywhere for themselves.</p>
${table(["Table", "Holds"], [
		[code("games"), "Every game, with the league season's phase it's in, its PlayHQ game id and fixture when it came from one, when PlayHQ stopped listing it, when it was marked No video (and whether the site did, a week on with nothing filmed), when a team manager last set it back to Video (it waits a week from then), and when PlayHQ was last asked for its score"],
		[code("playhq_fixtures"), "Each PlayHQ team added: its link and PlayHQ id, competition, name, No video, whether it's still checked, when it last was, how many games, and the last error"],
		[code("game_scores"), "Each game's final score, whether a team manager or PlayHQ gave it, who entered it and when"],
		[code("game_lines"), "A team's own game lines, a row for each group its team manager changed (one line a row); a group with no row uses the club's"],
	])}`});
