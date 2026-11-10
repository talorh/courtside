import { ROLE_LABELS, ROLES } from "../../../auth/permissions.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatClock, formatGameDate, localTime } from "../../../shared/time.ts";
import { notice, pageHead, selectOptions } from "../../../ui/components.ts";
import { confirmButton } from "../../../ui/confirm.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import { teamLabel } from "../../teams/team-code.ts";
import type { Player } from "../../players/players-repository.ts";
import { playersSection } from "../../players/views/players-section.ts";
import type { Member, MemberSort } from "../members-repository.ts";
import type { MemberActivity, Waiting } from "../members-service.ts";
import { type SeasonPack, seasonPackSection } from "../../season/views/season-pack-section.ts";
import type { SetupStep } from "../../teams/team-setup.ts";
import { setupCard } from "../../teams/views/setup-card.ts";

export const MEMBER_MESSAGES: Record<string, string> = {
	added: "Person added.", saved: "Changes saved.", removed: "Person removed. They lose access on their next click.",
	deleted: "Video deleted. The files are kept for 24 hours in case it was a mistake.", kept: "Request closed. The video stays.",
	clipdeleted: "Clip deleted.", clipkept: "Request closed. The clip stays.", photodeleted: "Photo deleted.", photokept: "Request closed. The photo stays.",
	signin: "Done. They can ask for a new code now.",
	imported: "Added the new people from your spreadsheet.", importnone: "Everyone on the sheet is on the team already, so nobody was added.",
	hdasked: "Stream is making the HD copies: every game's is ready to download in about 15 minutes.", hdready: "Every game's HD copy is ready to download.",
	hdsome: "Stream couldn't make some games' HD copies just now. Try again in a while; if it keeps happening, ask on Support.",
	"player-added": "Player added.", "player-saved": "Player changed.", "player-removed": "Player removed. Clips already tagged with them still say so.",
};

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

function lastSeen(iso: string | null): string {
	return iso ? formatGameDate(localTime(new Date(iso))) : "Never";
}

/** A Manage team address that keeps the list's order (the usual order, by role, needs nothing added). */
export const withSort = (path: string, sort: MemberSort) => (sort === "role" ? path : `${path}${path.includes("?") ? "&" : "?"}sort=${sort}`);

const SORTS: Array<{ value: MemberSort; label: string }> = [{ value: "name", label: "Name" }, { value: "role", label: "Role" }, { value: "seen", label: "Last seen" }];

/** Sort by Name, Role or Last seen: plain links like Watch games' chips, as phones hide the table's
 * headings. Each comes back to the list (#people), not the top of the page. */
const sortChips = (sort: MemberSort) => html`<nav class="chips sortby" aria-labelledby="sort-h"><span id="sort-h">Sort by</span>${SORTS.map((s) =>
	html`<a class="chip" href="${withSort("/manage", s.value)}#people" aria-current="${s.value === sort ? "true" : "false"}">${s.label}</a>`)}</nav>`;

function memberRow(m: Member, actor: Member, sort: MemberSort, team: string, open: boolean): SafeHtml {
	const formId = `member-${m.id}`;
	return html`<tr><td class="m-email">${m.email}</td>
<td class="m-name"><input name="name" type="text" maxlength="80" value="${m.name}" placeholder="Name" aria-label="Name for ${m.email}" form="${formId}"></td>
<td class="m-role"><form method="post" action="${withSort(`/members/${m.id}`, sort)}" id="${formId}"><select name="role" aria-label="Role for ${m.email}">${selectOptions(roleOptions, m.role)}</select></form></td>
<td class="m-seen">${lastSeen(m.lastSeenAt)}</td><td class="m-acts"><div>${open ? html`<button class="btn primary" form="${formId}" data-save>Save</button>` : ""}${m.id === actor.id ? "" : confirmButton({ action: withSort(`/members/${m.id}/remove`, sort), label: "Remove", question: `Remove ${m.name || m.email}?`, consequence: `They won't be able to sign in to ${team}.`, yes: "Yes, remove them" })}</div></td></tr>`;
}

/** Who's using the site: how many people, how recently they last opened it, and by role. */
function activityPanel(a: MemberActivity): SafeHtml {
	const stat = (n: number, label: string) => html`<div class="stat"><b>${n}</b><span>${label}</span></div>`;
	const roles = [...ROLES].reverse().filter((r) => a.byRole[r] > 0).map((r) => `${ROLE_LABELS[r]} ${a.byRole[r]}`).join(" · ");
	return html`<section class="panel stack" aria-labelledby="who-h"><h2 id="who-h">Who's using the site</h2>
<p><b>${a.week} of ${a.total} ${a.total === 1 ? "person" : "people"}</b> opened the site in the last 7 days.</p>
<div class="stats">${stat(a.week, "Last 7 days")}${stat(a.month, "8 to 30 days ago")}${stat(a.older, "Over 30 days ago")}${stat(a.never, "Not signed in yet")}</div>
<p class="small"><b>${roles}</b></p>
<p class="small">${a.total} ${a.total === 1 ? "person is" : "people are"} on the list. From each person's Last seen in the list below: the last time they
opened the site, on any phone or computer.</p></section>`;
}

/** People who asked for too many sign-in codes, or typed too many wrong ones, and are waiting (auth/sign-in-limits.ts): shown
 * only while someone is, with a button to let each of them in now. */
function waitingPanel(waiting: Waiting[]): SafeHtml | "" {
	if (!waiting.length) return "";
	const row = ({ member: m, until, tomorrow }: Waiting) => html`<li><span>${m.name ? html`<b>${m.name}</b> ` : ""}<span class="small">${m.email}, can ask again ${tomorrow ? "tomorrow " : ""}at ${formatClock(localTime(new Date(until)).slice(11))}</span></span>
<form method="post" action="/members/${m.id}/sign-in" class="inline"><button class="btn primary">Let them sign in</button></form></li>`;
	return html`<section class="panel stack" id="held" aria-labelledby="held-h"><h2 id="held-h">Waiting to sign in</h2>
<p class="small">They asked for too many sign-in codes, or typed too many wrong ones, so no more are sent for now. Checked it's
them? Let them sign in now.</p>
<ul class="heldlist">${waiting.map(row)}</ul></section>`;
}

/** Who films needs a role that can: said where roles are given, as a family on video duty with only Watch only people
 * can't upload or Go live on their turn. */
const FILMING = html`<p class="note filmnote">Anyone who'll film games needs <b>Watch and film</b> (or Coach or Team manager), so give that role to everyone on the roster's video duty. Someone on <b>Watch only</b> can't upload a game's video or Go live.</p>`;

/** Add a person: one row under the list, as Add a player is under the squad (their email, name and role). A new person
 * is Watch and film unless another role is picked. */
const addPerson = (sort: MemberSort) => html`<form method="post" action="${withSort("/members", sort)}" class="playerform add personadd" id="addperson"><label class="pemail">Email<input name="email" type="email" inputmode="email" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="254" required></label>
<label class="pname">Name<input name="name" type="text" maxlength="80"></label>
<label class="prole">Role<select name="role">${selectOptions(roleOptions, "filmer")}</select></label><button class="btn primary">Add a person</button></form>`;

/** Add from a spreadsheet: the template to fill in, then the sheet saved as CSV; its people are shown before they're added. */
const ADD_SHEET = html`<details class="panel"><summary class="btn">Add from a spreadsheet</summary>
<form method="post" action="/members/sheet" enctype="multipart/form-data" class="stack addgame">
<p class="small">One person per row: Name, Email and Role (Watch only, Watch and film, Coach or Team manager; blank is Watch only).
Start from the <a href="/members/sample.csv" download>template</a>. In Excel, save it as <b>CSV</b> (File → Save As); in Google
Sheets, File → Download → <b>CSV</b>. You'll see everyone before they're added, and people already on the team are left as they are.</p>
<label>Spreadsheet (CSV)<input name="file" type="file" accept=".csv,text/csv" required></label>
<div class="row-actions"><button class="btn primary">Read spreadsheet</button></div></form></details>`;

/** The line under each game's title, the team's own or the club's: changed on its own page. */
const GAME_LINES = html`<section class="panel stack" aria-labelledby="lines-h"><h2 id="lines-h">Game lines</h2>
<p class="small">The line under each game's title ("Nothing but net: the Saints beat Lakeside at Saints Stadium. Final score 34 to 28.").
Change them for your team, or add your own.</p><p><a class="btn" href="/manage/game-lines">Edit game lines</a></p></section>`;

export interface MembersPageProps {
	frame: PageFrame; members: Member[]; players: Player[]; message: string | null; removals: SafeHtml | ""; activity: MemberActivity; sort: MemberSort;
	/** The team's people waiting to sign in, and until when. */
	waiting: Waiting[];
	/** The setup checklist (none once the season's over), at the top; the end-of-season pack, at the bottom. */
	steps: SetupStep[]; pack: SeasonPack;
}

export function membersPage(p: MembersPageProps): SafeHtml {
	// A closed season: nobody new and no changes, but people can still be removed.
	const open = p.frame.team.status === "active";
	return layout({ title: "Manage team", frame: p.frame, current: "manage", scripts: ["/save-changed.js"] }, html`${pageHead("Team managers only", "Manage team")}
${notice(p.message)}${setupCard(p.steps)}${waitingPanel(p.waiting)}${p.removals}${playersSection(p.players, open)}
<div class="stack" id="people"><h2 id="people-h">People</h2>
<p class="small">Only these emails can use the site.${open ? " Add a person in the row at the bottom: they can sign in straight away, with a code sent to that email." : ""}</p>${open ? FILMING : ""}${sortChips(p.sort)}
<div class="tablewrap cards"><table class="people"><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Last seen</th><th></th></tr></thead>
<tbody>${p.members.map((m) => memberRow(m, p.frame.member, p.sort, teamLabel(p.frame.team), open))}</tbody></table></div>${open ? html`${addPerson(p.sort)}${ADD_SHEET}` : ""}</div>
${GAME_LINES}${activityPanel(p.activity)}${seasonPackSection(p.pack)}`);
}
