// What sets each alert: Stream's minutes from the 5-minute job, at most hourly;
// Images' photos and the database's size from the 3am job; server errors and emails waiting from every
// 5-minute run (basic monitoring); and each job's own failures. A level only drops once its figure
// is past the clearing point, so one sitting on a threshold doesn't flap. A check never fails its job: an alert's ticket
// is saved, and its email is sent later if it doesn't go now.
import { alertFailed, logProblem } from "./problem-log.ts";
import type { AppDeps } from "../../app/deps.ts";
import { formatGameDate, localTime } from "../../shared/time.ts";
import { type AlertKind, type AlertLevel, getAlert } from "./alerts-repository.ts";
import { setAlert } from "./alerts-service.ts";
import { serverErrorsLately } from "./server-errors-repository.ts";
import { countUnsentBefore } from "./support-desk-repository.ts";
import { EMAILS_A_MONTH, emailsSentIn, monthKey } from "./email-count-repository.ts";

const HOUR_MS = 3_600_000;
// The 5-minute job failing this many runs in a row (half an hour) is urgent.
const SYNC_FAILURES = 6;

/** Higher is worse: urgent from `urgent`, warn from `warn`, ok below `clear`; in between, a warning stays one. */
function banded(value: number, was: AlertLevel, t: { warn: number; urgent: number; clear: number }): AlertLevel {
	if (value >= t.urgent) return "urgent";
	if (value >= t.warn) return "warn";
	return value < t.clear || was === "ok" ? "ok" : "warn";
}

const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

async function alert(deps: AppDeps, kind: AlertKind, level: AlertLevel, detail: string, failures = 0): Promise<void> {
	await setAlert(deps, kind, level, detail, failures).catch((err: unknown) => alertFailed(deps, kind, err));
}

/** Under 400 minutes left warns (about 3 weeks' notice with a few teams filming: buying more is the admin's), under 100 is
 * urgent, 450 or more clears. Stream not answering leaves it as it was. */
export async function checkStreamStorage(deps: AppDeps): Promise<void> {
	const prev = await getAlert(deps.db, "stream_storage");
	if (prev && deps.now().getTime() - Date.parse(prev.checkedAt) < HOUR_MS) return;
	let left: number;
	try {
		const { usedMinutes, limitMinutes } = await deps.live.storage();
		left = Math.max(0, Math.floor(limitMinutes - usedMinutes));
	} catch (err) {
		console.error(JSON.stringify({ event: "storage_check_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "site_problem", teamId: null, what: "Stream's storage couldn't be checked for its alert", error: err });
		return;
	}
	// As minutes used: urgent under 100 left, warn under 400, clear at 450 or more.
	const level = banded(-left, prev?.level ?? "ok", { urgent: -99, warn: -399, clear: -449 });
	await alert(deps, "stream_storage", level, left === 0 ? "No minutes left" : `${thousands(left)} minutes left`);
}

/** Images' 100,000 (from the 3am clean-up's own list): 80,000 warns, 95,000 is urgent, under 78,000 clears. */
export async function checkImages(deps: AppDeps, photos: number): Promise<void> {
	const level = banded(photos, (await getAlert(deps.db, "images"))?.level ?? "ok", { warn: 80_000, urgent: 95_000, clear: 78_000 });
	await alert(deps, "images", level, `${thousands(photos)} photos stored`);
}

/** The 5-minute job: urgent after six failed runs in a row; a good run clears it. `failure`: the run's error, or null. */
export async function recordSyncRun(deps: AppDeps, failure: unknown): Promise<void> {
	const prev = await getAlert(deps.db, "sync_job");
	if (failure === null) {
		await alert(deps, "sync_job", "ok", "The last run was fine");
		return;
	}
	const failures = (prev?.failures ?? 0) + 1;
	const level = failures >= SYNC_FAILURES || prev?.level === "urgent" ? "urgent" : "ok";
	await alert(deps, "sync_job", level, `${failures} ${failures === 1 ? "run" : "runs"} in a row failed: ${String(failure).slice(0, 200)}`, failures);
}

/** How long each job can go unsaved before it's not running: the 3am job a day and two hours, the 5-minute job three runs. */
const LATE_MS = { daily_job: 26 * HOUR_MS, sync_job: 15 * 60_000 };

/**
 * The other job's heartbeat: a job that stops running altogether can't raise its own failure
 * alert, but each job's alert is saved every run, so one not saved for a while is a job that isn't running. The 5-minute
 * job watches the 3am job, and the 3am job the 5-minute job. Not on staging, whose jobs run only when asked. Once raised,
 * it's saved, so it's raised once; the job's next good run clears it.
 */
export async function checkJobRan(deps: AppDeps, kind: keyof typeof LATE_MS): Promise<void> {
	if (deps.config.staging) return;
	const prev = await getAlert(deps.db, kind);
	if (!prev || deps.now().getTime() - Date.parse(prev.checkedAt) <= LATE_MS[kind]) return;
	await alert(deps, kind, "urgent", `It hasn't run since ${formatGameDate(localTime(new Date(prev.checkedAt)))}`, prev.failures);
}

/** The 3am job: urgent the night its backup, clean-up or deletions fail; a good night clears it. */
export async function recordDailyRun(deps: AppDeps, errors: unknown[]): Promise<void> {
	if (errors.length === 0) {
		await alert(deps, "daily_job", "ok", "Last night's job was fine");
		return;
	}
	await alert(deps, "daily_job", "urgent", String(errors[0]).slice(0, 200));
}

const GB = 1024 ** 3;

/** D1's size (bytes, from the database's own answer; null when it doesn't say): 4 GB of the 10 it can hold warns (5 GB is
 * included), 9 GB is urgent, under 3.8 GB clears. */
export async function checkDatabase(deps: AppDeps, bytes: number | null): Promise<void> {
	if (bytes === null) return;
	const level = banded(bytes, (await getAlert(deps.db, "database"))?.level ?? "ok", { warn: 4 * GB, urgent: 9 * GB, clear: 3.8 * GB });
	const size = bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	await alert(deps, "database", level, `${size} of the 10 GB it can hold`);
}

/** The site failing: ten or more server errors this hour and last is urgent; under three clears it. */
export async function checkSiteErrors(deps: AppDeps): Promise<void> {
	const n = await serverErrorsLately(deps.db, deps.now());
	const level = banded(n, (await getAlert(deps.db, "site_errors"))?.level ?? "ok", { warn: 10, urgent: 10, clear: 3 });
	await alert(deps, "site_errors", level, `${thousands(n)} server ${n === 1 ? "error" : "errors"} in the last hour or two`);
}

/** The month's emails against the 3,000 Workers Paid includes: 2,400 warns, 2,850 is urgent, under 2,300
 * clears; a new month starts the count again. */
export async function checkEmailAllowance(deps: AppDeps): Promise<void> {
	const sent = await emailsSentIn(deps.db, monthKey(deps.now()));
	const level = banded(sent, (await getAlert(deps.db, "email_allowance"))?.level ?? "ok", { warn: 2400, urgent: 2850, clear: 2300 });
	await alert(deps, "email_allowance", level, `${thousands(sent)} of ${thousands(EMAILS_A_MONTH)} emails this month`);
}

/** Emails not going: any ticket's or alert's email waiting more than an hour is urgent; none waiting clears it (a
 * resolved ticket's first email isn't waiting: it's never sent). */
export async function checkEmails(deps: AppDeps): Promise<void> {
	const n = await countUnsentBefore(deps.db, new Date(deps.now().getTime() - HOUR_MS).toISOString());
	await alert(deps, "email", n ? "urgent" : "ok", n ? `${thousands(n)} ${n === 1 ? "email has" : "emails have"} waited more than an hour` : "No emails waiting to go");
}
