// The counts behind a team's setup checklist (team-setup.ts), in one query.
import type { SetupCounts } from "./team-setup.ts";

/** Current people on the list with the role, for the team `team`. */
const people = (team: string, role: string) => `(SELECT COUNT(*) FROM members m WHERE m.team_id = ${team} AND m.removed_at IS NULL AND m.hidden = 0 AND m.role = '${role}')`;

/** The subqueries for the team `t.id` (or `?1` alone), shared with the admin area's Teams (teams-repository.ts). */
export const SETUP_COUNTS = (team: string) => `
	(SELECT COUNT(*) FROM players p WHERE p.team_id = ${team} AND p.removed_at IS NULL) AS setup_players,
	${people(team, "filmer")} AS setup_filmers,
	${people(team, "coach")} AS setup_coaches,
	${people(team, "manager")} AS setup_managers,
	(SELECT COUNT(*) FROM games g WHERE g.team_id = ${team} AND g.deleted_at IS NULL) AS setup_games,
	(SELECT COUNT(*) FROM roster_slots r WHERE r.team_id = ${team}) AS setup_duties`;

export interface SetupRow {
	setup_players: number; setup_filmers: number; setup_coaches: number; setup_managers: number; setup_games: number; setup_duties: number;
}

export const toSetup = (r: SetupRow): SetupCounts => ({
	players: r.setup_players, filmers: r.setup_filmers, coaches: r.setup_coaches, managers: r.setup_managers, games: r.setup_games, duties: r.setup_duties,
});

export async function setupCounts(db: D1Database, teamId: string): Promise<SetupCounts> {
	const row = await db.prepare(`SELECT ${SETUP_COUNTS("?1")}`).bind(teamId).first<SetupRow>();
	return row ? toSetup(row) : { players: 0, filmers: 0, coaches: 0, managers: 0, games: 0, duties: 0 };
}
