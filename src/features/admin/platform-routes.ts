import { CLUB, siteOrigin } from "../../club.ts";
// The admin area's Platform and Changelog pages.
import { logProblem } from "./problem-log.ts";
import { checkAiModelsSoon } from "./ai-model-checks.ts";
import changelog from "../../../CHANGELOG.md?raw";
import type { AdminRouter } from "../../app/admin-router.ts";
import { notFound } from "../../app/errors.ts";
import type { AppDeps } from "../../app/deps.ts";
import { htmlResponse, redirect } from "../../app/respond.ts";
import type { CloudflareFigures } from "../../platform/cloudflare-insights.ts";
import { addDays } from "../../shared/time.ts";
import { runSync } from "../../jobs/sync-videos.ts";
import { mailAdmins } from "./admin-mail.ts";
import { BACKUP_PREFIX } from "../../jobs/backup-db.ts";
import { SWEEP_RECORD } from "../../jobs/sweep-orphans.ts";
import { CHANGE_KINDS, type ChangeKind, parseChangelog } from "../changelog/changelog.ts";
import { changelogPage } from "../changelog/views/changelog-page.ts";
import { countPeopleOnTeams } from "../teams/teams-repository.ts";
import { countLiveSessions } from "../../auth/session-repository.ts";
import { signInFigures } from "../../auth/sign-in-codes-repository.ts";
import { emailsSentIn, monthKey } from "./email-count-repository.ts";
import { adminLogStatement, lastTestEmail } from "./admin-log-repository.ts";
import { listAlerts } from "./alerts-repository.ts";
import { countPhotosStored, databaseBytes } from "./platform-repository.ts";
import { PLATFORM_MESSAGES, platformPage } from "./views/platform-page.ts";
import { doneMessage } from "../../shared/validation.ts";

/** How long Platform waits for Stream's storage figure, and Cloudflare's, before showing the page without them. */
const STREAM_WAIT_MS = 3_000;
const CLOUDFLARE_WAIT_MS = 4_000;

/** Stream's minutes, or null when it doesn't answer in time (the page says so, and the Log; the alerts keep their own
 * figure). */
export async function streamStorage(deps: AppDeps) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Stream took more than ${STREAM_WAIT_MS} ms`)), STREAM_WAIT_MS); });
	try {
		return await Promise.race([deps.live.storage(), late]);
	} catch (err) {
		console.error(JSON.stringify({ event: "storage_check_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "site_problem", teamId: null, what: "Stream's storage figure didn't come in time", error: err });
		return null;
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

/** Cloudflare's figures from `since` to now, or null without the token, or when it doesn't answer in time (logged; the
 * page says so). */
export async function cloudflareFigures(deps: AppDeps, since: Date, now: Date): Promise<CloudflareFigures | null> {
	if (!deps.cloudflare) return null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Cloudflare took more than ${CLOUDFLARE_WAIT_MS} ms`)), CLOUDFLARE_WAIT_MS); });
	try {
		return await Promise.race([deps.cloudflare.figures(since, now), late]);
	} catch (err) {
		console.error(JSON.stringify({ event: "insights_cloudflare_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "site_problem", teamId: null, what: "Cloudflare's own figures couldn't be read", error: err });
		return null;
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

export function platformRoutes(router: AdminRouter): void {
	router.get("/admin/platform", async ({ deps, frame, url }) => {
		const now = deps.now();
		await checkAiModelsSoon(deps); // first, so its row shows how the models stand now
		const [backups, sweeps, storage, photos, people, alerts, testEmail, dbBytes, figures, signIns, sessions, emailsThisMonth] = await Promise.all([
			deps.originals.list(BACKUP_PREFIX), deps.originals.list(SWEEP_RECORD), streamStorage(deps), countPhotosStored(deps.db),
			countPeopleOnTeams(deps.db), listAlerts(deps.db), lastTestEmail(deps.db), databaseBytes(deps.db), cloudflareFigures(deps, addDays(now, -30), now),
			signInFigures(deps.db, addDays(now, -1).toISOString()), countLiveSessions(deps.db, now.toISOString()), emailsSentIn(deps.db, monthKey(now)),
		]);
		return htmlResponse(platformPage({
			frame, lastBackup: backups.at(-1) ?? null, lastSweep: sweeps.find((o) => o.key === SWEEP_RECORD) ?? null,
			storage, photos, people, alerts, testEmail, now, staging: deps.config.staging, signIns: { ...signIns, sessions }, emailsThisMonth,
			dbBytes: dbBytes ?? figures?.d1.sizeBytes ?? null, cloudflare: { configured: deps.cloudflare !== null, figures },
			message: doneMessage(PLATFORM_MESSAGES, url),
		}));
	});
	// Staging has no scheduled jobs (Worker Previews don't run them), so an admin runs the 5-minute one there by hand. Never
	// the 3am one: its clean-up would take the live site's things for leftovers (jobs/sweep-orphans.ts refuses anyway).
	router.post("/admin/run-sync", async ({ deps }) => {
		if (!deps.config.staging) throw notFound("Page");
		const done = await runSync(deps).then(() => "ran", (err: unknown) => {
			console.error(JSON.stringify({ event: "staging_sync_failed", teamId: null, error: String(err) }));
			return "ranfailed";
		});
		return redirect(`/admin/platform?done=${done}`);
	});
	// Whether emails reach the admins (alerts, support requests): logged, and Platform says how it went.
	router.post("/admin/test-email", async ({ deps, viewer }) => {
		let detail: string;
		try {
			const { sent } = await mailAdmins(deps, {
				subject: `${CLUB.siteName}: test email`,
				text: `A test email from the admin area's Platform page, sent by ${viewer.email}. If it reached you, the site's alerts and support requests will too.\n\nPlatform: ${siteOrigin()}/admin/platform`,
			});
			detail = `sent to ${sent} admin${sent === 1 ? "" : "s"}`;
		} catch (err) {
			detail = `didn't go: ${err instanceof Error ? err.message : String(err)}`;
		}
		await adminLogStatement(deps.db, { device: deps.device, adminEmail: viewer.email, teamId: null, action: "test_email", detail, at: deps.now().toISOString() }).run();
		return redirect("/admin/platform");
	});
	router.get("/admin/changelog", async ({ frame, url }) => {
		const asked = url.searchParams.get("type") ?? "";
		const only = (CHANGE_KINDS as readonly string[]).includes(asked) ? asked as ChangeKind : null;
		return htmlResponse(changelogPage({ frame, days: parseChangelog(changelog), only }));
	});
	// Its old address, from the team managers' links: an admin's bookmark still works.
	router.get("/changelog", async () => redirect("/admin/changelog", 302));
}
