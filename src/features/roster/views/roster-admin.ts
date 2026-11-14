import { html, type SafeHtml } from "../../../shared/html.ts";
import { postButton } from "../../../ui/components.ts";
import { dutyLabel, type RosterDuties } from "../roster-duties.ts";
import { type Slot, slotsFor, type Wanted } from "../roster-plan.ts";
import type { RosterFamily } from "../roster-repository.ts";
import { needOf, pickName, type RosterWeek } from "../roster-service.ts";
import { gameWhen } from "./roster-page.ts";
import { confirmButton } from "../../../ui/confirm.ts";

/**
 * Team manager: change who does what in one week, switch video off for it, or make it Scorers only (a tournament with
 * nothing to bring and no filming). Each duty is a family picked by hand (Generate roster keeps it)
 * or Roster's pick, with the family the roster chose.
 */
export function weekEditor(w: RosterWeek, held: Slot[], families: RosterFamily[], names: Map<number, string>, duties: RosterDuties): SafeHtml {
	// One field a slot; on a weekend with several games, each says which game.
	const select = (x: Wanted) => {
		const slot = held.find((s) => s.duty === x.duty && s.position === x.position && s.gameId === x.gameId);
		const pick = slot && !slot.byHand ? html`: ${names.get(slot.familyId) ?? "?"}` : "";
		const options = families.map((f) => html`<option value="${f.id}"${slot?.byHand && f.id === slot.familyId ? html` selected` : ""}>${f.surname}</option>`);
		const which = `${x.duty === "scoring" ? ` ${x.position}` : ""}${w.games.length > 1 && x.gameId ? ` · ${gameWhen(w, x.gameId)}` : ""}`;
		return html`<label>${dutyLabel(x.duty, duties)}${which}<select name="${pickName(x)}"><option value="">Roster's pick${pick}</option>${options}</select></label>`;
	};
	const videoSwitch = w.video
		? postButton(`/roster/week/${w.week}/no-video`, "No video this week", "btn quiet")
		: w.games.some((g) => g.game.noVideo) ? postButton(`/roster/week/${w.week}/video`, "Video this week", "btn quiet") : "";
	// Only for a team with an extra duty: a week with none is Scorers only (video switched off too), or back to all duties.
	const extraSwitch = !duties.lollies ? "" : w.extra || w.video
		? postButton(`/roster/week/${w.week}/scorers-only`, "Scorers only this week", "btn quiet")
		: postButton(`/roster/week/${w.week}/all-duties`, "All duties this week", "btn quiet");
	const extraNote = duties.lollies ? html` <b>Scorers only this week</b> drops ${dutyLabel("lollies", duties)} as well, for a tournament with nothing to bring and no filming (a tournament weekend starts that way; <b>All duties this week</b> brings them back).` : "";
	// One message a game: a weekend with several games has a link for each.
	const messages = w.games.length > 1
		? w.games.map(({ game }) => html`<a class="btn quiet" href="/roster/week/${w.week}/message?game=${game.id}">WhatsApp message, ${gameWhen(w, game.id)}</a>`)
		: html`<a class="btn quiet" href="/roster/week/${w.week}/message">WhatsApp message</a>`;
	return html`<div class="duty-admin">${messages}
<details class="duty-edit"><summary class="btn quiet">Change</summary>
<form method="post" action="/roster/week/${w.week}" class="stack"><div class="duty-picks">${slotsFor(needOf(w), duties).map(select)}</div>
<p class="small">Pick a family to set a duty by hand: Generate roster keeps it, and a family can only do one duty a game. Leave
Roster's pick and the roster shares that duty out fairly. Same family every week? Set it once in <a href="#duties">Team duties</a>.</p>
<div class="row-actions"><button class="btn primary">Save week</button></div></form>
<div class="row-actions">${videoSwitch}${extraSwitch}</div>
<p class="small">No video this week marks the week's games No video so they're not offered for upload. Use it for a tournament that doesn't allow filming.${extraNote}</p></details></div>`;
}

/** Team manager: the team's duties: always two scorers; one extra duty, named by the team (Lollies
 * unless they change it), and video, each on or off, shared out or always one family. */
export function dutiesPanel(d: RosterDuties, families: RosterFamily[]): SafeHtml {
	const box = (name: "lollies" | "video", label: SafeHtml) => html`<label class="check"><input type="checkbox" name="${name}" value="1"${d[name] ? html` checked` : ""}> ${label}</label>`;
	const who = (name: "lolliesFamily" | "videoFamily", chosen: number | null) => html`<label>${name === "videoFamily" ? "Who films" : "Who does it"}<select name="${name}"><option value="">Shared out fairly</option>${families.map((f) =>
		html`<option value="${f.id}"${f.id === chosen ? html` selected` : ""}>The ${f.surname} family, every week</option>`)}</select></label>`;
	return html`<section class="panel stack" id="duties"><h2>Team duties</h2>
<form method="post" action="/roster/duties" class="stack"><p class="small">Two families keep score at every game. Your team can also have:</p>
<div class="duty-setting">${box("lollies", html`An extra duty`)}<label>Its name<input name="lolliesLabel" type="text" maxlength="30" value="${d.lolliesLabel}" placeholder="Lollies"></label>${who("lolliesFamily", d.lolliesFamily)}</div>
<div class="duty-setting">${box("video", html`Video: one family films the game on the site`)}${who("videoFamily", d.videoFamily)}</div>
<p class="small">A family who does a duty every week gets no other one. Single games can still be No video on the Fixture. Saving shares out the weeks from next week on again; this week stays as it is.</p>
<div class="row-actions"><button class="btn">Save duties</button></div></form></section>`;
}

/** Add families a row at a time: one empty row to start; rows.js shows + Add another
 * and gives each extra row a ×. */
const familyRow = html`<li class="frow"><input name="surname" type="text" maxlength="400" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Curry" aria-label="Surname">
<button class="btn quiet rowx" type="button" data-remove-row aria-label="Remove this row" hidden>×</button></li>`;

/** Team manager: the families on the roster, adding more, and Generate roster. */
export function familiesPanel(families: RosterFamily[]): SafeHtml {
	return html`<section class="panel stack" id="families"><h2>Families on the roster</h2>
${families.length ? html`<ul class="duty-families">${families.map((f) => html`<li><span>${f.surname}</span>${confirmButton({ action: `/roster/families/${f.id}/remove`, label: "Take off", question: `Take the ${f.surname} family off the roster?`, consequence: "Their upcoming duties go to other families.", yes: "Yes, take them off" })}</li>`)}</ul>`
		: html`<p class="small">None yet.</p>`}
<form class="stack" id="addfamilies" method="post" action="/roster/families" data-rows><h3>Add families</h3>
<p class="small">One family's surname a row, as it ends their names on the site (Curry for Dell Curry).</p>
<ul class="addrows">${familyRow}</ul>
<div class="row-actions"><button class="btn quiet" type="button" data-add-row hidden>+ Add another</button><button class="btn">Add families</button></div></form>
<form method="post" action="/roster/generate" class="stack"><p class="small"><b>Generate roster</b> shares out every upcoming week from next week on, fairly:
each duty goes to the family that's done it least, and no family gets two duties in a week.
Duties set by hand stay as they are, and so does this week. New games in the fixture get their duties by themselves.</p>
<div class="row-actions"><button class="btn primary">Generate roster</button></div></form></section>`;
}
