// Which team owns a game, video, clip or photo, by its site-wide id: for a link to another of the
// viewer's teams (src/app/other-team.ts). Spans teams by design, so a CROSS_TEAM exception in scripts/check-rules.mjs.

export type Owned = "games" | "videos" | "clips" | "photos";

const SQL: Record<Owned, string> = {
	games: "SELECT team_id FROM games WHERE id = ? AND deleted_at IS NULL",
	videos: "SELECT team_id FROM videos WHERE id = ? AND deleted_at IS NULL",
	clips: "SELECT team_id FROM clips WHERE id = ? AND deleted_at IS NULL",
	photos: "SELECT team_id FROM photos WHERE id = ? AND deleted_at IS NULL",
};

export async function ownerTeamId(db: D1Database, kind: Owned, id: number): Promise<string | null> {
	return (await db.prepare(SQL[kind]).bind(id).first<string>("team_id")) ?? null;
}
