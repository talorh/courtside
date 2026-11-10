import { html, type SafeHtml } from "../../../shared/html.ts";
import type { Player } from "../players-repository.ts";
import { MAX_PLAYERS } from "../players-service.ts";
import { confirmButton } from "../../../ui/confirm.ts";

function playerRow(p: Player, open: boolean): SafeHtml {
	const formId = `player-${p.id}`;
	return html`<li class="playerrow"><form method="post" action="/players/${p.id}" id="${formId}" class="playerform">
<label class="pnum"><span class="sr">Number</span><input name="number" type="number" min="0" max="99" inputmode="numeric" value="${p.number}" required></label>
<label class="pname"><span class="sr">Name</span><input name="name" type="text" maxlength="40" value="${p.name}" required></label>
${open ? html`<button class="btn quiet">Save</button>` : ""}</form>${confirmButton({ action: `/players/${p.id}/remove`, label: "Remove", question: `Take #${p.number} ${p.name} off the squad?`, consequence: "Clips already tagged with them still say so.", yes: "Yes, take them off" })}</li>`;
}

/** The squad (name and number), above the people on Manage team: what Home's squad and clips' player tags read. `open`:
 * the team's season isn't over (a closed one can only take players off). */
export function playersSection(players: Player[], open = true): SafeHtml {
	const full = players.length >= MAX_PLAYERS;
	return html`<section class="panel stack" id="players" aria-labelledby="players-h"><h2 id="players-h">Players</h2>
<p class="small">The squad on Home and the players you can tag in highlight clips come from this list. A first name or a full name: only the team can see them.</p>
${players.length ? html`<ul class="players">${players.map((p) => playerRow(p, open))}</ul>` : html`<p>No players yet.</p>`}
${!open ? "" : full ? html`<p class="small">That's a full squad of ${MAX_PLAYERS}. Remove a player to add another.</p>`
	: html`<form method="post" action="/players" class="playerform add"><label class="pnum">Number<input name="number" type="number" min="0" max="99" inputmode="numeric" required></label>
<label class="pname">Name<input name="name" type="text" maxlength="40" required></label><button class="btn primary">Add a player</button></form>`}
<p class="small">${players.length} of ${MAX_PLAYERS} players.</p></section>`;
}
