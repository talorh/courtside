import type { AppDeps } from "../app/deps.ts";
import { addDays, localDate, localTime, mondayOf } from "../shared/time.ts";
import { WEEKS } from "../features/admin/insights-service.ts";
import { backupDatabase } from "./backup-db.ts";
import { closeSeasonsOver } from "./close-seasons.ts";
import { checkBudgets } from "../features/admin/budget-checks.ts";
import { checkAiModels } from "../features/admin/ai-model-checks.ts";
import { checkJoiner } from "../features/admin/joiner-checks.ts";
import { loadBill } from "../features/admin/costs-bill.ts";
import { inLocal, loadCosts } from "../features/admin/costs-load.ts";
import { saveSpentMonths } from "../features/admin/costs-saved.ts";
import { checkDatabase, checkImages, checkJobRan, recordDailyRun } from "../features/admin/usage-checks.ts";
import { databaseBytes } from "../features/admin/platform-repository.ts";
import { forgetServerErrors } from "../features/admin/server-errors-repository.ts";
import { logJobProblems } from "./job-problems.ts";
import { failureIds, tagFailure } from "../shared/failure-ids.ts";
import { recordSweep, sweepOrphans } from "./sweep-orphans.ts";
import { CLUB } from "../club.ts";
import { purgeSessions } from "../auth/session-repository.ts";
import { purgeSignInRecords } from "../auth/sign-in-codes-repository.ts";
import { purgeViewWeeks } from "../auth/device-view-repository.ts";
import { purgeProblems } from "../features/admin/problems-repository.ts";

/**
 * The daily job runs at 3am in the club's time zone all year. Cron triggers are UTC only, so one fires for each UTC
 * hour that is 3am there across the year (club.ts dailyJobUtcHours; two where the zone has daylight saving), and only
 * the one landing on 3am runs it. cloudflare.config.ts makes its triggers from the same hours.
 */
export const DAILY_CRONS = new Set(CLUB.dailyJobUtcHours.map((h) => `0 ${h} * * *`));

/** Whether a daily trigger's scheduled time (ms) is 3am in the club's time zone. */
export const dailyDue = (scheduledTime: number) => localTime(new Date(scheduledTime)).slice(11, 13) === "03";

/**
 * Daily cron: the database backup, then the orphan sweep, whose outcome is kept for the admin area's Platform page (recordSweep), then
 * the sign-in's leftovers, then the teams whose season is over. Each runs even if another fails; any failure fails the run. The backup goes first: a run cut short still has it.
 */
export async function runDaily(deps: AppDeps): Promise<void> {
	const errors: unknown[] = [], started = Date.now();
	await backupDatabase(deps).catch((err: unknown) => void errors.push(tagFailure(err, { step: "backup" })));
	const sweep = await sweepOrphans(deps).catch((err: unknown) => ({ failed: err }));
	errors.push(...("failed" in sweep ? [sweep.failed] : sweep.errors).map((err) => tagFailure(err, { step: "orphan_sweep" })));
	await recordSweep(deps, sweep).catch((err: unknown) => void errors.push(tagFailure(err, { step: "record_sweep" })));
	// The sign-in's leftovers (auth/): sessions that are over, codes older than a day, events older than a month, and holds.
	await purgeSignIn(deps).catch((err: unknown) => void errors.push(tagFailure(err, { step: "sign_in_purge" })));
	// Running teams whose season's videos and photos are due close, to be deleted from tonight (close-seasons.ts).
	await closeSeasonsOver(deps).catch((err: unknown) => void errors.push(tagFailure(err, { step: "close_seasons" })));
	// The admins' alerts (features/admin/usage-checks.ts): Images' photos (from the clean-up's own list), the database's
	// size, and how the night went; and the server errors' count keeps two days.
	if (!("failed" in sweep) && sweep.imagesStored !== null) await checkImages(deps, sweep.imagesStored).catch((err: unknown) => void errors.push(tagFailure(err, { step: "images_check" })));
	await databaseBytes(deps.db).then((bytes) => checkDatabase(deps, bytes)).catch((err: unknown) => void errors.push(tagFailure(err, { step: "database_check" })));
	// The Workers AI models' planned retirements (ai-model-checks.ts).
	await checkAiModels(deps).catch((err: unknown) => void errors.push(tagFailure(err, { step: "ai_models_check" })));
	// The video joiner's nightly try (joiner-checks.ts).
	await checkJoiner(deps).catch((err: unknown) => void errors.push(tagFailure(err, { step: "joiner_check" })));
	await forgetServerErrors(deps.db, addDays(deps.now(), -2)).catch((err: unknown) => void errors.push(tagFailure(err, { step: "server_errors_purge" })));
	// Cloudflare's bill, read every night (Costs puts its own figures right by it); then the budgets, by the bill.
	await loadBill(deps, { force: true }).then((b) => { if (b.read === "failed") throw new Error("Cloudflare's bill couldn't be read (Costs shows the copy saved)"); })
		.catch((err: unknown) => void errors.push(tagFailure(err, { step: "bill" })));
	await loadCosts(deps).then((c) => checkBudgets(deps, inLocal(c))).catch((err: unknown) => void errors.push(tagFailure(err, { step: "budgets_check" })));
	// Costs' months over a week ago, saved as they stand (costs-saved.ts).
	await loadCosts(deps).then((c) => saveSpentMonths(deps, c)).catch((err: unknown) => void errors.push(tagFailure(err, { step: "save_costs" })));
	console.log(JSON.stringify({ event: "daily_run", teamId: null, ms: Date.now() - started, errorCount: errors.length, failedSteps: errors.map((e) => failureIds(e).step) }));
	await logJobProblems(deps, "daily", [], errors);
	await recordDailyRun(deps, errors);
	// And the 5-minute job's heartbeat: it can't say it has stopped running (usage-checks.ts).
	await checkJobRan(deps, "sync_job").catch((err: unknown) => void errors.push(err));
	if (errors.length > 0) throw new AggregateError(errors, `daily: ${errors.length} problem(s)`);
}

async function purgeSignIn(deps: AppDeps): Promise<void> {
	const now = deps.now();
	const purged = await purgeSessions(deps.db, now.toISOString());
	// Codes a day; the sign-in's events a month (31 days, so a whole calendar month is always there), for the admin Log.
	await purgeSignInRecords(deps.db, addDays(now, -1).toISOString(), addDays(now, -31).toISOString());
	// Problems too: a month (the admin Log).
	await purgeProblems(deps.db, addDays(now, -31).toISOString());
	// The devices-a-week tally (Insights' Mobile and desktop) keeps the 12 weeks the page shows.
	await purgeViewWeeks(deps.db, mondayOf(localDate(addDays(now, -7 * WEEKS))));
	console.log(JSON.stringify({ event: "sign_in_purged", teamId: null, sessions: purged }));
}
