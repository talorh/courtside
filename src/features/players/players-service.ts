// The squad's rules: a name and jersey number; at most 10 players a team; a number is one current
// player's. A first name or a full name, as the team manager likes (the site is
// private).
import type { TeamDeps } from "../../app/deps.ts";
import { badRequest, conflict, notFound } from "../../app/errors.ts";
import { getPlayer, insertPlayer, listPlayers, markPlayerRemoved, type Player, updatePlayerRow } from "./players-repository.ts";

export const MAX_PLAYERS = 10;
const NUMBER = /^\d{1,2}$/;
// Letters in any language (and their accents), with spaces, hyphens and apostrophes between: "Zoë-Jane", "O'Neil".
const NAME = /^\p{L}[\p{L}\p{M}' ’-]*$/u;

/** What the form sent, checked: a number 0 to 99 and a name. */
function checked(p: { number: string; name: string }): { number: number; name: string } {
	if (!NUMBER.test(p.number.trim())) throw badRequest("Numbers are 0 to 99.");
	const name = p.name.trim().replace(/\s+/g, " ");
	if (name.length > 40 || !NAME.test(name)) throw badRequest("A player's name is letters only, up to 40.");
	return { number: Number(p.number.trim()), name };
}

/** Refuses a number another current player has (`self` may keep its own). */
async function assertNumberFree(deps: TeamDeps, number: number, self: number | null): Promise<void> {
	const holder = (await listPlayers(deps.db, deps.team.id)).find((p) => p.number === number && p.id !== self);
	if (holder) throw conflict(`#${number} is already ${holder.name}'s.`);
}

export async function addPlayer(deps: TeamDeps, input: { number: string; name: string }): Promise<number> {
	const player = checked(input);
	if ((await listPlayers(deps.db, deps.team.id)).length >= MAX_PLAYERS) throw conflict(`A squad can have up to ${MAX_PLAYERS} players. Remove one first.`);
	await assertNumberFree(deps, player.number, null);
	return insertPlayer(deps.db, deps.team.id, player);
}

/** Returns the player as they were before, and as they are now. */
export async function updatePlayer(deps: TeamDeps, id: number, input: { number: string; name: string }): Promise<{ before: Player; after: { number: number; name: string } }> {
	const player = checked(input);
	const before = await getPlayer(deps.db, deps.team.id, id);
	if (!before) throw notFound("Player");
	await assertNumberFree(deps, player.number, id);
	await updatePlayerRow(deps.db, deps.team.id, id, player);
	return { before, after: player };
}

/** Returns the player removed. */
export async function removePlayer(deps: TeamDeps, id: number): Promise<Player> {
	const player = await getPlayer(deps.db, deps.team.id, id);
	if (!player) throw notFound("Player");
	await markPlayerRemoved(deps.db, deps.team.id, id, deps.now().toISOString());
	return player;
}
