// Stream's storage alert: set by the 5-minute job, at most hourly, and from Stream's own figure whenever Insights or
// Platform opens, so an admin who has just bought minutes sees it clear without waiting for the job.
import type { AppDeps } from "../../app/deps.ts";
import { FetchBudgetSpent } from "../../platform/fetch-budget.ts";
import { countRunningTeams } from "../teams/teams-repository.ts";
import { getAlert } from "./alerts-repository.ts";
import { MINUTES_A_GAME } from "./game-day-checks.ts";
import { logProblem } from "./problem-log.ts";
import { alert, banded, thousands } from "./usage-checks.ts";

const HOUR_MS = 3_600_000;
// A game night's room (the urgent level) and about three weeks of an hour's game: the warning's notice to buy more.
const WARN_MINUTES_A_TEAM = 300;

/** The alert from Stream's figure. Scaled by the running teams (one at least), as each films about a game a week: under
 * 300 minutes a team left warns (two to three weeks before urgent; buying more is the admin's), under 150 a team is
 * urgent (one game night won't fit, the game check's own figure), and 50 above the warning clears. */
export async function storageAlert(deps: AppDeps, usage: { usedMinutes: number; limitMinutes: number }): Promise<void> {
	const left = Math.max(0, Math.floor(usage.limitMinutes - usage.usedMinutes));
	const [prev, running] = await Promise.all([getAlert(deps.db, "stream_storage"), countRunningTeams(deps.db)]);
	const teams = Math.max(1, running);
	const [warn, urgent] = [teams * WARN_MINUTES_A_TEAM, teams * MINUTES_A_GAME];
	// As minutes used, so higher is worse.
	const level = banded(-left, prev?.level ?? "ok", { urgent: -(urgent - 1), warn: -(warn - 1), clear: -(warn + 49) });
	const detail = `${left === 0 ? "No minutes left" : `${thousands(left)} minutes left`} for ${teams} ${teams === 1 ? "team" : "teams"}`;
	await alert(deps, "stream_storage", level, detail);
}

/** A page's reading of Stream's storage (null: it didn't answer), with the alert set from it. */
export async function withStorageAlert<T extends { usedMinutes: number; limitMinutes: number } | null>(deps: AppDeps, reading: Promise<T>): Promise<T> {
	const usage = await reading;
	if (usage) await storageAlert(deps, usage);
	return usage;
}

/** The 5-minute job's check, at most hourly. Stream not answering leaves the alert as it was; a run with no outside
 * calls left leaves it to the next. */
export async function checkStreamStorage(deps: AppDeps): Promise<void> {
	const prev = await getAlert(deps.db, "stream_storage");
	if (prev && deps.now().getTime() - Date.parse(prev.checkedAt) < HOUR_MS) return;
	try {
		await storageAlert(deps, await deps.live.storage());
	} catch (err) {
		if (err instanceof FetchBudgetSpent) return;
		console.error(JSON.stringify({ event: "storage_check_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "site_problem", teamId: null, what: "Stream's storage couldn't be checked for its alert", error: err });
	}
}
