import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import { conflict, notFound } from "../../app/errors.ts";
import { isRealDate, parseLocal } from "../../shared/time.ts";
import {
	COMPETITIONS, countActiveVideosForGame, createGame, type Game, type GameInput, type GameWithVideo, getGame, listGamesWithVideoStatus,
	softDeleteGame, updateGame,
} from "./games-repository.ts";
import { closeUnusedLive } from "../live/live-service.ts";
import { footageDue } from "../teams/team-code.ts";
import type { Team } from "../teams/team.ts";
import { getActiveVideoForGame } from "../videos/videos-repository.ts";
import { SEASON_PHASES } from "./season-phase.ts";

export const gameFormSchema = z.object({
	date: z.string().refine(isRealDate, "Choose a date"),
	hour: z.coerce.number().int().min(1).max(12),
	minute: z.coerce.number().int().min(0).max(59),
	period: z.enum(["am", "pm"]),
	competition: z.enum(COMPETITIONS),
	roundLabel: z.string().trim().max(40).default(""),
	/** The league season's phase, or "" for none (kept only for a league game). */
	phase: z.enum(["", ...SEASON_PHASES]).default(""),
	opponent: z.string().trim().max(80).default(""),
	venue: z.string().trim().max(120).default(""),
	/** Live stream (the default on the form), Record and upload after, or No video. */
	video: z.enum(["live", "record", "none"]),
});
export type GameForm = z.infer<typeof gameFormSchema>;
export type GameVideo = GameForm["video"];

/** Tip-off is entered as 12-hour time; stored as local wall time 'YYYY-MM-DDTHH:MM'. */
export function toGameInput(form: GameForm): GameInput {
	const hour24 = (form.hour % 12) + (form.period === "pm" ? 12 : 0);
	const startsAt = `${form.date}T${String(hour24).padStart(2, "0")}:${String(form.minute).padStart(2, "0")}`;
	parseLocal(startsAt);
	return { startsAt, competition: form.competition, roundLabel: form.roundLabel, opponent: form.opponent || "TBC", venue: form.venue, phase: form.phase || null };
}

export async function requireGame(db: D1Database, teamId: string, id: number): Promise<Game> {
	const game = await getGame(db, teamId, id);
	if (!game) throw notFound("Game");
	return game;
}

/** Add game: No video is marked now (Live stream sits underneath, unused, until an Edit picks Live stream or Record). */
export async function addGame(deps: TeamDeps, input: GameInput, createdBy: number, video: GameVideo): Promise<number> {
	return createGame(deps.db, deps.team.id, input, createdBy, video === "none" ? deps.now().toISOString() : null, video !== "record");
}

/**
 * Any date (its video's deletion date is its team's, whatever the game's). It can only become No video while it has no
 * video (or one that failed); a stream only set up for it (Go live opened) is closed.
 */
export async function editGame(deps: TeamDeps, id: number, input: GameInput, video: GameVideo): Promise<void> {
	const { db } = deps;
	const game = await requireGame(db, deps.team.id, id);
	if (video === "none" && !game.noVideo) {
		const current = await getActiveVideoForGame(db, deps.team.id, id);
		if (current && current.status !== "failed") throw conflict("This game has a video, so it can't be No video. Delete the video first if it shouldn't be there.");
		await closeUnusedLive(deps, id, "set to No video");
	}
	await updateGame(db, deps.team.id, id, input, video === "none" ? null : video === "live", video === "none" ? deps.now().toISOString() : null, deps.now().toISOString());
}

export async function deleteGame(db: D1Database, teamId: string, id: number, now: Date): Promise<void> {
	await requireGame(db, teamId, id);
	if ((await countActiveVideosForGame(db, teamId, id)) > 0) {
		throw conflict("This game has video. Delete or move the video first.");
	}
	await softDeleteGame(db, teamId, id, now.toISOString());
}

/** No video yet (or only one that failed): free for an upload or Go live. */
export const isFree = (r: GameWithVideo) => r.videoStatus === null || r.videoStatus === "failed";

/** Games a filmer can upload for, newest first, with video status. Games marked "No video" are left out.
 * Anything dated in its team's season's two years (seasons start in October): for 2026/27, 2026 and 2027, which also
 * covers the practice games from before the season. None once the team's videos have been deleted. */
export async function pickerGames(db: D1Database, team: Team, now: Date): Promise<GameWithVideo[]> {
	if (footageDue(team) <= now.toISOString()) return [];
	const from = `${team.seasonStart}-01-01T00:00`, to = `${team.seasonStart + 2}-01-01T00:00`;
	return (await listGamesWithVideoStatus(db, team.id)).filter((r) => !r.game.noVideo && r.game.startsAt >= from && r.game.startsAt < to);
}
