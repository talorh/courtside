// The admin area's Admins page: who the site's admins are, adding one (the email typed
// twice) and removing one (never yourself).
import type { AdminFrame } from "../../../app/admin-router.ts";
import type { Admin } from "../../../auth/admins-repository.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime } from "../../../shared/time.ts";
import { notice } from "../../../ui/components.ts";
import { confirmButton } from "../../../ui/confirm.ts";
import { adminLayout } from "./admin-layout.ts";

/** What a change just did (`?done=`): fixed words only, never anything from the address itself. */
export const ADMINS_MESSAGES: Record<string, string> = {
	added: "Admin added. They can open the admin area straight away.", removed: "Admin removed. They can't open the admin area any more.",
};

function row(a: Admin, you: string): SafeHtml {
	const added = !a.addedBy.includes("@") ? "The first admin" : `Added by ${a.addedBy}, ${formatGameDate(localTime(new Date(a.addedAt)))}`;
	const remove = a.email === you ? html`<span class="small">You can't remove yourself</span>` : confirmButton({
		action: "/admin/admins/remove", label: "Remove", question: `Remove ${a.email} as an admin?`, fields: { email: a.email },
		consequence: "They lose the admin area and their way into teams they aren't in. Teams they're really in stay theirs.", yes: "Yes, remove them",
	});
	return html`<li><span class="pname"><b>${a.email}${a.email === you ? " (you)" : ""}</b><span class="small">${added}</span></span>${remove}</li>`;
}

export function adminsPage(p: { frame: AdminFrame; admins: Admin[]; you: string; message?: string | null; values?: { email: string; again: string }; error?: string }): SafeHtml {
	const v = p.values ?? { email: "", again: "" };
	return adminLayout({ title: "Admins", current: "admins", frame: p.frame }, html`${notice(p.message)}
<section class="panel stack"><p class="small">Admins can open every team and see everything in it. Every change here is logged.</p>
<ul class="adminlist">${p.admins.map((a) => row(a, p.you))}</ul></section>
<form class="panel stack" method="post" action="/admin/admins"><h2>Add an admin</h2>
${p.error ? html`<div class="note warn" role="alert">${p.error}</div>` : ""}
<div class="formgrid"><label>Email<input name="email" type="email" required maxlength="254" autocomplete="off" value="${v.email}"></label>
<label>Email again<input name="again" type="email" required maxlength="254" autocomplete="off" value="${v.again}"></label></div>
<p class="small">Also add them to the maintenance page's list (<code>npm run maintenance -- deploy</code>), so they can get through during maintenance.</p>
<div class="row-actions"><button class="btn primary">Add admin</button></div></form>`);
}
