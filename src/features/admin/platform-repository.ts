// The admin area's Platform page: figures across every team, and the alerts' standing. Site-wide by nature,
// so a CROSS_TEAM exception in scripts/rules.mjs.

/** Photos in Cloudflare Images now: every team's not deleted (a deleted photo's image is gone already). */
export async function countPhotosStored(db: D1Database): Promise<number> {
	return (await db.prepare("SELECT COUNT(*) AS n FROM photos WHERE deleted_at IS NULL").first<number>("n")) ?? 0;
}

/** How big the database is (bytes): D1 says with every answer; a local database doesn't (null). */
export async function databaseBytes(db: D1Database): Promise<number | null> {
	const size = ((await db.prepare("SELECT 1 AS one").all()).meta as { size_after?: unknown }).size_after;
	return typeof size === "number" ? size : null;
}
