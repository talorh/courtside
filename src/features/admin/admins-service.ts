import { CLUB, siteOrigin } from "../../club.ts";
// The site's admins: added and removed on the admin area's Admins page, each change
// logged (and emailed to every admin, so a misused login can't add an admin quietly).
import { logProblem } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import { badRequest, conflict, notFound } from "../../app/errors.ts";
import { addAdminWrite, isAdmin, removeAdminWrite } from "../../auth/admins-repository.ts";
import { isEmail } from "../members/members-service.ts";
import { adminLogStatement } from "./admin-log-repository.ts";
import { mailAdmins } from "./admin-mail.ts";


/** Every admin hears about it (the one added or removed too), so a misused login can't change the admins quietly. A
 * failed email doesn't undo the change: the log line says it didn't go. */
async function tellAdmins(deps: AppDeps, actor: string, action: "admin_added" | "admin_removed", email: string): Promise<void> {
	const added = action === "admin_added";
	const subject = added ? `${CLUB.siteName}: ${email} is a site admin now` : `${CLUB.siteName}: ${email} isn't a site admin any more`;
	const text = `${actor} ${added ? "added" : "removed"} ${email} as a site admin.\n\nAdmins: ${siteOrigin()}/admin/admins`;
	let note = "";
	try {
		await mailAdmins(deps, { subject, text }, added ? {} : { former: email });
	} catch (err) {
		console.error(JSON.stringify({ event: "admin_mail_failed", teamId: null, action, error: String(err) }));
		await logProblem(deps, { kind: "email_failed", teamId: null, who: actor, what: `The admins' email about ${email} didn't send`, error: err });
		note = ` (the email about it didn't go: ${err instanceof Error ? err.message : String(err)})`;
	}
	await adminLogStatement(deps.db, { device: deps.device, adminEmail: actor, teamId: null, action, detail: `${email}${note}`, at: deps.now().toISOString() }).run();
}

/** A real email, typed twice to be sure; someone removed before comes back. They're an admin on their next request. */
export async function addAdmin(deps: AppDeps, actor: string, input: { email: string; again: string }): Promise<string> {
	const email = input.email.trim().toLowerCase();
	if (!isEmail(email)) throw badRequest(`"${input.email.trim()}" isn't an email address.`);
	if (email !== input.again.trim().toLowerCase()) throw badRequest("The two emails don't match.");
	if (!(await addAdminWrite(deps.db, email, actor, deps.now().toISOString())).meta.changes) throw conflict(`${email} is an admin already.`);
	await tellAdmins(deps, actor, "admin_added", email);
	return email;
}

/** Never yourself (another admin can), and never the last admin. Takes effect on their next request. */
export async function removeAdmin(deps: AppDeps, actor: string, rawEmail: string): Promise<void> {
	const email = rawEmail.trim().toLowerCase();
	if (email === actor.toLowerCase()) throw conflict("You can't remove yourself: another admin can.");
	if (!(await removeAdminWrite(deps.db, email, deps.now().toISOString()))) {
		throw (await isAdmin(deps.db, email)) ? conflict("There must always be an admin: add another first.") : notFound("Admin");
	}
	await tellAdmins(deps, actor, "admin_removed", email);
}
