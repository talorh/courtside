import { mailFrom } from "../../../club.ts";
// Onboarding a team: the form, then its team manager's welcome (emailed to them).
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { seasonLabel } from "../../../shared/time.ts";
import { notice, selectOptions } from "../../../ui/components.ts";
import type { Member } from "../../members/members-repository.ts";
import { teamLabel } from "../../teams/team-code.ts";
import type { Team } from "../../teams/team.ts";
import type { OnboardInput } from "../teams-admin-service.ts";
import { welcomeMessage } from "../welcome-message.ts";
import { adminLayout } from "./admin-layout.ts";
import { openTeamForm } from "./teams-page.ts";

/** `values`: what was typed, kept when the site refuses it (`error`). */
export function onboardPage(p: { frame: AdminFrame; seasons: number[]; values: OnboardInput; error?: string }): SafeHtml {
	const seasons = p.seasons.map((s, i) => ({ value: String(s), label: i === 0 ? `${seasonLabel(s)} (this season)` : seasonLabel(s) }));
	const v = p.values;
	return adminLayout({ title: "Onboard a team", current: "teams", frame: p.frame, back: { href: "/admin/teams", label: "Teams" } }, html`<form class="panel stack" method="post" action="/admin/teams">
<p class="small">Just enough to get them going: the team manager does the rest (families, players, games, the roster), with their own questions first on Help.</p>
${p.error ? html`<div class="note warn" role="alert">${p.error}</div>` : ""}
<div class="formgrid"><label>Team code<input name="code" type="text" required maxlength="20" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="g14.5" value="${v.code}" aria-describedby="code-hint">
<span class="small" id="code-hint">b or g, the age group, a dot, the team's number: b12.1, g14.5</span></label>
<label>Season<select name="season">${selectOptions(seasons, v.season || seasons[0]?.value)}</select></label></div>
<div class="formgrid"><label>Team manager's name<input name="managerName" type="text" required maxlength="80" autocomplete="off" value="${v.managerName}"></label>
<label>Team manager's email<input name="managerEmail" type="email" required maxlength="254" autocomplete="off" value="${v.managerEmail}"></label></div>
<label>Who to ask (optional)<input name="askName" type="text" maxlength="30" autocomplete="off" placeholder="Leave empty for &quot;your team manager&quot;" value="${v.askName}">
<span class="small">The name pages use when they say who to ask, like "Ask Sam". Empty: "Ask your team manager".</span></label>
<div class="row-actions"><button class="btn primary">Onboard the team</button><a class="btn quiet" href="/admin/teams">Cancel</a></div></form>`);
}

/** A team manager's welcome: whether the email went (`emailed`), and the same message to send another
 * way, or by email again. */
export function welcomePage(p: { frame: AdminFrame; team: Team; manager: Member | null; origin: string; emailed: "sent" | "failed" | null; staging: boolean }): SafeHtml {
	const label = teamLabel(p.team);
	const who = p.manager?.name.trim().split(/\s+/)[0] || "them";
	const went = p.emailed === "sent" ? notice(p.staging ? `Emailed to you: on staging it never goes to ${who}.` : `Emailed to ${who} at ${p.manager?.email}. Replies come to you.`)
		: p.emailed === "failed" ? notice(`The email to ${who} didn't go. Send the message below another way, or email it again.`, "warn") : "";
	const body = p.manager
		? html`${went}<section class="panel stack"><p>The welcome ${who} gets by email, from ${mailFrom()}. Copy it to send another way too, a text, say.</p>
<textarea id="welcome" class="msg" rows="20" readonly>${welcomeMessage({ team: p.team, manager: p.manager, origin: p.origin, byEmail: false })}</textarea>
<div class="row-actions"><button class="btn" type="button" data-copy="welcome">Copy</button><form method="post" action="/admin/teams/${p.team.id}/welcome"><button class="btn">Email it again</button></form></div></section>`
		: html`<div class="note warn" role="status">${label} has no team manager yet. Open it and add one on Manage team.</div>`;
	return adminLayout({ title: `${label} is ready`, current: "teams", frame: p.frame, back: { href: "/admin/teams", label: "Teams" }, scripts: ["/copy.js"] },
		html`${body}<div class="row-actions">${openTeamForm(p.team, "btn", `Open ${label}`)}<a class="btn quiet" href="/admin/teams">Back to Teams</a></div>`);
}
