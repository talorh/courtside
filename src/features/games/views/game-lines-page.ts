import { CLUB } from "../../../club.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { notice, pageHead } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import { LINE_GROUPS, LINE_KINDS, type LineKind, type LineSlots, MAX_LENGTH, MAX_LINES, renderLine } from "../game-lines.ts";

export const GAME_LINES_MESSAGES: Record<string, string> = { saved: "Game lines saved.", same: "Nothing had changed, so nothing was saved." };

// How a group's lines read on a made-up game, one by one (in the box, a long line wraps onto the next row).
const EXAMPLE: LineSlots = { who: "Lakeside Rockets", venue: "Lakeside Stadium, Court 2", h: 34, o: 28 };
const EXAMPLES: Partial<Record<LineKind, LineSlots>> = { won_by_one: { ...EXAMPLE, h: 34, o: 33 }, lost: { ...EXAMPLE, h: 28, o: 34 }, drew: { ...EXAMPLE, h: 30, o: 30 }, rivals_upcoming: { ...EXAMPLE, who: "Northside Comets" } };

const INTRO = html`<section class="panel stack" aria-labelledby="gl-how"><h2 id="gl-how">How they work</h2>
<p>The line under each game's title on its page. Each group below is used at a different time, and a game always gets
the same line from its group.</p>
<p>One line a row (press Enter between lines), up to ${MAX_LINES} a group and ${MAX_LENGTH} letters a line. Use these
for the game's details:</p>
<ul class="small"><li><b>{opponent}</b>: the team the ${CLUB.nickname} play.</li>
<li><b>at {venue}</b>: where it's played, left out when the game has no venue.</li>
<li><b>{ours}</b> and <b>{them}</b>: the scores, in the Won, Won by one point, Lost and Drew lines only.</li></ul>
<p class="small">Keep them kind to both teams: they're all kids. Empty a box to go back to the club's lines. Changes
are in the site's Log, with who made them.</p></section>`;

function group(kind: LineKind, text: string, open: boolean): SafeHtml {
	const g = LINE_GROUPS[kind];
	const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	const rows = Math.min(Math.max(text.split("\n").length + 1, 3), 14);
	return html`<section class="panel stack" aria-labelledby="gl-${kind}"><h2 id="gl-${kind}">${g.name}</h2><p class="small">${g.when}</p>
<label>${g.name} lines<textarea name="${kind}" rows="${rows}" maxlength="6000"${open ? "" : " readonly"}>${text}</textarea></label>
${lines.length ? html`<details><summary class="small">How they read on a made-up game</summary>
<ol class="small">${lines.map((l) => html`<li>${renderLine(l, EXAMPLES[kind] ?? EXAMPLE)}</li>`)}</ol></details>` : html`<p class="small">Empty: the club's lines are used.</p>`}</section>`;
}

export interface GameLinesPageProps {
	frame: PageFrame;
	/** Each box's text: the lines in use, or what was typed when it didn't save. */
	text: Record<LineKind, string>;
	message: string | null;
	/** What's wrong with what was typed ("Won: Line 2 needs {opponent}..."). */
	problems: string[];
}

export function gameLinesPage(p: GameLinesPageProps): SafeHtml {
	// A closed season: the lines still show on its games, but nothing changes.
	const open = p.frame.team.status === "active";
	const problems = p.problems.length ? html`<div class="note warn" role="alert"><p>Nothing was saved. Fix these, then save again:</p>
<ul>${p.problems.map((x) => html`<li>${x}</li>`)}</ul></div>` : "";
	return layout({ title: "Game lines", frame: p.frame, current: "manage" }, html`${pageHead("Team managers only", "Game lines")}
${notice(p.message)}${problems}${INTRO}
<form method="post" action="/manage/game-lines" class="stack">${LINE_KINDS.map((k) => group(k, p.text[k], open))}
${open ? html`<div class="row-actions"><button class="btn primary">Save game lines</button></div>` : ""}</form>
<p><a href="/manage">Back to Manage team</a></p>`);
}
