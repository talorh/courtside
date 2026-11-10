import type { TeamDeps } from "../../app/deps.ts";
import { type ActivityInput, logActivity } from "./activity-repository.ts";

/**
 * Records an event for the Notifications page. The feed is a convenience, so a failed write is logged and never
 * fails the upload, cron step or request that triggered it.
 */
export async function record(deps: TeamDeps, a: ActivityInput): Promise<void> {
	try {
		await logActivity(deps.db, deps.team.id, deps.now().toISOString(), a, deps.device);
	} catch (err) {
		console.error(JSON.stringify({ event: "activity_log_failed", teamId: deps.team.id, kind: a.kind, gameId: a.gameId, error: String(err) }));
	}
}
