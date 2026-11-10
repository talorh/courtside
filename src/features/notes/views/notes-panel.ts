import { clubWordmark } from "../../../club.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatDuration } from "../../../shared/time.ts";
import { ICON_LOCK } from "../../../ui/icons.ts";
import type { CoachNote } from "../notes-repository.ts";
import { confirmButton } from "../../../ui/confirm.ts";

// The coach's clipboard, as the team's coaches carry: a green board and its clip, a maple court sheet with the key
// across the top, the club's name along the bottom. Add a note comes first, so a coach watching the game writes without
// scrolling past the notes; on a computer it sits beside the video (the side column, app.css .coaching).

/** The key at the top of the sheet: painted, its sides in court black, the free-throw circle dashed inside it. */
const COURT = html`<svg class="cbcourt" viewBox="0 0 300 96" aria-hidden="true"><path class="ln" d="M18 0V22A132 70 0 0 0 282 22V0"/>
<rect class="key" x="104" y="-4" width="92" height="66"/><path class="ln" d="M122 62A28 28 0 0 0 178 62"/><path class="ln dash" d="M122 62A28 28 0 0 1 178 62"/>
<path class="rim" d="M138 6H162"/><circle class="rim" cx="150" cy="15" r="6"/></svg>`;

function noteRow(n: CoachNote): SafeHtml {
	const at = n.atSeconds === null
		? html`<span class="notetime whole">Whole game</span>`
		: html`<a class="notetime" href="#" data-seek="${n.atSeconds}" title="Jump to this moment"><span aria-hidden="true">▶</span> ${formatDuration(n.atSeconds)}</a>`;
	return html`<li>${at}${confirmButton({ action: `/notes/${n.id}/delete`, label: "Delete", question: "Delete this note?", consequence: "It can't be brought back." })}
<div class="notebody"><p>${n.body}</p><span class="small">${n.authorName}</span></div></li>`;
}

/** Shown only to coaches. It says plainly who can't see the notes. */
export function notesPanel(gameId: number, notes: CoachNote[], hasPlayer: boolean): SafeHtml {
	const mark = hasPlayer ? html`<button class="btn mark" type="button" data-mark="note-at" hidden>Mark time</button>` : "";
	return html`<section class="clipboard" id="notes" aria-labelledby="notes-title"><div class="cbsheet">${COURT}
<div class="cbhead"><div class="cbtitle"><h2 id="notes-title">Coaches' notes</h2><span class="cbonly">${ICON_LOCK}Coaches only</span></div>
<p class="small">Nobody else sees these: not Watch only, Watch and film or team managers.</p></div>
<form method="post" action="/games/${gameId}/notes" class="noteform"><h3>Add a note</h3>
<label>Time in the video (optional)<span class="markrow"><input name="at" id="note-at" type="text" inputmode="numeric" placeholder="m:ss" pattern="[0-9:]{1,8}" aria-describedby="note-at-hint">${mark}</span>
<span class="small cbhint" id="note-at-hint">Watching the video? Tap <b>Mark time</b> to use the moment it's up to. Or type a
time, like 3:42. For a note about the whole game, leave this blank.</span></label>
<label>Note<textarea name="body" rows="3" maxlength="1000" required placeholder="Box out or else…"></textarea></label>
<button class="btn primary">Save note</button></form>
${notes.length ? html`<div class="cbnoteshead"><h3>This game's notes</h3><a class="btn cbexport" href="/games/${gameId}/notes.xlsx">Download for Excel</a></div>
<ol class="notelist">${notes.map(noteRow)}</ol>` : html`<p class="small cbempty">No notes yet for this game.</p>`}</div>
<div class="cbmark" aria-hidden="true">${clubWordmark()}</div></section>`;
}
