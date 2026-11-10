import { assertChanged } from "../../shared/d1.ts";
import type { GameInput } from "./games-repository.ts";

/** The league (club.ts) or a tournament: the kinds of game PlayHQ carries. */
export type PlayhqCompetition = string;

export interface PlayhqFixture {
	id: number;
	competition: PlayhqCompetition;
	playhqTeamId: string;
	url: string;
	name: string;
	/** Checked every 8 hours (hourly while a tournament is on); off once the season or tournament is over. */
	autoCheck: boolean;
	gameCount: number;
	checkedAt: string | null;
	lastError: string | null;
	/** "No video for these games": every game it brings in, now or later, is marked No video. */
	noVideo: boolean;
	/** Its games' first and last days ('YYYY-MM-DD'; null with none), and when it was added. */
	firstGame: string | null; lastGame: string | null; createdAt: string;
}

interface FixtureRow {
	id: number;
	competition: PlayhqCompetition;
	playhq_team_id: string;
	url: string;
	name: string;
	auto_check: number;
	game_count: number;
	checked_at: string | null;
	last_error: string | null;
	no_video: number;
	first_game: string | null; last_game: string | null; created_at: string;
}

const GAMES = "games g WHERE g.team_id = f.team_id AND g.playhq_fixture_id = f.id AND g.deleted_at IS NULL";
const COLUMNS = `id, competition, playhq_team_id, url, name, auto_check, game_count, checked_at, last_error, no_video, created_at,
	(SELECT min(substr(g.starts_at, 1, 10)) FROM ${GAMES}) AS first_game, (SELECT max(substr(g.starts_at, 1, 10)) FROM ${GAMES}) AS last_game`;
const toFixture = (r: FixtureRow): PlayhqFixture => ({
	id: r.id, competition: r.competition, playhqTeamId: r.playhq_team_id, url: r.url, name: r.name,
	autoCheck: r.auto_check === 1, gameCount: r.game_count, checkedAt: r.checked_at, lastError: r.last_error, noVideo: r.no_video === 1,
	firstGame: r.first_game, lastGame: r.last_game, createdAt: r.created_at,
});

export async function listPlayhqFixtures(db: D1Database, teamId: string): Promise<PlayhqFixture[]> {
	const { results } = await db.prepare(`SELECT ${COLUMNS} FROM playhq_fixtures f WHERE team_id = ? ORDER BY id`).bind(teamId).all<FixtureRow>();
	return results.map(toFixture);
}

export const getPlayhqFixture = async (db: D1Database, teamId: string, id: number): Promise<PlayhqFixture | null> =>
	db.prepare(`SELECT ${COLUMNS} FROM playhq_fixtures f WHERE team_id = ? AND id = ?`).bind(teamId, id).first<FixtureRow>().then((r) => (r ? toFixture(r) : null));

/** null when that team is already added (a second tap of Add fixture). */
export async function addPlayhqFixture(db: D1Database, teamId: string, f: Pick<PlayhqFixture, "competition" | "playhqTeamId" | "url" | "name" | "noVideo" | "createdAt">): Promise<number | null> {
	const result = await db
		.prepare("INSERT INTO playhq_fixtures (team_id, competition, playhq_team_id, url, name, no_video, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
		.bind(teamId, f.competition, f.playhqTeamId, f.url, f.name, f.noVideo ? 1 : 0, f.createdAt)
		.run();
	return result.meta.changes === 1 ? result.meta.last_row_id : null;
}

/** Stops the checks. Its games stay, no longer linked to it (a fixture added later can be given the same id). */
export async function removePlayhqFixture(db: D1Database, teamId: string, id: number): Promise<void> {
	const [, removed] = await db.batch([
		db.prepare("UPDATE games SET playhq_fixture_id = NULL WHERE team_id = ? AND playhq_fixture_id = ?").bind(teamId, id),
		db.prepare("DELETE FROM playhq_fixtures WHERE team_id = ? AND id = ?").bind(teamId, id),
	]);
	assertChanged(removed!, "PlayHQ fixture");
}

/** The result of a check (gameCount and autoCheck left as they were when not given, e.g. a failed read). */
export function playhqCheckWrite(db: D1Database, teamId: string, id: number, c: { checkedAt: string; gameCount?: number; autoCheck?: boolean; lastError: string | null }) {
	return db
		.prepare(`UPDATE playhq_fixtures SET checked_at = ?, last_error = ?, game_count = COALESCE(?, game_count), auto_check = COALESCE(?, auto_check)
			WHERE team_id = ? AND id = ?`)
		.bind(c.checkedAt, c.lastError, c.gameCount ?? null, c.autoCheck === undefined ? null : Number(c.autoCheck), teamId, id);
}

/**
 * Fixtures still being checked that haven't been since `due.usually`, or, for a tournament that's on (`due.today` is
 * from its first game's day to its fourth, or its last game's if later: playhq-checks.ts), since `due.tournamentOn`.
 * A tournament past its last day isn't checked again: it stops on its last night, not at the next 8-hourly check.
 */
export async function listPlayhqFixturesDue(db: D1Database, teamId: string, due: { usually: string; tournamentOn: string; today: string }): Promise<PlayhqFixture[]> {
	const { results } = await db
		.prepare(`SELECT ${COLUMNS} FROM playhq_fixtures f WHERE team_id = ? AND auto_check = 1 AND (checked_at IS NULL OR checked_at < ?
			OR (competition = 'Tournament' AND checked_at < ? AND ?4 BETWEEN first_game AND max(last_game, date(first_game, '+3 days'))))
			AND NOT (competition = 'Tournament' AND first_game IS NOT NULL AND ?4 > max(last_game, date(first_game, '+3 days'))) ORDER BY id`)
		.bind(teamId, due.usually, due.tournamentOn, due.today)
		.all<FixtureRow>();
	return results.map(toFixture);
}

export interface LinkedGame {
	id: number;
	playhqGameId: string | null;
	deleted: boolean;
}

/** Games already linked to these PlayHQ games, deleted ones included (a game deleted here stays deleted). */
export async function gamesForPlayhqIds(db: D1Database, teamId: string, playhqIds: string[]): Promise<Map<string, LinkedGame>> {
	const { results } = await db
		.prepare("SELECT id, playhq_game_id, deleted_at FROM games WHERE team_id = ? AND playhq_game_id IN (SELECT value FROM json_each(?))")
		.bind(teamId, JSON.stringify(playhqIds))
		.all<{ id: number; playhq_game_id: string; deleted_at: string | null }>();
	return new Map(results.map((r) => [r.playhq_game_id, { id: r.id, playhqGameId: r.playhq_game_id, deleted: r.deleted_at !== null }]));
}

/** Adding a fixture: brings back a game of it deleted here earlier, as long as it has no video. */
export function reviveGameWrite(db: D1Database, teamId: string, id: number) {
	return db.prepare(`UPDATE games SET deleted_at = NULL WHERE team_id = ? AND id = ? AND deleted_at IS NOT NULL
		AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.team_id = games.team_id AND v.game_id = games.id AND v.deleted_at IS NULL)`).bind(teamId, id);
}

/** Games added by hand on these days for that competition, not linked to PlayHQ yet, oldest first. */
export async function unlinkedGamesOn(db: D1Database, teamId: string, competition: PlayhqCompetition, dates: string[]): Promise<Array<{ id: number; date: string }>> {
	const { results } = await db
		.prepare(`SELECT id, substr(starts_at, 1, 10) AS date FROM games WHERE team_id = ? AND competition = ? AND playhq_game_id IS NULL
			AND deleted_at IS NULL AND substr(starts_at, 1, 10) IN (SELECT value FROM json_each(?)) ORDER BY id`)
		.bind(teamId, competition, JSON.stringify(dates))
		.all<{ id: number; date: string }>();
	return results;
}

/** Adds the game, or (with `gameId`) brings it up to date with PlayHQ and links it. Already added: left alone.
 * `noVideoAt`: a new game from a No video fixture comes in marked No video. */
export function playhqGameWrite(db: D1Database, teamId: string, fixtureId: number, playhqGameId: string, input: GameInput, gameId: number | null, noVideoAt: string | null = null) {
	const values = [input.startsAt, input.competition, input.roundLabel, input.opponent, input.venue, playhqGameId, fixtureId];
	if (gameId === null) {
		return db.prepare(`INSERT OR IGNORE INTO games (team_id, starts_at, competition, round_label, opponent, venue, playhq_game_id, playhq_fixture_id, no_video_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(teamId, ...values, noVideoAt);
	}
	return db.prepare(`UPDATE games SET starts_at = ?, competition = ?, round_label = ?, opponent = ?, venue = ?, playhq_game_id = ?,
		playhq_fixture_id = ?, playhq_gone_at = NULL WHERE team_id = ? AND id = ? AND deleted_at IS NULL`).bind(...values, teamId, gameId);
}

/** Marks the fixture's games PlayHQ no longer lists (never deletes them). */
export function goneFromPlayhqWrite(db: D1Database, teamId: string, fixtureId: number, listedIds: string[], nowIso: string) {
	return db
		.prepare(`UPDATE games SET playhq_gone_at = ? WHERE team_id = ? AND playhq_fixture_id = ? AND playhq_gone_at IS NULL
			AND deleted_at IS NULL AND playhq_game_id NOT IN (SELECT value FROM json_each(?))`)
		.bind(nowIso, teamId, fixtureId, JSON.stringify(listedIds));
}
