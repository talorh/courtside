// Editing a team: who to ask any time; its code and season only until its first game.
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { seasonLabel } from "../../../shared/time.ts";
import { selectOptions } from "../../../ui/components.ts";
import { teamLabel } from "../../teams/team-code.ts";
import type { Team } from "../../teams/team.ts";
import type { EditInput } from "../team-lifecycle-service.ts";
import { adminLayout } from "./admin-layout.ts";

/** `values`: what was typed, kept when the site refuses it (`error`). */
export function editPage(p: { frame: AdminFrame; team: Team; seasons: number[]; locked: boolean; values?: EditInput; error?: string }): SafeHtml {
	const v = p.values ?? { code: p.team.code, season: String(p.team.seasonStart), askName: p.team.askName ?? "" };
	const seasons = [...new Set([p.team.seasonStart, ...p.seasons])].sort().map((s) => ({ value: String(s), label: seasonLabel(s) }));
	const season = p.locked
		? html`<label>Season<input name="season" type="text" readonly value="${v.season}" aria-describedby="locked"></label>`
		: html`<label>Season<select name="season">${selectOptions(seasons, v.season)}</select></label>`;
	return adminLayout({ title: `Edit ${teamLabel(p.team)}`, current: "teams", frame: p.frame, back: { href: "/admin/teams", label: "Teams" } }, html`<form class="panel stack" method="post" action="/admin/teams/${p.team.id}">
${p.error ? html`<div class="note warn" role="alert">${p.error}</div>` : ""}
<div class="formgrid"><label>Team code<input name="code" type="text" required maxlength="20" autocapitalize="none" autocomplete="off" spellcheck="false" value="${v.code}"${p.locked ? html` readonly aria-describedby="locked"` : ""}></label>
${season}</div>
${p.locked ? html`<p class="small" id="locked">Its code and season stay as they are now it has games.</p>` : html`<p class="small">Change the code or season only to fix a mistake: they can't change once the team has a game.</p>`}
<label>Who to ask (optional)<input name="askName" type="text" maxlength="30" autocomplete="off" placeholder="Leave empty for &quot;your team manager&quot;" value="${v.askName}">
<span class="small">The name pages use when they say who to ask, like "Ask Sam". Empty: "Ask your team manager".</span></label>
<div class="row-actions"><button class="btn primary">Save</button><a class="btn quiet" href="/admin/teams">Cancel</a></div></form>`);
}
