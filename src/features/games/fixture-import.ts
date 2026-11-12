import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import { badRequest } from "../../app/errors.ts";
import { compareIso } from "../../shared/time.ts";
import { COMPETITIONS, createGameWrite, type GameInput, listGamesWithVideoStatus } from "./games-repository.ts";
import { SEASON_PHASES } from "./season-phase.ts";

// Bringing in several games at once, from a spreadsheet or from any fixture page (read by AI). Either way the games
// are shown to check first (import page), then added; the list travels in the form, so nothing is stored in between.

export const MAX_IMPORT = 100;

export interface ImportedGame extends GameInput {
	noVideo: boolean;
	/** Live stream (the default) or recorded and uploaded after. */
	liveStream: boolean;
}

export const importedGameSchema = z.object({
	startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
	competition: z.enum(COMPETITIONS),
	roundLabel: z.string().max(40),
	phase: z.enum(SEASON_PHASES).nullable().optional(),
	opponent: z.string().min(1).max(80),
	venue: z.string().max(120),
	noVideo: z.boolean(),
	liveStream: z.boolean(),
});

export const addImportSchema = z.object({
	games: z.string().max(100_000),
	pick: z.array(z.coerce.number().int().min(0)).max(MAX_IMPORT),
});

/** A game read from a sheet or page, ready to check: anything that isn't usable goes in `problems` instead. */
export interface ImportPreview {
	source: string;
	games: ImportedGame[];
	/** Games already in the fixture (same day and time, or same day and opponent), left out. */
	already: ImportedGame[];
	problems: string[];
}

/** A game counts as already there at the same day and time, or the same day against the same (known) opponent. */
const keys = (g: { startsAt: string; opponent: string }) => {
	const who = g.opponent.trim().toLowerCase();
	return who && who !== "tbc" ? [g.startsAt, `${g.startsAt.slice(0, 10)}|${who}`] : [g.startsAt];
};

/** Splits off games already in the fixture and sorts the rest by date. */
export async function preview(deps: TeamDeps, source: string, games: ImportedGame[], problems: string[]): Promise<ImportPreview> {
	const taken = new Set((await listGamesWithVideoStatus(deps.db, deps.team.id)).flatMap((r) => keys(r.game)));
	const fresh: ImportedGame[] = [], already: ImportedGame[] = [];
	for (const g of [...games].sort((a, b) => compareIso(a.startsAt, b.startsAt))) {
		if (keys(g).some((k) => taken.has(k))) already.push(g);
		else fresh.push(g);
		keys(g).forEach((k) => taken.add(k));
	}
	if (fresh.length > MAX_IMPORT) {
		problems.push(`Only the first ${MAX_IMPORT} games can be added at once.`);
		fresh.length = MAX_IMPORT;
	}
	return { source, games: fresh, already, problems };
}

/** Adds the ticked games (one batch), skipping any that turned up in the fixture meanwhile. Returns how many. */
export async function addImported(deps: TeamDeps, memberId: number, form: z.infer<typeof addImportSchema>): Promise<number> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(form.games);
	} catch (err) {
		throw badRequest("The list of games didn't come through. Start the import again.", err);
	}
	const list = z.array(importedGameSchema).max(MAX_IMPORT).safeParse(parsed);
	if (!list.success) throw badRequest("The list of games didn't come through. Start the import again.");
	const { db } = deps;
	const taken = new Set((await listGamesWithVideoStatus(db, deps.team.id)).flatMap((r) => keys(r.game)));
	const picked = [...new Set(form.pick)].map((i) => list.data[i]).filter((g): g is ImportedGame => !!g && !keys(g).some((k) => taken.has(k)));
	if (!picked.length) return 0;
	const now = deps.now().toISOString();
	await db.batch(picked.map((g) => createGameWrite(db, deps.team.id, g, memberId, g.noVideo ? now : null, g.liveStream)));
	return picked.length;
}
