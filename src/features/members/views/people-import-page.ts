// Add from a spreadsheet's check: every person read from the sheet, new or on the team already (left as they are), and
// the rows it couldn't read, before anyone is added.
import { ROLE_LABELS } from "../../../auth/permissions.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { pageHead } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import type { SheetPerson } from "../members-import.ts";

const row = (p: SheetPerson) => html`<tr><td>${p.name}</td><td>${p.email}</td><td>${ROLE_LABELS[p.role]}</td><td>${p.onTeam
	? html`<span class="role">On the team already: left as they are</span>` : html`<span class="role c">New</span>`}</td></tr>`;

export function peopleImportPage(frame: PageFrame, p: { people: SheetPerson[]; problems: string[] }): SafeHtml {
	const fresh = p.people.filter((x) => !x.onTeam);
	const problems = p.problems.length
		? html`<div class="note warn" role="status"><b>Rows left out:</b><ul class="steps">${p.problems.map((x) => html`<li>${x}</li>`)}</ul>
<p class="small">Fix them in the spreadsheet and choose it again, or add those people one at a time.</p></div>` : "";
	const list = p.people.length ? html`<div class="tablewrap cards"><table class="people"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
<tbody>${p.people.map(row)}</tbody></table></div>` : "";
	const add = fresh.length
		? html`<form method="post" action="/members/import" class="stack"><input type="hidden" name="people" value="${JSON.stringify(fresh.map(({ email, name, role }) => ({ email, name, role })))}">
<p class="small">They can sign in straight away, with a code sent to their email. You can change anyone's name or role on Manage team afterwards.</p>
<div class="row-actions"><button class="btn primary">Add ${fresh.length} ${fresh.length === 1 ? "person" : "people"}</button><a class="btn" href="/manage#people">Cancel</a></div></form>`
		: html`<p>Nobody new to add.</p><div class="row-actions"><a class="btn" href="/manage#people">Back to Manage team</a></div>`;
	return layout({ title: "Check the people", frame, current: "manage" }, html`${pageHead("Manage team", "Check the people")}
${problems}${list}${add}`);
}
