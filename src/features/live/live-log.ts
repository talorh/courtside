// Go live in the admin Log, a team's line each with who did it: going live, the game ending (End game, or the camera
// stopping), a stream thrown away as a test, and its recording saved. Written after the change it records; a line that
// can't be written is logged and never undoes it, nor stops Go live.
import type { TeamDeps } from "../../app/deps.ts";
import { logTeamChange } from "../admin/team-log.ts";
import { gameName } from "../games/game-log.ts";
import { getGame } from "../games/games-repository.ts";
import { getActiveMember } from "../members/members-repository.ts";

export type LiveLogAction = "live_started" | "live_ended" | "live_test" | "live_saved" | "live_continued" | "video_joined" | "join_failed" | "first_part_kept";
/** How a stream ended, as the Go live page says: End game tapped, or the phone switched the camera off. */
export type StopCause = "tapped" | "camera";

export const CAUSE_WORDS: Record<StopCause, string> = {
	tapped: "End game tapped",
	camera: "the camera stopped (the phone locked, or another app took it)",
};

/** A stream thrown away as a test, in words: "45 seconds recorded, then the camera stopped". */
export const testWords = (seconds: number, recorded: boolean, cause?: StopCause) =>
	`${Math.round(seconds)} seconds ${recorded ? "recorded" : "after Go live"}${cause === "camera" ? ", then the camera stopped" : cause === "tapped" ? ", then End game was tapped" : ""}`;

/** `who`: an email, a member's id (looked up), or null for the site's own (the 5-minute job). `how` follows the game. */
export async function logLive(deps: TeamDeps, who: string | number | null, action: LiveLogAction, gameId: number, how = ""): Promise<void> {
	try {
		const game = await getGame(deps.db, deps.team.id, gameId);
		const actor = typeof who === "number" ? (await getActiveMember(deps.db, deps.team.id, who))?.email ?? "site" : who ?? "site";
		await logTeamChange(deps, actor, action, [game ? gameName(game) : `game ${gameId}`, how].filter(Boolean).join(": "));
	} catch (err) {
		console.error(JSON.stringify({ event: "live_log_failed", teamId: deps.team.id, gameId, action, error: String(err) }));
	}
}
