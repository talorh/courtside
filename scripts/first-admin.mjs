// The site's first admins: deploy.config.ts firstAdmins, made admins by npm run staging and npm run release while the
// site has never had one (a new install). Never after: an admin removed in the admin area stays removed, and the site
// never removes its last admin (auth/admins-repository.ts). Tested in tests/scripts/first-admin.test.ts.

/** An email address with nothing that could break out of the SQL string it goes into. */
export const EMAIL = /^[^\s@'"\\,]+@[^\s@'"\\,]+\.[^\s@'"\\,]+$/;

/** deploy.config.ts firstAdmins (comma-separated), in lower case, each once; an error saying what to fix for the
 * placeholder or a mistake. */
export function firstAdminEmails(deploy) {
	const emails = (deploy.firstAdmins ?? "").split(",").map((e) => e.trim().toLowerCase());
	const wrong = emails.find((e) => !EMAIL.test(e));
	if (wrong !== undefined) throw new Error(`deploy.config.ts firstAdmins ("${deploy.firstAdmins ?? ""}") has "${wrong}", which isn't an email address: put the admins' emails there, comma-separated (INSTALL.md section 4).`);
	return [...new Set(emails)];
}

/** The insert, for cf d1 query: every first admin, only when the admins table has no row at all (removed admins count). */
export const firstAdminSql = (emails, nowIso, by) => `INSERT INTO admins (email, added_by, added_at) SELECT column1, '${by}', '${nowIso}'
	FROM (VALUES ${emails.map((e) => `('${e}')`).join(", ")}) WHERE NOT EXISTS (SELECT 1 FROM admins)`;
