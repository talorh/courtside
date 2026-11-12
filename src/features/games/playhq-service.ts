import { CLUB } from "../../club.ts";
import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import { badRequest, conflict } from "../../app/errors.ts";
import { FetchBudgetSpent } from "../../platform/fetch-budget.ts";
import type { PlayhqGame, PlayhqTeamFixture } from "../../platform/playhq.ts";
import { runEach } from "../../shared/run-each.ts";
import { localDate } from "../../shared/time.ts";
import { usualTipOff } from "../teams/team-code.ts";
import type { GameInput } from "./games-repository.ts";
import {
	addPlayhqFixture, gamesForPlayhqIds, goneFromPlayhqWrite, listPlayhqFixturesDue, type PlayhqCompetition, type PlayhqFixture,
	playhqCheckWrite, playhqGameWrite, removePlayhqFixture, reviveGameWrite, unlinkedGamesOn,
} from "./playhq-repository.ts";
import { CHECK_EVERY_HOURS, stillChecked, TOURNAMENT_EVERY_HOURS } from "./playhq-checks.ts";
import { setPlayhqFixtureVideo } from "./playhq-video-repository.ts";
import { phaseOfGrade } from "./season-phase.ts";

export const playhqFormSchema = z.object({
	url: z.string().trim().min(1, "Paste the team's PlayHQ link").max(400),
	competition: z.enum([CLUB.league, "Tournament"]),
	noVideo: z.literal("1").optional(),
});

/**
 * A PlayHQ team page: https://www.playhq.com/<sport>/org/<club>/…/teams/<team-name>/<team id>[/…]. A My teams link
 * (/account/my-teams/…, a signed-in parent's own page, with their PlayHQ id on it) is private: said so, never stored.
 */
export function parsePlayhqLink(link: string): { tenant: string; teamId: string } {
	const url = URL.canParse(link) ? new URL(link) : null;
	const onPlayhq = url !== null && url.protocol === "https:" && /(^|\.)playhq\.com$/.test(url.hostname);
	if (onPlayhq && /^\/account(\/|$)/.test(url.pathname)) {
		throw badRequest("That's a private PlayHQ link (from My teams, when you're signed in to PlayHQ), so the site can't read it. Use the team's public page instead: find the team on playhq.com without signing in and copy its address. It has /org/ and /teams/ in it.");
	}
	const m = onPlayhq ? /^\/([a-z-]+)\/org\/.*\/teams\/[^/]+\/([0-9a-z]{4,16})(\/|$)/.exec(url.pathname) : null;
	if (!m) throw badRequest("That isn't a PlayHQ team link. Open the team on playhq.com and copy the address of its page.");
	return { tenant: m[1]!, teamId: m[2]! };
}

/** "Hillcrest U12 Boys 3" → "Hillcrest 3": every game in a team's fixture is its own age group and gender, whichever team. */
export const shortTeamName = (name: string) => name.replace(/\bU\d{1,2}\s+(Boys|Girls|Mixed)\b/i, " ").replace(/\s+/g, " ").trim();

/** `usualTime`: the team's usual tip-off (team-code.ts), until PlayHQ sets one. */
export function toPlayhqGameInput(competition: PlayhqCompetition, g: PlayhqGame, usualTime: string): GameInput {
	// VJBL rounds show as "Round 4" (gameTitle); a tournament keeps PlayHQ's own name ("Round 1", "Semi Final").
	const round = (competition === CLUB.league && /^Round (\d+)$/i.exec(g.round)?.[1]) || g.round;
	return {
		startsAt: `${g.date}T${g.time ?? usualTime}`, competition, roundLabel: round.slice(0, 40),
		opponent: g.opponent ? shortTeamName(g.opponent).slice(0, 80) : "TBC", venue: g.venue.slice(0, 120),
		// Which phase of the league season, from the game's grade; a tournament has none.
		phase: competition === CLUB.league ? phaseOfGrade(g.grade ?? "") : null,
	};
}

/**
 * One database batch: new games added, changed ones updated, ones PlayHQ no longer lists marked (never deleted).
 * A game deleted here stays deleted on later checks; `revive` (adding the fixture) brings such games back first,
 * as adding a fixture means "bring in all its games".
 */
async function bringUpToDate(deps: TeamDeps, fixture: PlayhqFixture, team: PlayhqTeamFixture, revive = false): Promise<void> {
	const { db } = deps;
	const now = deps.now();
	const ids = team.games.map((g) => g.id);
	const linked = await gamesForPlayhqIds(db, deps.team.id, ids);
	const byHand = await unlinkedGamesOn(db, deps.team.id, fixture.competition, team.games.map((g) => g.date));
	const revived = revive ? [...linked.values()].filter((l) => l.deleted).map((l) => reviveGameWrite(db, deps.team.id, l.id)) : [];
	const writes = [...revived, ...team.games.filter((g) => revive || !linked.get(g.id)?.deleted).map((g) => {
		const handIndex = linked.has(g.id) ? -1 : byHand.findIndex((h) => h.date === g.date);
		const gameId = linked.get(g.id)?.id ?? (handIndex >= 0 ? byHand.splice(handIndex, 1)[0]!.id : null);
		return playhqGameWrite(db, deps.team.id, fixture.id, g.id, toPlayhqGameInput(fixture.competition, g, usualTipOff(deps.team.code)), gameId, fixture.noVideo ? now.toISOString() : null);
	})];
	// An empty fixture (not out yet, or PlayHQ mid-change) marks nothing.
	if (ids.length) writes.push(goneFromPlayhqWrite(db, deps.team.id, fixture.id, ids, now.toISOString()));
	// When checks stop (playhq-checks.ts), from the games PlayHQ lists now.
	const days = team.games.map((g) => g.date).sort();
	const autoCheck = stillChecked({ ...fixture, firstGame: days[0] ?? null, lastGame: days.at(-1) ?? null }, localDate(now));
	writes.push(playhqCheckWrite(db, deps.team.id, fixture.id, { checkedAt: now.toISOString(), gameCount: ids.length, autoCheck, lastError: null }));
	await db.batch(writes);
}

/** Reads the fixture from PlayHQ (unless `read` already has) and brings its games up to date. A failure is recorded on the fixture and rethrown. */
export async function checkPlayhqFixture(deps: TeamDeps, fixture: PlayhqFixture, read?: PlayhqTeamFixture, revive = false): Promise<void> {
	try {
		const { tenant, teamId } = parsePlayhqLink(fixture.url);
		const team = read ?? (await deps.playhq.teamFixture(tenant, teamId));
		if (!team) throw new Error("PlayHQ has no team at this link any more. Check it on playhq.com.");
		await bringUpToDate(deps, fixture, team, revive);
	} catch (err) {
		// Out of calls for this cron run isn't PlayHQ's fault: the next run checks it, with nothing to show.
		if (err instanceof FetchBudgetSpent) throw err;
		const lastError = (err instanceof Error ? err.message : String(err)).slice(0, 300);
		// A fixture that keeps failing (a team PlayHQ took down) stops too, by the games it has here.
		const autoCheck = stillChecked(fixture, localDate(deps.now()));
		await playhqCheckWrite(deps.db, deps.team.id, fixture.id, { checkedAt: deps.now().toISOString(), lastError, autoCheck }).run();
		throw err;
	}
}

export const isPlayhqLink = (link: string) => URL.canParse(link) && /(^|\.)playhq\.com$/.test(new URL(link).hostname);

/** Add fixture: checks the link is a PlayHQ team, saves it and imports its games. Returns the fixture's id. */
export async function addPlayhqFixtureFromLink(deps: TeamDeps, form: z.infer<typeof playhqFormSchema>): Promise<number> {
	const { tenant, teamId } = parsePlayhqLink(form.url);
	const team = await deps.playhq.teamFixture(tenant, teamId).catch((err: unknown) => {
		throw badRequest("Couldn't reach PlayHQ just now. Try again in a minute.", err);
	});
	if (!team) throw badRequest("PlayHQ has no team at that link. Open the team on playhq.com and copy the address of its page again.");
	const fixture = { competition: form.competition, playhqTeamId: teamId, url: form.url, name: team.name, noVideo: form.noVideo === "1", createdAt: deps.now().toISOString() };
	const id = await addPlayhqFixture(deps.db, deps.team.id, fixture);
	if (id === null) throw conflict("That PlayHQ fixture is already added. Tap Check now on it instead.");
	try {
		const fresh = { ...fixture, id, autoCheck: true, gameCount: 0, checkedAt: null, lastError: null, firstGame: null, lastGame: null };
		await checkPlayhqFixture(deps, fresh, team, true);
	} catch (err) {
		// Not added after all, so trying again works (rather than "already added").
		await removePlayhqFixture(deps.db, deps.team.id, id);
		throw err;
	}
	// Games it took over (added by hand, or brought back) are marked too; new ones already were.
	if (fixture.noVideo) await setPlayhqFixtureVideo(deps.db, deps.team.id, id, true, deps.now().toISOString());
	return id;
}

/**
 * Cron: each fixture still being checked, once every 8 hours; a tournament every hour while it's on (its finals are
 * only added once the teams are known, sometimes hours before they're played). When they stop: playhq-checks.ts.
 */
export async function checkPlayhqFixturesDue(deps: TeamDeps) {
	const now = deps.now();
	const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
	const due = await listPlayhqFixturesDue(deps.db, deps.team.id, { usually: hoursAgo(CHECK_EVERY_HOURS), tournamentOn: hoursAgo(TOURNAMENT_EVERY_HOURS), today: localDate(now) });
	const { succeeded, errors } = await runEach(due, (f) => checkPlayhqFixture(deps, f));
	return { playhqChecked: succeeded, errors };
}
