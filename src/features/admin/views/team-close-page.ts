// Ending a team's season (it closes: read-only), reopening it, and deleting a closed team tonight or not
// ("End season": something very specific, not just Close). Each page says so when the team
// isn't in a state it applies to (its season's over already, say).
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatDay, formatShortDate, localTime, seasonEndDeadline } from "../../../shared/time.ts";
import { teamLabel } from "../../teams/team-code.ts";
import { isBeingDeleted, type Team } from "../../teams/team.ts";
import { adminLayout } from "./admin-layout.ts";

/** The day a season's footage is due to go: the last day before its deadline (midnight at the end of 31 Dec). */
export const dueDay = (team: Team) => formatDay(localTime(new Date(Date.parse(seasonEndDeadline(team.seasonStart)) - 60_000)));

const error = (message?: string) => (message ? html`<div class="note warn" role="alert">${message}</div>` : "");
const back = html`<p><a class="btn" href="/admin/teams">Back to Teams</a></p>`;
const TEAMS = { href: "/admin/teams", label: "Teams" };
const said = (message: string) => html`<div class="note" role="status">${message}</div>${back}`;
const yes = html`<input type="hidden" name="confirm" value="yes">`;

export function closePage(p: { frame: AdminFrame; team: Team; now: Date; values?: { when: string; confirmCode: string }; error?: string }): SafeHtml {
	const label = teamLabel(p.team);
	const page = (body: SafeHtml) => adminLayout({ title: `End ${label}'s season`, current: "teams", frame: p.frame, back: TEAMS }, body);
	if (p.team.status !== "active") return page(said(`${label}'s season is over already.`));
	const tonight = p.values?.when === "tonight";
	const choice = (value: string, checked: boolean, title: string, note: string) =>
		html`<label class="option"><input type="radio" name="when" value="${value}"${checked ? html` checked` : ""}><span>${title}<span class="small">${note}</span></span></label>`;
	return page(html`<form class="panel stack" method="post" action="/admin/teams/${p.team.id}/close">
<p>Ending the season closes the team's site: it's read-only straight away. Families can still watch, download and ask for things to be removed, but nothing new can be added. It moves to Past seasons on Teams.</p>
${error(p.error)}
<fieldset class="deletewhen"><legend>When should its videos and photos be deleted?</legend>
${choice("due", !tonight, `When they're due: ${dueDay(p.team)}`, "What Help has told families: the end of the year the season ends. Recommended.")}
${choice("tonight", tonight, "Tonight, at 3am", "Can be cancelled until then. Type the team's code to confirm.")}</fieldset>
<label>Type ${p.team.code} to delete it tonight<input name="confirmCode" type="text" maxlength="20" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="${p.team.code}" value="${p.values?.confirmCode ?? ""}"></label>
<p class="note warn">A season can't end while anything is uploading or streaming in the team. Its people can still sign in and watch while it's closed; once it's deleted, anyone on no other team can't sign in.</p>
<div class="row-actions"><button class="btn danger">End the season and close ${label}</button><a class="btn" href="/admin/teams">Not yet</a></div></form>`);
}

export function deletePage(p: { frame: AdminFrame; team: Team; now: Date; error?: string }): SafeHtml {
	const label = teamLabel(p.team);
	const page = (body: SafeHtml) => adminLayout({ title: `Delete ${label} tonight`, current: "teams", frame: p.frame, back: TEAMS }, body);
	if (p.team.status === "active") return page(said(`${label}'s season isn't over: end it first.`));
	if (isBeingDeleted(p.team, p.now)) return page(said(`${label} is being deleted already.`));
	return page(html`<form class="panel stack" method="post" action="/admin/teams/${p.team.id}/delete">
<p>${label}'s videos, photos and everything else go at 3am tonight instead of ${dueDay(p.team)}. Until then, Teams can cancel it.</p>
${error(p.error)}
<label>Type ${p.team.code} to confirm<input name="confirmCode" type="text" required maxlength="20" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="${p.team.code}"></label>
<div class="row-actions"><button class="btn danger">Delete ${label} tonight</button><a class="btn" href="/admin/teams">Keep it</a></div></form>`);
}

export function reopenPage(p: { frame: AdminFrame; team: Team; now: Date }): SafeHtml {
	const label = teamLabel(p.team);
	const page = (body: SafeHtml) => adminLayout({ title: `Reopen ${label}`, current: "teams", frame: p.frame, back: TEAMS }, body);
	if (p.team.status === "active") return page(said(`${label} is open already.`));
	if (isBeingDeleted(p.team, p.now)) return page(said(`Deleting ${label} has started, so it can't be reopened.`));
	return page(html`<form class="panel stack" method="post" action="/admin/teams/${p.team.id}/reopen">${yes}
<p>Its families can add videos and photos again, and it won't be deleted until it's closed again.</p>
<div class="row-actions"><button class="btn primary">Reopen ${label}</button><a class="btn" href="/admin/teams">Keep it closed</a></div></form>`);
}

/** Cancelling tonight's delete: back to when its footage is due. */
export function keepPage(p: { frame: AdminFrame; team: Team; now: Date }): SafeHtml {
	const label = teamLabel(p.team);
	const page = (body: SafeHtml) => adminLayout({ title: "Cancel tonight's delete", current: "teams", frame: p.frame, back: TEAMS }, body);
	if (p.team.status === "active") return page(said(`${label} is open.`));
	if (isBeingDeleted(p.team, p.now)) return page(said(`Deleting ${label} has started, so it can't be cancelled.`));
	if (!p.team.deleteAfter || p.team.deleteAfter === seasonEndDeadline(p.team.seasonStart)) return page(said(`${label} isn't set to be deleted tonight.`));
	return page(html`<form class="panel stack" method="post" action="/admin/teams/${p.team.id}/keep">${yes}
<p>${label} is set to be deleted at 3am ${formatShortDate(localTime(new Date(p.team.deleteAfter)))}. Cancel that, and it stays until ${dueDay(p.team)}.</p>
<div class="row-actions"><button class="btn primary">Cancel tonight's delete</button><a class="btn" href="/admin/teams">Leave it set</a></div></form>`);
}
