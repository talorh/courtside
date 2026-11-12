import { CLUB } from "../club.ts";
// PlayHQ (the fixtures platform Australian basketball associations use): a team's games, read from the same public feed playhq.com's team pages use.
// It isn't PlayHQ's official API (that needs a key PlayHQ issues to clubs), so it can change without notice; the
// Fixture page then says it couldn't read PlayHQ, and nothing here changes.

const ENDPOINT = "https://api.playhq.com/graphql";
const QUERY = `query teamFixture($teamID: ID!) {
  discoverTeam(teamID: $teamID) { id name season { name } grade { name } }
  discoverTeamFixture(teamID: $teamID) { name grade { name } fixture { games { id date grade { name }
    allocation { time dateTimeList { date time } court { name venue { name } } }
    home { ... on ProvisionalTeam { name } ... on DiscoverTeam { id name } }
    away { ... on ProvisionalTeam { name } ... on DiscoverTeam { id name } } } } }
}`;

export interface PlayhqGame {
	id: string;
	/** As PlayHQ names it: "Round 4", "Finals Round 1", "Preliminary Final". */
	round: string;
	/** 'YYYY-MM-DD' and 'HH:MM', local time; time is null until PlayHQ sets one. */
	date: string;
	time: string | null;
	/** The other team, as PlayHQ names it; null when not known yet. */
	opponent: string | null;
	/** "Saints Stadium, Court 1"; "" when not set yet. */
	venue: string;
	/** The grade PlayHQ plays the game in ("12 Boys Grading 1 - Pool 2D"): in the league, which phase of the season it's
	 * in (features/games/season-phase.ts). The game's own, else its round's, else the team's; "" when PlayHQ gives none. */
	grade?: string;
}

export interface PlayhqTeamFixture {
	/** "Saints U12 Boys 1 · U12 Boys - VJL1 (P1) · 2025/26" */
	name: string;
	games: PlayhqGame[];
}

/** A game's result as PlayHQ has it: `status` "FINAL" once it's over and its score is in (anything else isn't final). */
export interface PlayhqResult {
	status: string | null;
	home: { teamId: string | null; score: number | null };
	away: { teamId: string | null; score: number | null };
}

export interface PlayhqPort {
	/** null when PlayHQ has no such team. */
	teamFixture(tenant: string, teamId: string): Promise<PlayhqTeamFixture | null>;
	/** null when PlayHQ has no such game. */
	gameResult(tenant: string, gameId: string): Promise<PlayhqResult | null>;
}

const RESULT_QUERY = `query gameResult($gameID: ID!) {
  discoverGame(gameID: $gameID) { status { value } result { home { score } away { score } }
    home { ... on DiscoverTeam { id } } away { ... on DiscoverTeam { id } } }
}`;
interface RawResult {
	discoverGame: { status: { value?: string } | null; result: { home: { score?: number | null } | null; away: { score?: number | null } | null } | null;
		home: { id?: string } | null; away: { id?: string } | null } | null;
}

type Side = { id?: string; name?: string } | null;
interface RawGame {
	id: string;
	date: string | null;
	grade: { name?: string } | null;
	allocation: { time: string | null; dateTimeList: Array<{ date: string; time: string }> | null; court: { name: string; venue: { name: string } | null } | null } | null;
	home: Side;
	away: Side;
}
interface RawFixture {
	discoverTeam: { id: string; name: string; season: { name: string } | null; grade: { name: string } | null } | null;
	discoverTeamFixture: Array<{ name: string; grade: { name?: string } | null; fixture: { games: RawGame[] } | null }> | null;
}

function toGame(teamId: string, round: string, grade: string, g: RawGame): PlayhqGame | null {
	const first = g.allocation?.dateTimeList?.[0];
	const date = g.date ?? first?.date;
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const time = (g.allocation?.time ?? first?.time)?.slice(0, 5) ?? null;
	const other = [g.home, g.away].find((side) => side && side.id !== teamId && side.name);
	const court = g.allocation?.court;
	const venue = [court?.venue?.name, court?.name].filter(Boolean).join(", ");
	return { id: g.id, round, date, time: time && /^\d{2}:\d{2}$/.test(time) ? time : null, opponent: other?.name ?? null, venue, grade: g.grade?.name ?? grade };
}

export function createPlayhqClient(config: { fetch?: typeof fetch } = {}): PlayhqPort {
	const doFetch = config.fetch ?? fetch;
	/** One question to the feed. Any error, even with some data, fails it: half a fixture would mark the rest "Not on PlayHQ". */
	async function ask<T>(what: string, tenant: string, operationName: string, query: string, variables: Record<string, string>): Promise<T> {
		const res = await doFetch(ENDPOINT, {
			method: "POST",
			// The feed only answers requests that say they're for playhq.com; tenant is the sport (example-association).
			headers: { "Content-Type": "application/json", tenant, Origin: "https://www.playhq.com", "User-Agent": `${CLUB.domain} fixture import` },
			body: JSON.stringify({ operationName, variables, query }),
			signal: AbortSignal.timeout(15_000),
		});
		const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: Array<{ message?: string }> };
		if (!res.ok || !body.data || body.errors?.length) throw new Error(`PlayHQ ${what} failed (${res.status}): ${body.errors?.[0]?.message ?? "no details"}`);
		return body.data;
	}
	return {
		async teamFixture(tenant, teamId) {
			const data = await ask<RawFixture>("fixture", tenant, "teamFixture", QUERY, { teamID: teamId });
			const team = data.discoverTeam;
			if (!team) return null;
			const games = new Map<string, PlayhqGame>(); // a game listed twice comes in once
			for (const r of data.discoverTeamFixture ?? []) {
				for (const g of r.fixture?.games ?? []) {
					const game = toGame(teamId, r.name, r.grade?.name ?? team.grade?.name ?? "", g);
					if (game && !games.has(game.id)) games.set(game.id, game);
				}
			}
			return { name: [team.name, team.grade?.name, team.season?.name].filter(Boolean).join(" · "), games: [...games.values()] };
		},
		async gameResult(tenant, gameId) {
			const game = (await ask<RawResult>("result", tenant, "gameResult", RESULT_QUERY, { gameID: gameId })).discoverGame;
			if (!game) return null;
			const score = (n: number | null | undefined) => (typeof n === "number" ? n : null);
			return {
				status: game.status?.value ?? null,
				home: { teamId: game.home?.id ?? null, score: score(game.result?.home?.score) },
				away: { teamId: game.away?.id ?? null, score: score(game.result?.away?.score) },
			};
		},
	};
}
