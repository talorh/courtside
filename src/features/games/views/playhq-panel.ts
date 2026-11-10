import { CLUB } from "../../../club.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, formatShortDate, localTime } from "../../../shared/time.ts";
import { CHECK_EVERY_HOURS, checksUntil, stillChecked } from "../playhq-checks.ts";
import { postButton } from "../../../ui/components.ts";
import type { PlayhqFixture } from "../playhq-repository.ts";
import { confirmButton } from "../../../ui/confirm.ts";

const COMPETITION_CHOICE = html`<fieldset class="choice"><legend>Competition</legend>
<label><input type="radio" name="competition" value="${CLUB.league}" checked> ${CLUB.league}</label>
<label><input type="radio" name="competition" value="Tournament"> Tournament</label>
<label><input type="radio" name="competition" value="Practice match"> Practice match</label></fieldset>`;
const NO_VIDEO_TICK = html`<label class="check"><input type="checkbox" name="noVideo" value="1"><span>No video for these games
<span class="small">(like a tournament that doesn't allow filming)</span></span></label>`;

/**
 * Add fixture: a link to the team's fixture. A PlayHQ team link is read exactly and kept up to date; any other
 * public page is read by AI, and its games are shown to check before they're added. `teamName`: the team as fixtures
 * name it ("Saints U12 Boys 1"), worked out from its code: nothing to type.
 */
export function addFixtureForm(teamName: string): SafeHtml {
	return html`<details class="panel"><summary class="btn primary">Add fixture</summary><form method="post" action="/fixture/link" class="stack addgame">
<p class="small">Paste the link to the team's fixture: its <b>PlayHQ</b> team page (games are kept up to date with PlayHQ), or
<b>any public fixture page</b>, like a tournament's draw (AI reads out <b>${teamName}</b>'s games, and you check them before they're added).</p>
<p class="small">For PlayHQ, use the team's <b>public</b> page: find the team on playhq.com without signing in and copy its address (it has <b>/org/</b> and <b>/teams/</b> in it). The <b>My teams</b> link you see when signed in is private, so the site can't read it.</p>
<label>Fixture link<input name="url" type="url" required maxlength="400" placeholder="https://www.playhq.com/example-association/org/…/teams/…"></label>
${COMPETITION_CHOICE}${NO_VIDEO_TICK}
<div class="row-actions"><button class="btn primary">Read fixture</button></div></form></details>`;
}

/** Add from a spreadsheet: a CSV with one game per row, and a sample to start from. */
export function addSheetForm(): SafeHtml {
	return html`<details class="panel"><summary class="btn">Add from a spreadsheet</summary>
<form method="post" action="/fixture/sheet" enctype="multipart/form-data" class="stack addgame">
<p class="small">One game per row: Date, Time, Competition, Round, Opponent, Venue and Video (Live, Record or No). Start from the
<a href="/fixture/sample.csv" download>sample spreadsheet</a>. In Excel, save it as <b>CSV</b> (File → Save As); in Google Sheets,
File → Download → <b>CSV</b>. You'll see the games before they're added.</p>
<label>Spreadsheet (CSV)<input name="file" type="file" accept=".csv,text/csv" required></label>
${COMPETITION_CHOICE}<p class="small">The competition is used for rows that don't say.</p>
<div class="row-actions"><button class="btn primary">Read spreadsheet</button></div></form></details>`;
}

/** "Fri 6 Nov", for a day ('YYYY-MM-DD'). */
const day = (date: string) => formatShortDate(`${date}T00:00`);

/** When it was last checked, and when it's checked again and stops (playhq-checks.ts), in days; `today`: the club's. */
function checked(f: PlayhqFixture, today: string): string {
	const when = f.checkedAt ? `${f.lastError ? "Last tried" : "Checked"} ${formatGameDate(localTime(new Date(f.checkedAt)))}. ` : "Not checked yet. ";
	if (!f.autoCheck || !stillChecked(f, today)) return `${when}${f.competition === CLUB.league ? "Season" : "Tournament"} over, so it's no longer checked by itself.`;
	const until = day(checksUntil(f));
	if (!f.lastGame || !f.firstGame) return `${when}Checked every ${CHECK_EVERY_HOURS} hours until its games are out, or until ${until} if they never are.`;
	if (f.competition === CLUB.league) return `${when}Checked every ${CHECK_EVERY_HOURS} hours until ${until}, six weeks after its last game, for later rounds and finals.`;
	return `${when}Checked every ${CHECK_EVERY_HOURS} hours, and every hour while the tournament's on, from ${day(f.firstGame)} to ${until} (its finals appear as they're made); it stops after that.`;
}

/** The PlayHQ fixtures being kept up to date, each with Check now, its No video switch and Remove. */
export function playhqPanel(fixtures: PlayhqFixture[], today: string): SafeHtml | "" {
	if (!fixtures.length) return "";
	const items = fixtures.map((f) => html`<li class="stack"><div><span class="t src">${f.competition}</span>${f.noVideo ? html` <span class="t src">No video</span>` : ""} <a href="${f.url}" rel="noopener noreferrer" target="_blank">${f.name}</a> · ${f.gameCount} ${f.gameCount === 1 ? "game" : "games"}</div>
<div class="small">${checked(f, today)}</div>${f.lastError ? html`<div class="small warn">Last check didn't work: ${f.lastError}</div>` : ""}
<div class="small">${f.noVideo ? "No video: filming isn't allowed, so its games (and any added later) aren't offered for upload or Go live." : "Video allowed."}</div>
<div class="row-actions">${postButton(`/fixture/playhq/${f.id}/check`, "Check now", "btn quiet")}${f.noVideo ? postButton(`/fixture/playhq/${f.id}/video`, "Allow video", "btn quiet") : postButton(`/fixture/playhq/${f.id}/no-video`, "No video", "btn quiet")}${confirmButton({ action: `/fixture/playhq/${f.id}/remove`, label: "Remove", question: `Remove ${f.name}?`, consequence: "Its games stay on the Fixture; they just aren't checked any more.", yes: "Yes, remove it" })}</div></li>`);
	return html`<section class="panel stack"><h2>PlayHQ fixtures</h2>
<p class="small">Games from these come from PlayHQ: new games are added and changes (times, venues, opponents) come through by themselves. A game PlayHQ drops, like a grading game, stays here, marked "Not on PlayHQ any more". Remove stops the checks and keeps the games.</p>
<ul class="playhq">${items}</ul></section>`;
}
