// People a site admin has locked (the admin area's Users page): no sign-in and no way into any team while locked. A
// person's, across every team, so a CROSS_TEAM exception in scripts/rules.mjs.

/** The statement for "is this email locked now", for batching with the memberships lookup (viewer.ts). */
export const isLockedStatement = (db: D1Database, email: string) =>
	db.prepare("SELECT COUNT(*) AS n FROM locked_people WHERE email = ?").bind(email);

export async function isLocked(db: D1Database, email: string): Promise<boolean> {
	return ((await isLockedStatement(db, email.toLowerCase()).first<number>("n")) ?? 0) > 0;
}

export interface Lock { email: string; lockedBy: string; lockedAt: string }

export async function listLocks(db: D1Database): Promise<Lock[]> {
	const { results } = await db.prepare("SELECT email, locked_by AS lockedBy, locked_at AS lockedAt FROM locked_people ORDER BY email").all<Lock>();
	return results;
}

/** Locks `email`, and in the same batch ends every device's sign-in and voids any code waiting to be typed, so nothing
 * already sent or signed in carries on. How many locks it made (0: locked already). */
export async function lockWrite(db: D1Database, email: string, by: string, nowIso: string): Promise<number> {
	const [locked] = await db.batch([
		db.prepare("INSERT INTO locked_people (email, locked_by, locked_at) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING").bind(email, by, nowIso),
		db.prepare("UPDATE sessions SET ended_at = ? WHERE email = ? AND ended_at IS NULL").bind(nowIso, email),
		db.prepare("UPDATE sign_in_codes SET voided_at = ? WHERE email = ? AND used_at IS NULL AND voided_at IS NULL").bind(nowIso, email),
	]);
	return locked?.meta.changes ?? 0;
}

/** Unlocks `email`: they can ask for a code again. How many it unlocked (0: wasn't locked). */
export async function unlockWrite(db: D1Database, email: string): Promise<number> {
	return (await db.prepare("DELETE FROM locked_people WHERE email = ?").bind(email).run()).meta.changes;
}
