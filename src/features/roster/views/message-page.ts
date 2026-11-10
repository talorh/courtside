import { CLUB } from "../../../club.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatClock, formatShortDate } from "../../../shared/time.ts";
import type { Game } from "../../games/games-repository.ts";
import { pageHead } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import type { Uniform } from "../match-message.ts";

// Longer links than this can be cut short or refused by phones; a message that long is copied instead (public/match-message.js
// keeps the same limit as the message is changed).
const MAX_LINK = 2000;

/** Team manager: the match day message for the team's WhatsApp chat, to change if need be, then copy or send straight to WhatsApp. `game`: on a
 * weekend with several games, the one this message is for. */
export function messagePage(p: { frame: PageFrame; week: string; game?: Game | null; uniform: Uniform; text: string }): SafeHtml {
	const link = `https://wa.me/?text=${encodeURIComponent(p.text)}`, fits = link.length <= MAX_LINK;
	// The uniform is a choice only when the club has more than one.
	const choice = (u: Uniform) => html`<label><input type="radio" name="uniform" value="${u}"${p.uniform === u ? html` checked` : ""}> ${u}</label>`;
	const uniforms = CLUB.uniforms.length > 1 ? html`<fieldset class="choice"><legend>Uniform</legend>${CLUB.uniforms.map(choice)}</fieldset>` : "";
	return layout({ title: "Match day message", frame: p.frame, current: "roster", scripts: ["/copy.js", "/match-message.js"] }, html`${pageHead(p.game ? `${formatShortDate(p.game.startsAt)}, ${formatClock(p.game.startsAt.slice(11))}` : `Week of ${formatShortDate(`${p.week}T00:00`)}`, "Match day message")}
<form method="get" class="panel stack">${p.game ? html`<input type="hidden" name="game" value="${p.game.id}">` : ""}${uniforms}
<div class="row-actions"><button class="btn">Update message</button></div></form>
<section class="panel stack"><label>Message<textarea id="match-message" class="msgbox" rows="22">${p.text}</textarea></label>
<div class="row-actions"><button class="btn primary" type="button" data-copy="match-message">Copy message</button>
<a class="btn" href="${link}" target="_blank" rel="noopener" data-wa${fits ? "" : html` hidden`}>Open WhatsApp</a>
<a class="btn quiet" href="/roster#w${p.week}">Back to the roster</a></div>
<p class="small"><span data-wa-fits${fits ? "" : html` hidden`}>Copy it and paste it in the team chat, or tap Open WhatsApp and pick the chat.</span><span data-wa-long${fits ? html` hidden` : ""}>It's too long to open in WhatsApp straight from here, so copy it and paste it in the team chat.</span>
Change anything in the message before you copy or send it. Update message starts it again from the roster. Duties come from the roster, games from the fixture.</p></section>`);
}
