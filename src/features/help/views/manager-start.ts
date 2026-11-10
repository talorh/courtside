import { CLUB, mailFrom } from "../../../club.ts";
// A team manager's questions on Help: getting a new team going, and the
// people on it.
import { html } from "../../../shared/html.ts";
import { faqItem } from "./faq-item.ts";
import { shot } from "./faq-mock.ts";
import { MIN_PLAYERS } from "../../teams/team-setup.ts";

/** The first week: the order to set a new team up in. */
export const managerStart = () => html`<h2 class="faqgroup">Getting your team going</h2>
${faqItem("g-first", "Your first week: a checklist", html`<p><b>Manage team</b> keeps this checklist at the top, ticking each step
off as it's done, until they all are: the squad (at least ${MIN_PLAYERS} players); someone set to <b>Watch and film</b>, the coach and a
team manager; the fixture; and the roster.</p><ol class="steps">
<li><b>Players:</b> on <b>Manage team</b>, add your squad (number and name). See <a href="#g-players">Players</a>.</li>
<li><b>People:</b> on <b>Manage team</b>, under <b>People</b>, add each person (email, name and role) with <b>Add a person</b>.</li>
<li><b>Games:</b> on <b>Fixture</b>, tap <b>Add fixture</b> and paste your team's public PlayHQ link, or <b>Add game</b> for each one.</li>
<li><b>Roster:</b> on <b>Roster</b>, add your families' surnames, set your duties, then tap <b>Generate roster</b>.</li>
<li><b>Tell the families:</b> post <b>${CLUB.domain}</b> in the team chat, and point them to <b>Help</b>. On Hotmail or Outlook
their code may land in Junk: they mark it <b>Not junk</b>.</li></ol>`)}`;

/** The people on the team, and its players. */
export const managerPeople = () => html`<h2 class="faqgroup">People</h2>
${faqItem("g-add", "Adding people", html`<ol class="steps">
<li>On <b>Manage team</b>, under <b>People</b>, go to the row at the bottom of the list.</li>
<li>Type their <b>email</b>, <b>name</b> and <b>role</b>. Anyone who'll film games needs <b>Watch and film</b>, the role it starts on.</li>
<li>Tap <b>Add a person</b>. They can sign in straight away at ${CLUB.domain}, with a code sent to that email.</li></ol>
${shot("manage-add-people", "Manage team's People list with the Add a person row at the bottom: Email, Name and a Role picker, and the green Add a person button", 359, 396)}
<p class="small">Someone already on the list is left as they are.</p>
<p><b>Lots of people at once?</b> Under the list, tap <b>Add from a spreadsheet</b> and download the <b>template</b>. Fill in a row
for each person (Name, Email and Role; a blank role is Watch only), save it as <b>CSV</b> (Excel: File → Save As; Google
Sheets: File → Download), then choose it and tap <b>Read spreadsheet</b>. You'll see everyone first, with any rows it
couldn't read; the green Add button (it says how many) adds the new ones.</p>`)}
${faqItem("g-roles", "The four roles", html`<ul class="steps">
<li><b>Watch only:</b> watch, download, see and add photos, make highlight clips, and ask for something to be removed.</li>
<li><b>Watch and film:</b> all that, plus upload a game's video and Go live. The usual role for a parent.</li>
<li><b>Coach:</b> everything Watch and film can, plus private notes on each game (only coaches see them).</li>
<li><b>Team manager:</b> everything, including the fixture, members, players, the roster, deleting things and removal
requests.</li></ul>
<p>Anyone who'll film games, on the roster's video duty or not, needs <b>Watch and film</b> (or Coach or Team manager).
Someone on <b>Watch only</b> can't upload a game's video or Go live, so they couldn't film their turn.</p>`)}
${faqItem("g-role", "Changing a role, or a second team manager", html`<p>Pick the new role next to their email on <b>Manage team</b>,
then tap <b>Save</b>, beside <b>Remove</b>. It shows once something's changed.</p>`)}
${faqItem("g-remove", "Removing someone", html`<p>On <b>Manage team</b>, tap <b>Remove</b> next to them, then <b>Yes, remove them</b>. They can't
sign in from their next click.</p>`)}
${faqItem("g-limit", "How many people can a team have?", html`<p>As many as you need: there's no limit.</p>`)}
${faqItem("g-plus", "Someone without their own email", html`<p>On Gmail, use the <b>plus trick</b>: for someone who shares
<b>parent@saints.example</b>, add <b>parent+grandma@saints.example</b>. Their codes go to the same inbox. Other email
services may not support it.</p>`)}
${faqItem("g-signin", "Someone can't sign in", html`<ul class="steps">
<li>The code goes to the email on the list, so check it's spelt right on <b>Manage team</b>.</li>
<li>Check the junk or spam folder. On Hotmail or Outlook, they mark it <b>Not junk</b> and add ${mailFrom()} to their
contacts.</li>
<li><b>Too many codes?</b> Someone who asks for 10 codes in an hour (or 20 in a day), or types too many wrong codes,
has to wait, and the sign-in page tells them so. While they're waiting, they're listed under <b>Waiting to sign in</b> at the top of <b>Manage team</b>.
Checked it's really them? Tap <b>Let them sign in</b> and they can ask for a new code straight away.</li>
<li>Still asking? Tap the door at the top right to sign out, then sign in again.</li></ul>
${shot("manage-waiting", "Manage team's Waiting to sign in: a parent's name and email, when they can ask for a code again, and a green Let them sign in button", 343, 271)}`)}
<h2 class="faqgroup">Players</h2>
${faqItem("g-players", "Adding the squad", html`<ol class="steps">
<li>On <b>Manage team</b>, under <b>Players</b>, type a number and a name.</li>
<li>Tap <b>Add a player</b>. Up to 10.</li></ol>
${shot("manage-players", "Manage team's Players panel: each player's number and name with Save and Remove, and Add a player below", 343, 836)}
<p class="small">A first name or a full name, as you like: only the team sees them.</p>`)}
${faqItem("g-player-edit", "Changing or removing a player", html`<ul class="steps">
<li><b>New number or name:</b> change it in the list and tap <b>Save</b>.</li>
<li><b>Leaving the team:</b> tap <b>Remove</b>, then <b>Yes, take them off</b>. Clips already tagged with them still say so.</li></ul>`)}`;
