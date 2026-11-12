import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate } from "../../../shared/time.ts";
import { pageHead } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import { gameTitle } from "../game-format.ts";
import type { ImportedGame, ImportPreview } from "../fixture-import.ts";
import { competitionTags } from "./phase-tag.ts";

const row = (g: ImportedGame, i: number | null) => html`<tr>${i === null ? html`<td></td>` : html`<td><input type="checkbox" name="pick" value="${i}" checked aria-label="Add this game"></td>`}
<td class="f-date">${formatGameDate(g.startsAt)}</td><td class="f-game">${gameTitle(g)}</td><td class="f-type">${competitionTags(g)}</td>
<td class="f-venue">${g.venue}</td><td class="f-status"><span class="role">${g.noVideo ? "No video" : g.liveStream ? "Live stream" : "Recorded"}</span></td></tr>`;

const table = (body: SafeHtml[]) => html`<div class="tablewrap cards"><table class="fixture"><thead><tr><th></th><th>Date</th><th>Game</th><th>Type</th><th>Venue</th><th>Video</th></tr></thead>
<tbody>${body}</tbody></table></div>`;

/** The games read from a spreadsheet or fixture page, to check and untick before they're added. */
export function importPage(frame: PageFrame, p: ImportPreview): SafeHtml {
	const problems = p.problems.length
		? html`<div class="note warn" role="status"><b>Worth a look:</b><ul class="steps">${p.problems.map((x) => html`<li>${x}</li>`)}</ul></div>` : "";
	const add = p.games.length
		? html`<form method="post" action="/fixture/import" class="stack"><input type="hidden" name="games" value="${JSON.stringify(p.games)}">
<h2>${p.games.length} ${p.games.length === 1 ? "game" : "games"} to add</h2>
<p class="small">Check the dates, times and opponents against ${p.source}. Untick any you don't want. You can edit any game after it's added.</p>
${table(p.games.map((g, i) => row(g, i)))}
<div class="row-actions"><button class="btn primary">Add ticked games</button><a class="btn" href="/fixture">Cancel</a></div></form>`
		: html`<p>No new games to add.</p><div class="row-actions"><a class="btn" href="/fixture">Back to the fixture</a></div>`;
	const already = p.already.length
		? html`<section class="stack"><h2>Already in the fixture</h2><p class="small">The fixture already has a game at the same day and time, or on the same day against the same team, so these are left out.</p>
${table(p.already.map((g) => row(g, null)))}</section>` : "";
	return layout({ title: "Check the games", frame, current: "fixture" }, html`${pageHead("Fixture", "Check the games")}
${problems}${add}${already}`);
}
