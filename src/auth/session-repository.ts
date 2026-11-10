// A person's signed-in devices (the site's own sign-in): one row per device, 30 days from its code. A
// person's, not a team's, so a CROSS_TEAM exception in scripts/rules.mjs.

/** The view a device uses: the desktop view, or the mobile one (public/view.js says which, in a cookie). */
export type DeviceView = "desktop" | "mobile";
export const DEVICE_VIEWS: DeviceView[] = ["desktop", "mobile"];

/** `view`: null until the device's first page says; `countedWeek`: the Monday of the week the device was last counted in
 * (device-view-repository.ts). */
export interface Session {
	id: string; email: string; device: string; createdAt: string; expiresAt: string; lastSeenAt: string | null; view: DeviceView | null; countedWeek: string | null;
}

interface Row { id: string; email: string; device: string; created_at: string; expires_at: string; last_seen_at: string | null; view: DeviceView | null; counted_week: string | null }

const COLUMNS = "id, email, device, created_at, expires_at, last_seen_at, view, counted_week";
const toSession = (r: Row): Session => ({
	id: r.id, email: r.email, device: r.device, createdAt: r.created_at, expiresAt: r.expires_at, lastSeenAt: r.last_seen_at, view: r.view, countedWeek: r.counted_week,
});

export async function insertSession(db: D1Database, s: Omit<Session, "lastSeenAt" | "view" | "countedWeek">): Promise<void> {
	await db.prepare("INSERT INTO sessions (id, email, device, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
		.bind(s.id, s.email.toLowerCase(), s.device, s.createdAt, s.expiresAt).run();
}

/** The session with this id (the token's hash) if it's still good: not signed out, and not past its 30 days. */
export async function findLiveSession(db: D1Database, id: string, nowIso: string): Promise<Session | null> {
	const row = await db.prepare(`SELECT ${COLUMNS} FROM sessions WHERE id = ? AND ended_at IS NULL AND expires_at > ?`).bind(id, nowIso).first<Row>();
	return row ? toSession(row) : null;
}

/** Signed out on that device: its session is over from now. One already over is fine. */
export async function endSession(db: D1Database, id: string, nowIso: string): Promise<void> {
	await db.prepare("UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL").bind(nowIso, id).run();
}

export async function touchSession(db: D1Database, id: string, nowIso: string): Promise<void> {
	await db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(nowIso, id).run();
}

/** The device's view, as its latest page said. */
/** Sets the session's view where it differs, so a statement after it can tell from changes() whether it did. */
export const sessionViewStatement = (db: D1Database, id: string, view: DeviceView) => db.prepare("UPDATE sessions SET view = ? WHERE id = ? AND view IS NOT ?").bind(view, id, view);

/** How many devices are signed in right now (Platform's Sign-ins row). */
export async function countLiveSessions(db: D1Database, nowIso: string): Promise<number> {
	return (await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE ended_at IS NULL AND expires_at > ?").bind(nowIso).first<number>("n")) ?? 0;
}

/** The 3am job: sessions that are over (signed out, or past their 30 days) are deleted. */
export async function purgeSessions(db: D1Database, nowIso: string): Promise<number> {
	return (await db.prepare("DELETE FROM sessions WHERE ended_at IS NOT NULL OR expires_at <= ?").bind(nowIso).run()).meta.changes;
}
