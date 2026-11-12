// A team manager's questions on Help: the fixture and the roster.
import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";
import { shot } from "./faq-mock.ts";

/** Games, then video duty and the roster. */
export const managerGames = (h: HelpFor) => html`<h2 class="faqgroup">Fixture and games</h2>
${faqItem("g-game", "Adding a game", html`<ol class="steps">
<li>On <b>Fixture</b>, tap <b>Add game</b>.</li>
<li>Fill in the date, tip-off, competition, round, opponent and venue. For a league game, pick its <b>Phase</b>: grading phase 1, the crossover game, grading phase 2 or the championship season.</li>
<li>Pick its <b>Video</b>: <b>Live stream</b>, <b>Record and upload after</b> or <b>No video</b>.</li>
<li>Tap <b>Save game</b>.</li></ol>
${shot("fixture-add-game", "The Add game form on the Fixture: date, tip-off, competition, round, opponent, venue and the Video choice, then Save game", 358, 751)}`)}
${faqItem("g-playhq", "Linking PlayHQ, so games fill in by themselves", html`<ol class="steps">
<li>On PlayHQ, open your team's <b>public</b> page and copy its link: find the team on playhq.com without signing in. Its address has <b>/org/</b> and <b>/teams/</b> in it.</li>
<li>On <b>Fixture</b>, tap <b>Add fixture</b>, paste the link, pick VJBL or Tournament, and tap <b>Read fixture</b>. Its games come straight in.</li></ol>
<p class="small">League games come in with their phase of the season, from how PlayHQ names the grade: <b>Grading phase 1</b>,
the <b>Crossover game</b>, <b>Grading phase 2</b>, then the <b>Championship season</b>. A grading game stays here after
PlayHQ drops it, marked "Not on PlayHQ any more". Gone up or down a grade? If PlayHQ gives the team a new page, add that
link too.</p>
<p class="small">The link from <b>My teams</b>, when you're signed in to PlayHQ, is private (it has <b>/account/my-teams/</b> in it), and the site can't read it. Paste one and the site says so.</p>
<p class="small">It checks PlayHQ again every 8 hours for new or changed games, and every hour over a tournament's four
days (Friday to Monday), as its finals appear. Fixture says the day each stops. A game's final score comes in by itself
within minutes of PlayHQ having it, from half an hour after tip-off. Tap <b>Check now</b> to look straight away.</p>
<p class="small">Not on PlayHQ? <b>Add fixture</b> can read any public page, and <b>Add from a spreadsheet</b> takes a CSV
file. Check the games, then tap <b>Add ticked games</b>.</p>`)}
${faqItem("g-video", "Live stream, recorded or no video", html`<ul class="steps">
<li><b>Live stream:</b> families watch from home during the game, and the recording is saved as the game's video.</li>
<li><b>Record and upload after:</b> filmed with the phone's camera and uploaded that night. The best picture.</li>
<li><b>No video:</b> a game that can't be filmed. Nobody's rostered on video for it.</li></ul>
<p class="small">A game shows <b>Waiting for video</b> for a week after tip-off. If nothing's been uploaded or streamed by
then, it goes to <b>No video</b> by itself. Footage turned up later? <b>Edit</b> the game, set its Video back to <b>Record
and upload after</b>, and upload it: it waits another week from then. (Switching a week or a PlayHQ fixture back to Video leaves these
games as they are: Edit each one.)</p>`)}
${faqItem("g-edit", "Changing or deleting a game", html`<p>Tap <b>Edit</b> next to a game to change it, then <b>Save game</b>.
<b>Delete</b> takes a game off the Fixture (it asks first: <b>Yes, delete it</b>). A game that has its video offers
<b>Delete game and video</b> instead.</p>
${shot("fixture", "The Fixture page: Add game, Add fixture and Add from a spreadsheet buttons, then each game with Edit and Delete")}`)}
${faqItem("g-lines", "The line under each game's title", html`<p>Each game's page has a line under its title, like
"Nothing but net: the Saints beat Lakeside at Saints Stadium. Final score 34 to 28." To change them for your team:</p>
<ol class="steps"><li>On <b>Manage team</b>, under <b>Game lines</b>, tap <b>Edit game lines</b>.</li>
<li>Change, add or take out lines in any group (Coming up, Won, Lost and so on), one line a row. Write
<b>{opponent}</b>, <b>at {venue}</b>, and in the Won, Won by one point, Lost and Drew lines <b>{ours}</b> and <b>{them}</b>, where the
game's details go.</li>
<li>Tap <b>Save game lines</b>. A line that won't work is pointed out, and nothing is saved until it's fixed.</li></ol>
<p class="small">Empty a group's box to go back to the club's lines.</p>`)}
<h2 class="faqgroup">Video duty and the roster</h2>
${faqItem("g-families", "Families and duties", html`<ol class="steps">
<li>On <b>Roster</b>, under <b>Families on the roster</b>, type a family's surname, one family a row. <b>+ Add another</b>
adds a row, then tap <b>Add families</b>.${shot("roster-families", "Add families on the Roster: one surname a row, with + Add another and Add families", 358, 801)}</li>
<li>Under <b>Duties</b>, choose your team's game day duties, then tap <b>Save duties</b>.</li>
<li>Tap <b>Generate roster</b>: every game gets its families, shared out fairly.</li></ol>
<p class="small">Picking a family for video under <b>Duties</b> gives them every game's video and no other duty.</p>
${h.duties.video ? html`<p>Each family on video duty needs someone set to <b>Watch and film</b> on <b>Manage team</b>, or they can't film their
turn.</p>` : ""}
${shot("roster-duties", "The Roster's Duties panel: An extra duty ticked with its name Lollies and Who, Video ticked with Who, and Save duties", 358, 626)}`)}
${faqItem("g-swap", "Swapping a week by hand", html`<p>Tap <b>Change</b> on the week, pick the families and tap <b>Save week</b>. A change
made by hand stays put when the roster is generated again. A family can only do one duty a game.</p>
${h.duties.lollies ? html`<p class="small">A tournament weekend starts with fewer duties. For all of them, tap <b>Change</b> on it, then
<b>All duties this week</b>.</p>` : ""}
${shot("roster-change", "A week on the Roster with Change open: a family picker for Video, Scoring 1, Scoring 2 and Lollies, each showing Roster's pick, then Save week", 343, 952)}`)}
${faqItem("g-away", "A family away for a while", html`<p>A child away or injured for a few weeks? Under <b>Families on the roster</b>, tap
<b>Take off</b> next to the family, then <b>Yes, take them off</b>: their upcoming duties go to other families. When they're back,
add the same surname again under <b>Add families</b>.</p>
<p class="small">The weeks they were off count as their share of those weeks, so they take turns like everyone else rather than
getting duty after duty to catch up. A family added partway through the season is treated the same way.</p>`)}
${faqItem("g-message", "The message for the team chat", html`<p>Tap <b>WhatsApp message</b> on a game, then <b>Copy message</b>, and paste it into
the team chat. It has the game, tip-off, venue and who's on duty.</p>
<p class="small">Something to add or change (a swap, a note about parking)? Tap into the message and change it first:
<b>Copy message</b> and <b>Open WhatsApp</b> send it as you've left it. <b>Update message</b> starts it again from the roster.</p>
${shot("whatsapp-message", "The Match day message page: a Uniform choice when the club has more than one, Update message, and the message ready to copy")}`)}`;
