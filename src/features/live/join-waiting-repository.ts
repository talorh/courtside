// Whether a game of any team still waits on its team manager after its join gave up. The joiner's alert is the site's
// one, so it's cleared only once no team has such a game: a CROSS_TEAM exception in scripts/rules.mjs.

export async function anyJoinGivenUp(db: D1Database): Promise<boolean> {
	return (await db.prepare("SELECT 1 FROM videos WHERE join_failed_at IS NOT NULL AND deleted_at IS NULL LIMIT 1").first()) !== null;
}
