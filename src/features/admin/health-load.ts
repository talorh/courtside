// The site's health for Insights' Alerts section: the alerts as they stand (the team budgets checked just now) and
// the checks made as the page opens (health-checks.ts). Stream and Cloudflare each get a few seconds; the page opens
// without them.
import { logProblem } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import { countLiveSessions } from "../../auth/session-repository.ts";
import { signInFigures } from "../../auth/sign-in-codes-repository.ts";
import { BACKUP_PREFIX } from "../../jobs/backup-db.ts";
import { SWEEP_RECORD } from "../../jobs/sweep-orphans.ts";
import { addDays } from "../../shared/time.ts";
import { listAlerts } from "./alerts-repository.ts";
import { checkBudgets } from "./budget-checks.ts";
import { inLocal, loadCosts } from "./costs-load.ts";
import { type Check, healthChecks, STUCK_HOURS } from "./health-checks.ts";
import { type HealthCounts, healthCounts } from "./health-repository.ts";
import { cloudflareFigures, streamStorage } from "./platform-routes.ts";

export interface Health { checks: Check[]; counts: HealthCounts; sessions: number }

export async function loadHealth(deps: AppDeps, now: Date): Promise<Health> {
	const day = addDays(now, -1);
	// The budgets are checked alongside the rest, and the alerts read once they are.
	const budgets = loadCosts(deps).then((c) => checkBudgets(deps, inLocal(c))).catch(async (err: unknown) => {
		console.error(JSON.stringify({ event: "budget_check_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "site_problem", teamId: null, what: "The team budgets couldn't be checked", error: err });
	});
	const [alerts, counts, backups, sweeps, storage, figures, signIns, sessions] = await Promise.all([
		budgets.then(() => listAlerts(deps.db)), healthCounts(deps.db, { stuckBefore: new Date(now.getTime() - STUCK_HOURS * 3_600_000).toISOString(), failedSince: addDays(now, -7).toISOString() }),
		deps.originals.list(BACKUP_PREFIX), deps.originals.list(SWEEP_RECORD), streamStorage(deps), cloudflareFigures(deps, day, now),
		signInFigures(deps.db, day.toISOString()), countLiveSessions(deps.db, now.toISOString()),
	]);
	const checks = healthChecks({
		alerts, counts, now, staging: deps.config.staging, lastBackup: backups.at(-1) ?? null, lastSweep: sweeps.find((o) => o.key === SWEEP_RECORD) ?? null,
		storage, day: figures, cloudflare: deps.cloudflare !== null, signIns,
	});
	return { checks, counts, sessions };
}
