// The Users page's dashboard: people on the teams, how many used the site this week and this month, who hasn't signed
// in yet, who's on more than one team and who's locked; each team's people beside how many used it this month (a
// meter); and how many of each role. Each person counted once, by email.
import { ROLE_LABELS, ROLES } from "../../../auth/permissions.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { seasonLabel } from "../../../shared/time.ts";
import { teamLabel } from "../../teams/team-code.ts";
import type { TeamCount, UsersSummary } from "../users-summary.ts";
import { usersHref } from "../users-filter.ts";
import { meter } from "./costs-widgets.ts";

const n = (x: number) => x.toLocaleString("en-AU");
const BLANK = { team: "", role: "", status: "", q: "", sort: "name", dir: "asc" } as const;

/** A figure, its label, and where it leads: the table filtered to those people. */
const tile = (value: number, label: string, sub: string, href: string) =>
	html`<a class="unit" href="${href}"><b>${n(value)}</b><span>${label}</span><span class="sub">${sub}</span></a>`;

function teamRow(t: TeamCount): SafeHtml {
	const share = t.people ? t.active / t.people : 0;
	return html`<tr${t.running ? "" : html` class="past"`}><td class="ut-team"><a href="${usersHref({ ...BLANK, team: t.teamId })}"><b>${teamLabel(t)}</b></a><span class="sub">${seasonLabel(t.seasonStart)}${t.running ? "" : ", season over"}</span></td>
<td class="ut-people">${n(t.people)}</td><td class="ut-active"><span class="ut-meter">${meter(share, "ok", "fmeter")}</span>${n(t.active)} of ${n(t.people)}</td>
<td class="ut-never">${t.never ? html`<span class="t warn">${n(t.never)}</span>` : "None"}</td><td class="ut-mgrs">${t.managers ? n(t.managers) : html`<span class="t warn">None</span>`}</td></tr>`;
}

export function usersDashboard(s: UsersSummary): SafeHtml {
	const pct = (x: number) => (s.people ? `${Math.round((x / s.people) * 100)}% of them` : "");
	const roles = ROLES.slice().reverse().map((r) => html`<a class="chip" href="${usersHref({ ...BLANK, role: r })}">${ROLE_LABELS[r]} <span class="n">${n(s.roles[r])}</span></a>`);
	return html`<section class="panel stack usersdash" aria-labelledby="ud-h"><h2 id="ud-h">At a glance</h2>
<div class="units">${tile(s.people, "People on teams", `${n(s.admins)} of them site ${s.admins === 1 ? "admin" : "admins"}`, usersHref(BLANK))}
${tile(s.week, "Used it this week", pct(s.week), usersHref({ ...BLANK, status: "week" }))}
${tile(s.month, "Used it this month", pct(s.month), usersHref({ ...BLANK, status: "active" }))}
${tile(s.never, "Not signed in yet", "Added, but never opened the site", usersHref({ ...BLANK, status: "never" }))}
${tile(s.multi, "On more than one team", "A row for each team they're on", usersHref({ ...BLANK, status: "multi", sort: "email" }))}
${tile(s.locked, "Locked", "No sign-in, on any team", usersHref({ ...BLANK, status: "locked" }))}</div>
<nav class="chips" aria-label="People by role">${roles}</nav>
${s.teams.length ? html`<div class="tablewrap cards"><table class="userteams"><thead><tr><th scope="col">Team</th><th scope="col">People</th><th scope="col">Used it this month</th><th scope="col">Not opened it yet</th><th scope="col">Team managers</th></tr></thead>
<tbody>${s.teams.map(teamRow)}</tbody></table></div>` : ""}</section>`;
}
