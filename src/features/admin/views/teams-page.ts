// The admin area's Teams page (/admin/teams): every team, running ones first, each with Open and a
// More menu, and how many people they hold (no limit across teams).
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { addDays, formatDay, formatShortDate, localDate, localTime, seasonEndDeadline, seasonLabel } from "../../../shared/time.ts";
import { notice, selectOptions } from "../../../ui/components.ts";
import { ICON_PLUS } from "../../../ui/icons.ts";
import { teamLabel } from "../../teams/team-code.ts";
import { ROLE_LABELS } from "../../../auth/permissions.ts";
import { isBeingDeleted, type Team } from "../../teams/team.ts";
import { VIEWABLE } from "../view-as.ts";
import type { TeamSummary } from "../../teams/teams-repository.ts";
import { adminLayout } from "./admin-layout.ts";
import { setupProgress } from "../../teams/team-setup.ts";
import { dueDay } from "./team-close-page.ts";

/** What a change just did (`?done=`): fixed words only, never anything from the address itself. */
export const TEAMS_MESSAGES: Record<string, string> = {
	saved: "Changes saved.", closed: "Season ended. The team is closed and read-only now.", reopened: "Team reopened.",
	tonight: "It'll be deleted at 3am tonight.", kept: "Tonight's delete is cancelled.",
};

/** "Today", "Yesterday", else the day ("Thu 1 Oct 2026"), local time; "Never" when nobody has opened it yet. */
function lastUsed(iso: string | null, now: Date): string {
	if (!iso) return "Never";
	const day = localDate(new Date(iso));
	if (day === localDate(now)) return "Today";
	return day === localDate(addDays(now, -1)) ? "Yesterday" : formatDay(day);
}

/** Opening a team makes it the admin's current team (POST /teams/switch), as the team picker does, at `next` (its Home, or
 * a game from the Log). Each says which team (`aria`), for a screen reader going through a list of Open buttons. */
export const openTeamForm = (team: Pick<Team, "id" | "code" | "seasonStart">, className = "btn primary", label = "Open", next = "/", aria = `Open ${teamLabel(team)}`) => html`<form method="post" action="/teams/switch" class="inline"><input type="hidden" name="team" value="${team.id}"><input type="hidden" name="next" value="${next}"><button class="${className}" aria-label="${aria}">${label}</button></form>`;

/** When a closed team goes: its season's date, 3am tonight, or now (the 5-minute job is deleting it). */
function deleteWhen(t: Team, now: Date): string {
	if (isBeingDeleted(t, now)) return "Being deleted";
	if (!t.deleteAfter || t.deleteAfter === seasonEndDeadline(t.seasonStart)) return `To be deleted ${dueDay(t)}`;
	return `To be deleted at 3am ${formatShortDate(localTime(new Date(t.deleteAfter)))}`;
}

const ROLES = VIEWABLE.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

/** Opens the team as Watch only, Watch and film, a coach or a team manager would see it (features/admin/view-as.ts). */
const viewAs = (t: Team) => html`<form method="post" action="/view-as" class="viewas"><input type="hidden" name="team" value="${t.id}"><label>View as <select name="role">${selectOptions(ROLES, "watcher")}</select></label><button class="btn" aria-label="View ${teamLabel(t)} as this role">View</button></form>`;

/** Open, and a More menu: View as and Edit, then End season and close team while it's running, or
 * Reopen and Delete tonight once its season's over (Cancel tonight's delete once it's set). Each of those is its own page,
 * which says what it does and asks. A team being deleted can only be opened. */
function actions(t: Team, now: Date): SafeHtml {
	if (isBeingDeleted(t, now)) return html`<div class="row-actions">${openTeamForm(t, "btn")}</div>`;
	const link = (path: string, label: string, danger = false) => html`<a${danger ? html` class="danger"` : ""} href="/admin/teams/${t.id}/${path}">${label}</a>`;
	const tonight = t.deleteAfter !== seasonEndDeadline(t.seasonStart) ? link("keep", "Cancel tonight's delete") : link("delete", "Delete tonight", true);
	const items = t.status === "active" ? link("close", "End season and close team", true) : html`${link("reopen", "Reopen")}${tonight}`;
	return html`<div class="row-actions">${openTeamForm(t, t.status === "active" ? "btn primary" : "btn")}<details class="rowmenu"><summary class="btn">More<span class="sr"> for ${teamLabel(t)}</span></summary>
<div class="menu">${viewAs(t)}<hr>${link("edit", "Edit")}${items}</div></details></div>`;
}

/** A running team's setup checklist: "3 of 4" and what's still to do, or Done. */
function setupCell(s: TeamSummary): SafeHtml | string {
	if (s.team.status !== "active") return "";
	const p = setupProgress(s.setup);
	return p.left.length ? html`<span class="t warn">${p.done} of ${p.of}</span><span class="sub">Still to add: ${p.left.map((l) => l.what).join("; ")}</span>` : html`<span class="t src">Done</span>`;
}

function teamRow(s: TeamSummary, now: Date): SafeHtml {
	const t = s.team;
	const open = t.status === "active";
	const status = open ? html`<span class="t src">Active</span>` : html`<span class="t">Season over</span><span class="sub">${deleteWhen(t, now)}</span>`;
	return html`<tr${open ? "" : html` class="past"`}><td class="t-team"><b>${teamLabel(t)}</b><span class="sub">${t.name}</span></td>
<td class="t-season">${seasonLabel(t.seasonStart)}</td><td class="t-status">${status}</td>
<td class="t-members">${s.members}</td><td class="t-managers">${s.managers.join(", ") || "None"}</td>
<td class="t-setup">${setupCell(s)}</td><td class="t-seen">${lastUsed(s.lastSeenAt, now)}</td><td class="t-support">${s.openSupport ? html`<a href="/admin/support">${s.openSupport} open</a>` : "None"}</td>
<td class="t-acts">${actions(t, now)}</td></tr>`;
}

export function teamsListPage(p: { frame: AdminFrame; teams: TeamSummary[]; people: number; now: Date; message?: string | null }): SafeHtml {
	const open = p.teams.filter((s) => s.team.status === "active");
	const closed = p.teams.filter((s) => s.team.status !== "active");
	const head = html`<a class="btn primary" href="/admin/teams/new">${ICON_PLUS}Onboard a team</a>`;
	const lede = `${open.length} running, ${closed.length} past ${closed.length === 1 ? "season" : "seasons"}. ${p.people} ${p.people === 1 ? "person is" : "people are"} on a team.`;
	const list = p.teams.length ? html`<div class="tablewrap cards menus"><table class="teams"><thead><tr><th>Team</th><th>Season</th><th>Status</th><th>People</th><th>Team managers</th><th>Setup</th><th>Last used</th><th>Support</th><th><span class="sr">Open, and more</span></th></tr></thead>
<tbody>${open.map((s) => teamRow(s, p.now))}${closed.length ? html`<tr class="sectionrow"><td colspan="9">Past seasons</td></tr>${closed.map((s) => teamRow(s, p.now))}` : ""}</tbody></table></div>`
		: html`<div class="panel empty"><b>No teams yet.</b><p>Onboard the first one: it takes its code, its season and its team manager.</p></div>`;
	return adminLayout({ title: "Teams", current: "teams", frame: p.frame, head, lede }, html`${notice(p.message)}${list}`);
}
