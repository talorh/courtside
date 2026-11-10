// What a game's video is called where there's nothing else to go on: Stream's dashboard, and the admins' ticket when it
// can't be processed, so it's clear which game it is.
import type { TeamDeps } from "../../app/deps.ts";
import { formatGameDate } from "../../shared/time.ts";
import { gameTitle } from "../games/game-format.ts";
import { getGame } from "../games/games-repository.ts";
import { teamNames } from "../teams/team-code.ts";

/** "Saints B12.1 · Round 9 · vs Lakeside Rockets", and when it was played ("Sun 11 Oct 2026, 11:40am"; empty if the game's gone). */
export async function videoName(deps: TeamDeps, gameId: number): Promise<{ title: string; when: string }> {
	const team = teamNames(deps.team.code).short;
	const game = await getGame(deps.db, deps.team.id, gameId);
	return game ? { title: `${team} · ${gameTitle(game)}`, when: formatGameDate(game.startsAt) } : { title: `${team} · game ${gameId}`, when: "" };
}

/** Stream's name for it: the title and when. */
export const streamName = (n: { title: string; when: string }) => (n.when ? `${n.title} · ${n.when}` : n.title);
