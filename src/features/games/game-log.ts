// A fixture's games and their videos in the admin Log (who added, changed or deleted a game, or deleted or moved its
// video) and, for the deletes, the team's Activity: the change is made first; a line that can't be written is logged
// and never undoes it.
import type { TeamDeps } from "../../app/deps.ts";
import { formatShortDate } from "../../shared/time.ts";
import { logActivity } from "../activity/activity-repository.ts";
import { logTeamChange } from "../admin/team-log.ts";
import type { TeamAction } from "../admin/admin-log-repository.ts";
import { gameTitle } from "./game-format.ts";
import type { Game } from "./games-repository.ts";

/** "Round 6 · vs Riverton Wolves, Fri 20 Nov": a game as the Log names it. */
export const gameName = (g: Pick<Game, "competition" | "roundLabel" | "opponent" | "startsAt">) => `${gameTitle(g)}, ${formatShortDate(g.startsAt)}`;

/** "1 game", "3 games": how many came in at once. */
export const countGames = (n: number) => `${n} ${n === 1 ? "game" : "games"}`;

type GameAction = Extract<TeamAction, "game_added" | "game_changed" | "game_deleted" | "video_deleted" | "video_moved">;

/** The Log's line, and a delete's line in Activity (by the member who made it, on that game). */
export async function logGameChange(deps: TeamDeps, who: { email: string; memberId: number }, action: GameAction, detail: string, gameId?: number): Promise<void> {
	await logTeamChange(deps, who.email, action, detail);
	if (action !== "video_deleted" && action !== "game_deleted") return;
	await logActivity(deps.db, deps.team.id, deps.now().toISOString(), { kind: action, gameId: gameId ?? null, memberId: who.memberId, detail: action === "game_deleted" ? detail : null }, deps.device)
		.catch((err: unknown) => console.error(JSON.stringify({ event: "activity_log_failed", teamId: deps.team.id, action, error: String(err) })));
}
