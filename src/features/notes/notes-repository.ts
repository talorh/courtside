export interface CoachNote {
	id: number;
	gameId: number;
	atSeconds: number | null;
	body: string;
	authorName: string;
	createdAt: string;
}

export async function listNotes(db: D1Database, teamId: string, gameId: number): Promise<CoachNote[]> {
	const { results } = await db
		.prepare(`SELECT n.id, n.game_id, n.at_seconds, n.body, n.created_at, COALESCE(NULLIF(m.name, ''), m.email) AS author
			FROM coach_notes n JOIN members m ON m.id = n.created_by AND m.team_id = n.team_id
			WHERE n.team_id = ? AND n.game_id = ? AND n.deleted_at IS NULL
			ORDER BY n.at_seconds IS NULL, n.at_seconds, n.id`)
		.bind(teamId, gameId)
		.all<{ id: number; game_id: number; at_seconds: number | null; body: string; created_at: string; author: string }>();
	return results.map((r) => ({ id: r.id, gameId: r.game_id, atSeconds: r.at_seconds, body: r.body, authorName: r.author, createdAt: r.created_at }));
}

export async function insertNote(
	db: D1Database, teamId: string, n: { gameId: number; atSeconds: number | null; body: string; createdBy: number },
): Promise<void> {
	await db
		.prepare("INSERT INTO coach_notes (team_id, game_id, at_seconds, body, created_by) VALUES (?, ?, ?, ?, ?)")
		.bind(teamId, n.gameId, n.atSeconds, n.body, n.createdBy)
		.run();
}

/** The note's game, or null if there's no such (live) note. */
export async function getNoteGameId(db: D1Database, teamId: string, id: number): Promise<number | null> {
	return db.prepare("SELECT game_id FROM coach_notes WHERE team_id = ? AND id = ? AND deleted_at IS NULL").bind(teamId, id).first<number>("game_id");
}

export async function softDeleteNote(db: D1Database, teamId: string, id: number, nowIso: string): Promise<void> {
	await db.prepare("UPDATE coach_notes SET deleted_at = ? WHERE team_id = ? AND id = ? AND deleted_at IS NULL").bind(nowIso, teamId, id).run();
}
