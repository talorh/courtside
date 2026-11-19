// The admin area's Users page (/admin/users): the dashboard, then everyone on every team, a row for each team they're
// on, filtered by team, role, status and words and sorted by any column (the filters apply as each changes: admin.js;
// Apply without scripts); each row's More menu locks or unlocks them or takes them off that team; anyone locked who's
// on no team any more; and adding someone to a running team.
import type { AdminFrame } from "../../../app/admin-router.ts";
import { ROLE_LABELS, ROLES } from "../../../auth/permissions.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { notice, selectOptions } from "../../../ui/components.ts";
import { confirmButton } from "../../../ui/confirm.ts";
import type { Lock } from "../../../auth/locks-repository.ts";
import { teamLabel } from "../../teams/team-code.ts";
import type { Team } from "../../teams/team.ts";
import { type UserFilters, type UserSort, usersHref, USER_STATUSES } from "../users-filter.ts";
import type { UserRow } from "../users-repository.ts";
import type { UsersSummary } from "../users-summary.ts";
import { adminLayout } from "./admin-layout.ts";
import { lastUsed } from "./teams-page.ts";
import { usersDashboard } from "./users-dashboard.ts";

/** What a change just did (`?done=`): fixed words only, never anything from the address itself. */
export const USERS_MESSAGES: Record<string, string> = {
	added: "Added. They can sign in with their email now.", "added-locked": "Added. They're locked, so they can't sign in until they're unlocked.", removed: "Taken off the team. Their other teams stay theirs.",
	locked: "Locked. They're signed out everywhere and can't sign in.", unlocked: "Unlocked. They can sign in again.",
};

export interface UsersPage {
	frame: AdminFrame; now: Date; you: string; summary: UsersSummary; rows: UserRow[]; shown: UserRow[]; filters: UserFilters;
	teams: Team[]; strays: Lock[]; message?: string | null; error?: string; values?: { email: string; name: string; teamId: string; role: string };
}

type Shown = UsersPage & { label: (t: { code: string; seasonStart: number }) => string };

/** "Saints B12.1", with its season only where two seasons of the code are listed. */
function labeller(rows: UserRow[]): (t: { code: string; seasonStart: number }) => string {
	const seasons = new Map<string, Set<number>>();
	for (const r of rows) seasons.set(r.code, (seasons.get(r.code) ?? new Set()).add(r.seasonStart));
	return (t) => teamLabel(t, { season: (seasons.get(t.code)?.size ?? 0) > 1 });
}

const SORTS: Array<[UserSort, string]> = [["name", "Name"], ["email", "Email"], ["team", "Team"], ["role", "Role"], ["seen", "Last seen"]];

function header(f: UserFilters): SafeHtml {
	return html`${SORTS.map(([key, label]) => {
		const on = f.sort === key, dir = on && f.dir === "asc" ? "desc" : "asc";
		// Last seen's usual order is newest first: descending, as its arrow says.
		const down = (f.dir === "desc") !== (key === "seen");
		const sort = on ? html` aria-sort="${down ? "descending" : "ascending"}"` : "";
		return html`<th scope="col"${sort}><a href="${usersHref({ ...f, sort: key, dir })}">${label}${on ? html`<span aria-hidden="true">${down ? " ▼" : " ▲"}</span>` : ""}</a></th>`;
	})}<th scope="col"><span class="sr">Status and actions</span></th>`;
}

function filters(p: Shown): SafeHtml {
	const f = p.filters;
	const teams = [...new Map(p.rows.map((r) => [r.teamId, r])).values()].sort((a, b) => a.code.localeCompare(b.code) || b.seasonStart - a.seasonStart)
		.map((r) => ({ value: r.teamId, label: p.label(r) }));
	const pick = (name: string, label: string, any: string, options: Array<{ value: string; label: string }>, chosen: string) =>
		html`<label>${label}<select name="${name}"><option value="">${any}</option>${selectOptions(options, chosen)}</select></label>`;
	const filtered = Boolean(f.team || f.role || f.status || f.q);
	return html`<form method="get" action="/admin/users" class="panel logfilters" data-autosubmit>
<div class="lf-row">${pick("team", "Team", "Every team", teams, f.team)}${pick("role", "Role", "Every role", ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })), f.role)}
${pick("status", "Status", "Anyone", Object.entries(USER_STATUSES).map(([value, label]) => ({ value, label })), f.status)}
<label class="lf-q">Search<input type="search" name="q" value="${f.q}" maxlength="100" placeholder="A name, an email or a team"></label>
<label>Sort by<select name="sort">${selectOptions(SORTS.map(([value, label]) => ({ value, label })), f.sort)}</select></label>
<label>Order<select name="dir">${selectOptions([{ value: "asc", label: "Usual" }, { value: "desc", label: "Reversed" }], f.dir)}</select></label></div>
<div class="lf-foot"><span class="small">${p.shown.length === p.rows.length ? `${p.rows.length} rows` : `${p.shown.length} of ${p.rows.length} rows`}</span>
<span class="lf-acts">${filtered ? html`<a class="btn" href="${usersHref({ team: "", role: "", status: "", q: "", sort: f.sort, dir: f.dir })}">Clear filters</a>` : ""}<button class="btn primary">Apply</button></span></div></form>`;
}

function actions(r: UserRow, you: string, label: (t: UserRow) => string): SafeHtml {
	const who = r.name ? `${r.name} (${r.email})` : r.email;
	const lock = r.locked
		? confirmButton({ action: "/admin/users/unlock", label: "Unlock", question: `Unlock ${who}?`, consequence: "They can sign in again, on every team they're on.", yes: "Yes, unlock them", keep: "Keep them locked", fields: { email: r.email } })
		: r.isAdmin || r.email === you ? html`<span class="small">${r.email === you ? "You can't lock yourself" : "A site admin: remove them as an admin before locking"}</span>`
		: confirmButton({ action: "/admin/users/lock", label: "Lock", question: `Lock ${who}?`, consequence: "They're signed out on every device now and can't sign in, on any team, until they're unlocked. Their teams, videos and photos stay as they are.", yes: "Yes, lock them", keep: "Don't lock", fields: { email: r.email } });
	const remove = confirmButton({ action: "/admin/users/remove", label: `Take off ${label(r)}`, question: `Take ${who} off ${label(r)}?`,
		consequence: "They lose that team's pages; their other teams stay theirs. What they uploaded stays with the team.", yes: "Yes, take them off", keep: "Keep them", fields: { team: r.teamId, member: String(r.memberId) } });
	return html`<details class="rowmenu"><summary class="btn">More<span class="sr"> for ${who} on ${label(r)}</span></summary><div class="menu">${lock}<hr>${remove}</div></details>`;
}

function row(r: UserRow, p: Shown): SafeHtml {
	const tags = [r.locked && html`<span class="t warn">Locked</span>`, r.isAdmin && html`<span class="t src">Site admin</span>`, r.teamStatus !== "active" && html`<span class="t">Season over</span>`].filter(Boolean);
	return html`<tr${r.locked ? html` class="locked"` : ""}><td class="u-name"><b>${r.name || "No name"}</b></td><td class="u-email">${r.email}</td>
<td class="u-team">${p.label(r)}</td><td class="u-role">${ROLE_LABELS[r.role]}</td><td class="u-seen">${r.lastSeenAt ? lastUsed(r.lastSeenAt, p.now) : "Hasn't opened this team yet"}</td>
<td class="u-acts"><span class="u-tags">${tags}</span>${actions(r, p.you, p.label)}</td></tr>`;
}

function addForm(p: Shown): SafeHtml {
	const v = p.values ?? { email: "", name: "", teamId: p.filters.team, role: "watcher" };
	const running = p.teams.filter((t) => t.status === "active").map((t) => ({ value: t.id, label: teamLabel(t, { season: p.teams.filter((o) => o.code === t.code).length > 1 }) }));
	return html`<form class="panel stack" method="post" action="/admin/users" id="add"><h2>Add someone to a team</h2>
${p.error && p.values ? html`<div class="note warn" role="alert">${p.error}</div>` : ""}
<div class="formgrid"><label>Email<input name="email" type="email" required maxlength="254" autocomplete="off" value="${v.email}"></label>
<label>Name<input name="name" type="text" maxlength="80" autocomplete="off" value="${v.name}" placeholder="Steph's mum"></label>
<label>Team<select name="team" required>${selectOptions(running, v.teamId)}</select></label>
<label>Role<select name="role">${selectOptions(ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })), v.role)}</select></label></div>
<p class="small">They sign in with this email from now; the site sends nothing until they ask for a code. Someone already on the team keeps their role: change it on the team's Manage team.</p>
<div class="row-actions"><button class="btn primary">Add to team</button></div></form>`;
}

export function usersPage(page: UsersPage): SafeHtml {
	const p: Shown = { ...page, label: labeller(page.rows) };
	const list = p.shown.length ? html`<div class="tablewrap cards menus"><table class="users"><thead><tr>${header(p.filters)}</tr></thead><tbody>${p.shown.map((r) => row(r, p))}</tbody></table></div>`
		: html`<div class="panel empty"><b>No one matches.</b><p>Clear the filters to see everyone.</p></div>`;
	const strays = p.strays.length ? html`<section class="panel stack"><h2>Locked, on no team</h2><ul class="adminlist">${p.strays.map((l) => html`<li><span class="pname"><b>${l.email}</b><span class="small">Locked by ${l.lockedBy}</span></span>${confirmButton({ action: "/admin/users/unlock", label: "Unlock", question: `Unlock ${l.email}?`, consequence: "They can sign in again once they're on a team.", yes: "Yes, unlock them", keep: "Keep them locked", fields: { email: l.email } })}</li>`)}</ul></section>` : "";
	const head = html`<a class="btn primary" href="#add">Add someone</a>`;
	const lede = "Everyone on every team: a row for each team they're on. Locking someone stops them signing in anywhere; taking them off a team keeps their others.";
	return adminLayout({ title: "Users", current: "users", frame: p.frame, head, lede }, html`${notice(p.message)}${p.error && !p.values ? notice(p.error, "warn") : ""}${usersDashboard(p.summary)}${filters(p)}${list}${strays}${addForm(p)}`);
}
