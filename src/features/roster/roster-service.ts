import type { TeamDeps } from "../../app/deps.ts";
import { badRequest } from "../../app/errors.ts";
import { compareIso, localDate, localTime } from "../../shared/time.ts";
import { type GameWithVideo, listGamesWithVideoStatus } from "../games/games-repository.ts";
import { awayCredit } from "./roster-away.ts";
import { ALL_DUTIES, type RosterDuties } from "./roster-duties.ts";
import { type Duty, fillWeeks, sameSlot, type Slot, slotsFor, wantedFor, weekOf, type WeekNeed } from "./roster-plan.ts";
import { teamSeason } from "../teams/team-code.ts";
import type { Team } from "../teams/team.ts";
import {
	clearSlotsFrom, deleteSlotWrite, deleteWeekSlotsWrite, extraOffWeeks, familyPresence, getRosterDuties, hasAnySlot, insertSlotWrite, listFamilies, listSlots,
} from "./roster-repository.ts";

// The roster follows the fixture: every week of this season with a game has duties. Viewing the roster brings it up to
// date (weeks with new games get filled, weeks whose games went get cleared), once Generate roster has been tapped.

/** `extra`: the team's extra duty this week: off on a Scorers only week, and by default on a tournament weekend
 * (scorers only, so no lollies), until All duties this week. */
export interface RosterWeek { week: string; games: GameWithVideo[]; video: boolean; extra: boolean }

/** What a week needs (roster-plan.ts): its games, in playing order, each wanting its own duties. */
export const needOf = (w: RosterWeek): WeekNeed => ({ week: w.week, video: w.video, extra: w.extra, games: w.games.map((g) => ({ id: g.game.id, video: !g.game.noVideo })) });

/** This season's weeks with games, in date order; video duty unless every game that week is No video; the extra duty
 * unless the week is Scorers only, or every game is a tournament's and the team manager hasn't said All duties. */
export async function rosterWeeks(deps: TeamDeps): Promise<RosterWeek[]> {
	const season = teamSeason(deps.team);
	const from = `${season.start}-10-01`, to = `${season.end}-10-01`;
	const byWeek = new Map<string, GameWithVideo[]>();
	const [games, extraOff] = await Promise.all([listGamesWithVideoStatus(deps.db, deps.team.id), extraOffWeeks(deps.db, deps.team.id)]);
	for (const g of games.filter((r) => r.game.startsAt >= from && r.game.startsAt < to)) {
		const week = weekOf(g.game.startsAt.slice(0, 10));
		byWeek.set(week, [...(byWeek.get(week) ?? []), g]);
	}
	return [...byWeek].sort(([a], [b]) => compareIso(a, b))
		.map(([week, games]) => ({
			week, games: games.sort((a, b) => compareIso(a.game.startsAt, b.game.startsAt)), video: games.some((g) => !g.game.noVideo),
			extra: extraOff.has(week) ? !extraOff.get(week)! : !games.every((g) => g.game.competition === "Tournament"),
		}));
}

// The team's own season (each team is one season's squad), whatever today's date.
const seasonWeeks = (team: Team) => { const s = teamSeason(team); return { from: weekOf(`${s.start}-10-01`), to: `${s.end}-10-01` }; };

/** The duties a week has: the team's from this week on; every duty before it, so what was done stays (and counts). */
export const dutiesFor = (week: string, thisWeek: string, duties: RosterDuties) => (week >= thisWeek ? duties : ALL_DUTIES);

/**
 * Brings the slots in line with the fixture and the team's duties: drops slots for games that are gone, and at games
 * still to come, video at a No video game and a duty the team doesn't have; then fills empty slots at games to come.
 * `rebuild`: Generate roster, which first clears next week on.
 */
export async function syncRoster(deps: TeamDeps, rebuild = false): Promise<{ weeks: RosterWeek[]; slots: Slot[]; duties: RosterDuties }> {
	const { db } = deps;
	const [weeks, duties] = await Promise.all([rosterWeeks(deps), getRosterDuties(db, deps.team.id)]);
	const range = seasonWeeks(deps.team);
	const thisWeek = weekOf(localDate(deps.now()));
	const families = await listFamilies(db, deps.team.id);
	if (rebuild) {
		if (!families.length) throw badRequest("Add the families first.");
		if (!weeks.some((w) => w.week >= thisWeek)) throw badRequest("There are no upcoming games in the fixture yet. Add them, then Generate roster.");
		await clearSlotsFrom(db, deps.team.id, weeks.find((w) => w.week > thisWeek)?.week ?? "9999");
	} else if (deps.team.status !== "active" || !families.length || !(await hasAnySlot(db, deps.team.id))) {
		// A closed season's roster stays as it was; and nothing to fill before families and Generate roster.
		return { weeks, slots: await listSlots(db, deps.team.id, range.from, range.to), duties };
	}
	const need = new Map(weeks.map((w) => [w.week, w]));
	let slots = await listSlots(db, deps.team.id, range.from, range.to);
	// Stale: a week with no games left; a slot for a game that's gone; and at a game that hasn't started, a slot it no
	// longer wants (a dropped duty, video on a No video game). A game that's started keeps who was down for it.
	const now = localTime(deps.now());
	const stale = slots.filter((s) => {
		const w = need.get(s.week);
		const game = w?.games.find((g) => g.game.id === s.gameId)?.game;
		if (!w || !game) return true;
		return game.startsAt > now && !slotsFor(needOf(w), dutiesFor(s.week, thisWeek, duties)).some((x) => sameSlot(x, s));
	});
	slots = slots.filter((s) => !stale.includes(s));
	// Time off the roster counts as a fair share of those weeks (roster-away.ts), so a family back isn't caught up.
	const ids = families.map((f) => f.id);
	const credit = awayCredit(slots, await familyPresence(db, deps.team.id), ids, duties);
	// An empty duty at a game that's started isn't filled after the event.
	const upcoming = weeks.filter((w) => w.week >= thisWeek).map((w) => needOf({ ...w, games: w.games.filter((g) => g.game.startsAt > now) }));
	const added = fillWeeks(upcoming, ids, slots, duties, credit);
	const writes = [...stale.map((s) => deleteSlotWrite(db, deps.team.id, s.week, s.duty, s.position, s.gameId)),
		...added.map((s) => insertSlotWrite(db, deps.team.id, s))];
	if (writes.length) await db.batch(writes);
	return { weeks, slots: [...slots, ...added].sort((a, b) => compareIso(a.week, b.week)), duties };
}

/** Each family's count of each duty this season (removed families only if they did something). */
export function fairness(slots: Slot[], familyIds: number[]): Map<number, Record<Duty | "total", number>> {
	const table = new Map(familyIds.map((id) => [id, { scoring: 0, lollies: 0, video: 0, total: 0 }]));
	for (const s of slots) {
		const row = table.get(s.familyId) ?? { scoring: 0, lollies: 0, video: 0, total: 0 };
		row[s.duty]++;
		row.total++;
		table.set(s.familyId, row);
	}
	return table;
}

/** The Change form's field for a slot: "scoring1g42" (the game's id). */
export const pickName = (x: { duty: Duty; position: number; gameId: number }) => `${x.duty}${x.position}g${x.gameId}`;

/**
 * A change by hand to one week. A duty given a family is set by hand, and Generate roster keeps it.
 * One left as the roster's pick keeps its family (so an earlier week stays as it was, even a family since taken off),
 * unless that family is now set by hand to another duty that week: then the roster fills it fairly, as it fills any week.
 * A week before this one keeps every slot it holds unless a pick replaces it or takes its family; nothing is filled.
 */
export async function setWeek(deps: TeamDeps, week: string, picks: Partial<Record<string, number>>): Promise<void> {
	const { db } = deps;
	const weeks = await rosterWeeks(deps);
	const w = weeks.find((x) => x.week === week);
	if (!w) throw badRequest("That week has no games.");
	const families = (await listFamilies(db, deps.team.id)).map((f) => f.id);
	// Every family picked must be on the roster, whichever slot the pick names (a stale form's slot is ignored, its family isn't).
	if (Object.values(picks).some((f) => f !== undefined && !families.includes(f))) throw badRequest("Choose a family that's on the roster.");
	const range = seasonWeeks(deps.team);
	const slots = await listSlots(db, deps.team.id, range.from, range.to);
	const thisWeek = weekOf(localDate(deps.now()));
	const duties = dutiesFor(week, thisWeek, await getRosterDuties(db, deps.team.id));
	// A game that's been played (every game of an earlier week) keeps every slot it holds; only games still to come
	// are filled.
	const now = localTime(deps.now());
	const started = new Set(w.games.filter((g) => week < thisWeek || g.game.startsAt <= now).map((g) => g.game.id));
	const wanted = wantedFor(needOf(w), duties, slots, (id) => started.has(id));
	const byHand = wanted.flatMap((x) => {
		const familyId = picks[pickName(x)];
		return familyId ? [{ ...x, week, familyId, byHand: true }] : [];
	});
	if (byHand.some((s) => !families.includes(s.familyId))) throw badRequest("Choose a family that's on the roster.");
	// A family once a game (and once among the week's own duties), as the roster itself allows.
	if (new Set(byHand.map((s) => `${s.gameId}|${s.familyId}`)).size !== byHand.length) throw badRequest("A family can only do one duty a game.");
	// A family picked by hand comes off any other duty it held that week (the roster fills that one again).
	// At a game that's been played, only a pick for that slot, or for the family at that game, replaces what was done.
	const held = (s: Slot) => byHand.some((h) => sameSlot(h, s) || (h.familyId === s.familyId && (!started.has(s.gameId) || h.gameId === s.gameId)));
	const kept = slots.filter((s) => s.week === week && wanted.some((x) => sameSlot(x, s)) && !held(s))
		.map((s) => ({ ...s, byHand: false }));
	const around = [...slots.filter((s) => s.week !== week), ...byHand, ...kept];
	const toCome = needOf({ ...w, games: w.games.filter((g) => !started.has(g.game.id)) });
	const added = week < thisWeek ? [] : fillWeeks([toCome], families, around, duties, awayCredit(around, await familyPresence(db, deps.team.id), families, duties));
	await db.batch([deleteWeekSlotsWrite(db, deps.team.id, week), ...[...byHand, ...kept, ...added].map((s) => insertSlotWrite(db, deps.team.id, s))]);
}
