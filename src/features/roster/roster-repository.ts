import { assertChanged } from "../../shared/d1.ts";
import { localDate } from "../../shared/time.ts";
import { type AwayPeriods, closeAway, type Presence } from "./roster-away.ts";
import { ALL_DUTIES, type RosterDuties } from "./roster-duties.ts";
import { type Duty, type Slot, weekOf } from "./roster-plan.ts";

export interface RosterFamily { id: number; surname: string }

/** Families on the roster now, by surname. */
export async function listFamilies(db: D1Database, teamId: string): Promise<RosterFamily[]> {
	const { results } = await db.prepare("SELECT id, surname FROM roster_families WHERE team_id = ? AND removed_at IS NULL ORDER BY surname COLLATE NOCASE")
		.bind(teamId).all<RosterFamily>();
	return results;
}

/** Every family that has ever been on it (removed ones still show on the weeks they did). */
export async function familyNames(db: D1Database, teamId: string): Promise<Map<number, string>> {
	const { results } = await db.prepare("SELECT id, surname FROM roster_families WHERE team_id = ?").bind(teamId).all<RosterFamily>();
	return new Map(results.map((f) => [f.id, f.surname]));
}

/**
 * Adds surnames not already on the roster (any case), from `week` (this week's Monday). A family taken off earlier comes
 * back with its past duties, so the fairness counts still include them, and its time away is closed at `week`
 * (roster-away.ts). `nowIso`: when a new family was added.
 */
export async function addFamilies(db: D1Database, teamId: string, surnames: string[], week: string, nowIso: string): Promise<void> {
	if (!surnames.length) return;
	const { results: gone } = await db.prepare("SELECT id, surname, removed_at AS removedAt, away FROM roster_families WHERE team_id = ? AND removed_at IS NOT NULL ORDER BY id DESC")
		.bind(teamId).all<{ id: number; surname: string; removedAt: string; away: string }>();
	const on = new Set((await listFamilies(db, teamId)).map((f) => f.surname.toLowerCase()));
	await db.batch(surnames.filter((s) => !on.has(s.toLowerCase())).map((s) => {
		const back = gone.find((g) => g.surname.toLowerCase() === s.toLowerCase());
		if (!back) return db.prepare("INSERT OR IGNORE INTO roster_families (team_id, surname, created_at) VALUES (?, ?, ?)").bind(teamId, s, nowIso);
		const away = closeAway(JSON.parse(back.away) as AwayPeriods, weekOf(localDate(new Date(back.removedAt))), week);
		return db.prepare("UPDATE roster_families SET removed_at = NULL, away = ? WHERE team_id = ? AND id = ? AND removed_at IS NOT NULL").bind(JSON.stringify(away), teamId, back.id);
	}));
}

/** Every family that's been on the roster, with when it was on it (roster-away.ts): from the week it was added, less
 * its time away (one taken off before that was kept is away from the week it was taken off). */
export async function familyPresence(db: D1Database, teamId: string): Promise<Presence[]> {
	const { results } = await db.prepare("SELECT id, created_at AS createdAt, removed_at AS removedAt, away FROM roster_families WHERE team_id = ?")
		.bind(teamId).all<{ id: number; createdAt: string; removedAt: string | null; away: string }>();
	return results.map((r) => {
		const away = JSON.parse(r.away) as AwayPeriods;
		const open = away.at(-1)?.[1] === null;
		return { id: r.id, joined: weekOf(localDate(new Date(r.createdAt))), away: r.removedAt && !open ? [...away, [weekOf(localDate(new Date(r.removedAt))), null]] : away };
	});
}

/** Takes a family off, and out of every week from `fromWeek` on (they're filled again by others); its time away starts then. */
export async function removeFamily(db: D1Database, teamId: string, id: number, fromWeek: string, nowIso: string): Promise<void> {
	const [removed] = await db.batch([
		db.prepare("UPDATE roster_families SET removed_at = ?, away = json_insert(away, '$[#]', json_array(?, NULL)) WHERE team_id = ? AND id = ? AND removed_at IS NULL").bind(nowIso, fromWeek, teamId, id),
		db.prepare("DELETE FROM roster_slots WHERE team_id = ? AND family_id = ? AND week >= ?").bind(teamId, id, fromWeek),
	]);
	assertChanged(removed!, "family");
}

export async function listSlots(db: D1Database, teamId: string, fromWeek: string, toWeek: string): Promise<Slot[]> {
	const { results } = await db.prepare(`SELECT week, duty, position, game_id AS gameId, family_id AS familyId, by_hand AS byHand FROM roster_slots
		WHERE team_id = ? AND week >= ? AND week < ? ORDER BY week, duty, game_id, position`).bind(teamId, fromWeek, toWeek).all<Omit<Slot, "byHand"> & { byHand: number }>();
	return results.map((s) => ({ ...s, byHand: s.byHand === 1 }));
}

/** Never a second slot for a family on the same game (or a second of the week's own duties), even when two people
 * open the Roster at once and both fill it. */
export function insertSlotWrite(db: D1Database, teamId: string, s: Slot) {
	return db.prepare(`INSERT OR IGNORE INTO roster_slots (team_id, week, duty, position, game_id, family_id, by_hand) SELECT ?, ?, ?, ?, ?, ?, ?
		WHERE NOT EXISTS (SELECT 1 FROM roster_slots WHERE team_id = ? AND week = ? AND game_id = ? AND family_id = ?)`)
		.bind(teamId, s.week, s.duty, s.position, s.gameId, s.familyId, s.byHand ? 1 : 0, teamId, s.week, s.gameId, s.familyId);
}

export function deleteSlotWrite(db: D1Database, teamId: string, week: string, duty: Duty, position: number, gameId: number) {
	return db.prepare("DELETE FROM roster_slots WHERE team_id = ? AND week = ? AND duty = ? AND position = ? AND game_id = ?").bind(teamId, week, duty, position, gameId);
}

/** Every slot of one week (Change: the week is written again in full). */
export function deleteWeekSlotsWrite(db: D1Database, teamId: string, week: string) {
	return db.prepare("DELETE FROM roster_slots WHERE team_id = ? AND week = ?").bind(teamId, week);
}

/** Generate roster: clears the roster's own picks from `fromWeek` on, to be shared out again. Duties set by hand stay. */
export async function clearSlotsFrom(db: D1Database, teamId: string, fromWeek: string): Promise<void> {
	await db.prepare("DELETE FROM roster_slots WHERE team_id = ? AND week >= ? AND by_hand = 0").bind(teamId, fromWeek).run();
}

export async function hasAnySlot(db: D1Database, teamId: string): Promise<boolean> {
	return (await db.prepare("SELECT 1 FROM roster_slots WHERE team_id = ? LIMIT 1").bind(teamId).first()) !== null;
}

/** The weeks the team manager decided the extra duty for, by Monday: true for Scorers only (off), false for All duties
 * (on, a tournament weekend included). A week with no row has the default. */
export async function extraOffWeeks(db: D1Database, teamId: string): Promise<Map<string, boolean>> {
	const { results } = await db.prepare("SELECT week, extra_off AS off FROM roster_weeks WHERE team_id = ?").bind(teamId).all<{ week: string; off: number }>();
	return new Map(results.map((r) => [r.week, r.off === 1]));
}

/** Scorers only this week (`off` true), or the extra duty back (`off` false). */
export async function setWeekExtraOff(db: D1Database, teamId: string, week: string, off: boolean, nowIso: string): Promise<void> {
	await db.prepare(`INSERT INTO roster_weeks (team_id, week, extra_off, updated_at) VALUES (?, ?, ?, ?)
		ON CONFLICT (team_id, week) DO UPDATE SET extra_off = excluded.extra_off, updated_at = excluded.updated_at`).bind(teamId, week, Number(off), nowIso).run();
}

/** The team's duties (roster-duties.ts): all of them until its team manager chooses. */
export async function getRosterDuties(db: D1Database, teamId: string): Promise<RosterDuties> {
	const row = await db.prepare("SELECT lollies, lollies_label, lollies_family_id, video, video_family_id FROM roster_duties WHERE team_id = ?").bind(teamId)
		.first<{ lollies: number; lollies_label: string; lollies_family_id: number | null; video: number; video_family_id: number | null }>();
	return row ? {
		lollies: row.lollies === 1, lolliesLabel: row.lollies_label, lolliesFamily: row.lollies_family_id, video: row.video === 1, videoFamily: row.video_family_id,
	} : ALL_DUTIES;
}

export async function saveRosterDuties(db: D1Database, teamId: string, d: RosterDuties, nowIso: string): Promise<void> {
	await db.prepare(`INSERT INTO roster_duties (team_id, lollies, lollies_label, lollies_family_id, video, video_family_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (team_id) DO UPDATE SET lollies = excluded.lollies, lollies_label = excluded.lollies_label, lollies_family_id = excluded.lollies_family_id,
		video = excluded.video, video_family_id = excluded.video_family_id, updated_at = excluded.updated_at`)
		.bind(teamId, Number(d.lollies), d.lolliesLabel, d.lolliesFamily, Number(d.video), d.videoFamily, nowIso).run();
}
