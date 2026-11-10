// The site's admins (managed on the admin page). Site-wide, so a CROSS_TEAM
// exception in scripts/check-rules.mjs. Read on every request, so removing an admin takes effect at once.

/** The statement for "is this email an admin now", for batching with the memberships lookup (viewer.ts). */
export const isAdminStatement = (db: D1Database, email: string) =>
	db.prepare("SELECT COUNT(*) AS n FROM admins WHERE email = ? AND removed_at IS NULL").bind(email);

export async function isAdmin(db: D1Database, email: string): Promise<boolean> {
	return ((await isAdminStatement(db, email).first<number>("n")) ?? 0) > 0;
}

export interface Admin { email: string; addedBy: string; addedAt: string }

export async function listAdmins(db: D1Database): Promise<Admin[]> {
	const { results } = await db.prepare("SELECT email, added_by AS addedBy, added_at AS addedAt FROM admins WHERE removed_at IS NULL ORDER BY added_at, email").all<Admin>();
	return results;
}

/** Adds `email`, or brings back an admin removed before. No change: an admin already. */
export const addAdminWrite = (db: D1Database, email: string, by: string, nowIso: string) => db
	.prepare(`INSERT INTO admins (email, added_by, added_at) VALUES (?, ?, ?)
		ON CONFLICT (email) DO UPDATE SET added_by = excluded.added_by, added_at = excluded.added_at, removed_at = NULL WHERE admins.removed_at IS NOT NULL`)
	.bind(email, by, nowIso).run();

/**
 * Removes `email` as an admin and, in the same batch, their hidden ways into teams (their real memberships are
 * untouched). Never the last admin: checked in the same statement as the change, so two admins removing each other at
 * once can't leave none. How many admins it removed (0 or 1).
 */
export async function removeAdminWrite(db: D1Database, email: string, nowIso: string): Promise<number> {
	const [removed] = await db.batch([
		db.prepare(`UPDATE admins SET removed_at = ? WHERE email = ? AND removed_at IS NULL
			AND EXISTS (SELECT 1 FROM admins o WHERE o.removed_at IS NULL AND o.email <> admins.email)`).bind(nowIso, email),
		db.prepare(`UPDATE members SET removed_at = ? WHERE email = ? AND hidden = 1 AND removed_at IS NULL
			AND EXISTS (SELECT 1 FROM admins a WHERE a.email = members.email AND a.removed_at IS NOT NULL)`).bind(nowIso, email),
	]);
	return removed?.meta.changes ?? 0;
}

/** `email`, if it was an admin and has been removed (to tell them so: features/admin/admin-mail.ts). */
export async function formerAdmin(db: D1Database, email: string): Promise<string | null> {
	return db.prepare("SELECT email FROM admins WHERE email = ? AND removed_at IS NOT NULL").bind(email).first<string>("email");
}
