// Which games added by hand a PlayHQ fixture's games take over, so a game isn't on the Fixture twice.
import type { PlayhqGame } from "../../platform/playhq.ts";

/** A game added by hand (no PlayHQ id yet): its day and its 'HH:MM' tip-off. */
export interface HandGame { id: number; date: string; time: string }

/**
 * PlayHQ's games not yet linked, each paired with a hand-added game on its day: the one at the same time first (two
 * games on one day, a tournament, each take their own), then any still unpaired that day (a lone game whose time PlayHQ
 * moved, or one PlayHQ gives no time yet), oldest first. Each hand-added game is taken once.
 */
export function adoptByHand(games: PlayhqGame[], byHand: HandGame[]): Map<string, number> {
	const left = [...byHand];
	const taken = new Map<string, number>();
	const take = (g: PlayhqGame, match: (h: HandGame) => boolean) => {
		const i = left.findIndex(match);
		if (i >= 0) taken.set(g.id, left.splice(i, 1)[0]!.id);
	};
	for (const g of games) if (g.time) take(g, (h) => h.date === g.date && h.time === g.time);
	for (const g of games) if (!taken.has(g.id)) take(g, (h) => h.date === g.date);
	return taken;
}
