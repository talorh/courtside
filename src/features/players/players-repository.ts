// The team's players, and who's in each highlight clip. The team manager enters them on Manage team
// (players-service.ts has the rules).
import { conflict } from "../../app/errors.ts";

export interface Player {
	id: number;
	number: number;
	name: string;
}

/** "#23 Jordan" */
export const playerLabel = (p: Player) => `#${p.number} ${p.name}`;

/** Current players in number order. */
export async function listPlayers(db: D1Database, teamId: string): Promise<Player[]> {
	const { results } = await db
		.prepare("SELECT id, number, name FROM players WHERE team_id = ? AND removed_at IS NULL ORDER BY number, name")
		.bind(teamId)
		.all<Player>();
	return results;
}

/** Who's in each of these clips, in number order. */
export async function playersByClip(db: D1Database, teamId: string, clipIds: number[]): Promise<Map<number, Player[]>> {
	const byClip = new Map<number, Player[]>();
	if (!clipIds.length) return byClip;
	const { results } = await db
		.prepare(`SELECT cp.clip_id, p.id, p.number, p.name FROM clip_players cp JOIN players p ON p.id = cp.player_id AND p.team_id = cp.team_id
			WHERE cp.team_id = ? AND cp.clip_id IN (SELECT value FROM json_each(?)) ORDER BY p.number, p.name`)
		.bind(teamId, JSON.stringify(clipIds))
		.all<Player & { clip_id: number }>();
	for (const { clip_id, ...player } of results) byClip.set(clip_id, [...(byClip.get(clip_id) ?? []), player]);
	return byClip;
}

/** Replaces who's in the clip. `playerIds` must already be checked against listPlayers. */
export async function setClipPlayers(db: D1Database, teamId: string, clipId: number, playerIds: number[]): Promise<void> {
	await db.batch([
		db.prepare("DELETE FROM clip_players WHERE team_id = ? AND clip_id = ?").bind(teamId, clipId),
		...playerIds.map((id) => db.prepare("INSERT INTO clip_players (team_id, clip_id, player_id) VALUES (?, ?, ?)").bind(teamId, clipId, id)),
	]);
}

/** A current player of this team, or null. */
export async function getPlayer(db: D1Database, teamId: string, id: number): Promise<Player | null> {
	return db.prepare("SELECT id, number, name FROM players WHERE team_id = ? AND id = ? AND removed_at IS NULL").bind(teamId, id).first<Player>();
}

// The number's uniqueness (players_team_number) is checked first, but two team managers can save at the same moment:
// the second's write is refused the same way, never an error page.
const taken = (number: number, err: unknown) => (String(err).includes("UNIQUE constraint failed") ? conflict(`#${number} is already taken. Choose another number.`) : err);

export async function insertPlayer(db: D1Database, teamId: string, p: { number: number; name: string }): Promise<number> {
	const r = await db.prepare("INSERT INTO players (team_id, number, name) VALUES (?, ?, ?)").bind(teamId, p.number, p.name).run()
		.catch((err: unknown) => { throw taken(p.number, err); });
	return r.meta.last_row_id;
}

export async function updatePlayerRow(db: D1Database, teamId: string, id: number, p: { number: number; name: string }): Promise<void> {
	await db.prepare("UPDATE players SET number = ?, name = ? WHERE team_id = ? AND id = ? AND removed_at IS NULL").bind(p.number, p.name, teamId, id).run()
		.catch((err: unknown) => { throw taken(p.number, err); });
}

/** Off the squad: no longer offered for clips or shown on Home, but clips already tagged keep them. */
export async function markPlayerRemoved(db: D1Database, teamId: string, id: number, nowIso: string): Promise<void> {
	await db.prepare("UPDATE players SET removed_at = ? WHERE team_id = ? AND id = ? AND removed_at IS NULL").bind(nowIso, teamId, id).run();
}
