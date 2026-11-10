import { bindings, defineConfig, triggers } from "cf/config";
// Namespace import is required by the cf config API (cf-worker import attribute).
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };
import { CLUB } from "./src/club.ts";
import { DEPLOY } from "./deploy.config.ts";

// The site's Worker. Who it's for is src/club.ts; where it runs is deploy.config.ts (the account, zone, databases and
// buckets the install made, INSTALL.md). `cf dev` evaluates this with mode "development"; `cf deploy` builds with mode
// "production"; `cf previews deploy` (staging, docs/runbooks/staging.md) builds with isPreview: this same Worker as a
// Worker Preview on its own database and bucket, with test data only. Previews run no cron triggers and take no domain.
export default defineConfig(({ mode, isPreview }) => {
	const isDev = mode === "development";
	const bucket = isPreview ? DEPLOY.staging.bucket : DEPLOY.bucket;
	return {
		accountId: DEPLOY.accountId,
		worker: {
			name: DEPLOY.worker,
			compatibilityDate: "2026-09-25",
			entrypoint,
			// The club's domain, behind the site's own sign-in (auth/session.ts).
			domains: isPreview ? [] : [CLUB.domain],
			// workers.dev stays off; its Preview URLs (staging) are on, behind the same sign-in.
			workersDev: false,
			previewUrls: true,
			// Run beside the database: pages make several queries one after another, and a Worker far from D1 pays for
			// each. Pick the region nearest the club (D1's primary is placed where the database was made).
			placement: { region: DEPLOY.region },
			// Static files come from ./public (Vite's public dir). The Worker runs first, for every request: it checks the
			// sign-in, then serves the file through the binding (app/static-files.ts): a sign-in for everything, files included.
			assets: { runWorkerFirst: true, notFoundHandling: "none" },
			// Every 5 minutes: video sync. Daily at 3am in the club's time zone: backup and orphan sweep. Cron is UTC only, so
			// one trigger fires for each UTC hour that is 3am there across the year (club.ts dailyJobUtcHours) and the job runs
			// on the one that's 3am (jobs/daily.ts).
			triggers: isPreview ? [] : [triggers.scheduled({ schedule: "*/5 * * * *" }), ...CLUB.dailyJobUtcHours.map((h) => triggers.scheduled({ schedule: `0 ${h} * * *` }))],
			// Issues: Cloudflare groups the Worker's failures and emails the account when a new one starts, the
			// one alert that still works when the Worker itself is failing. Every deploy must keep it on, or it goes off.
			observability: { enabled: true, redactQueryString: true, issues: { enabled: true } },
			env: {
				DB: isPreview ? bindings.d1({ id: DEPLOY.staging.d1Id, name: DEPLOY.staging.d1Name }) : bindings.d1({ id: DEPLOY.d1Id, name: DEPLOY.d1Name }),
				// The static files, which the Worker serves itself once the sign-in is checked (app/static-files.ts).
				ASSETS: bindings.assets(),
				ORIGINALS: bindings.r2({ name: bucket }),
				// Workers AI: Ask Virtual Team Manager (Help), the Documentation AI assistant and reading fixture pages
				// (platform/workers-ai.ts). Needs no setup: it comes with the deploy.
				AI: bindings.ai(),
				// The team's photos, in Cloudflare Images (the account's Images and Stream bundle). No token: the binding is
				// the Worker's own way in, and it signs the photos' links. `cf dev` keeps its photos on this computer.
				IMAGES: bindings.images(),
				// Emails: to the site's admins (tickets and alerts), and to a team manager about their own team (a welcome, a
				// ticket's replies), from this one sender only: alerts@ the club's domain (src/club.ts). Who it writes to comes
				// from the admins table or the team's list (src/features/admin/admin-mail.ts), never from here. Local in
				// development, so cf dev only logs what it would send.
				ADMIN_MAIL: bindings.sendEmail({ allowedSenderAddresses: [`alerts@${CLUB.domain}`] }),
				ACCOUNT_ID: bindings.text(DEPLOY.accountId),
				STREAM_CUSTOMER_CODE: bindings.text(isDev ? "dev" : DEPLOY.streamCustomerCode),
				R2_BUCKET: bindings.text(bucket),
				WORKER_NAME: bindings.text(DEPLOY.worker),
				// The staging strip, "[Staging]" emails and its Run the 5-minute job now (src/app/config.ts `staging`).
				STAGING: isPreview && bindings.text("1"),
				// Local dev sign-in. Empty in production, and the Worker also ignores it unless the host is localhost.
				DEV_AUTH_EMAIL: bindings.text(isDev ? DEPLOY.devEmail : ""),
				STREAM_KEY_ID: bindings.secret(),
				STREAM_KEY_JWK: bindings.secret(),
				R2_ACCESS_KEY_ID: bindings.secret(),
				R2_SECRET_ACCESS_KEY: bindings.secret(),
				// Stream Edit only, on the account: uploads, playback state, downloads, clips and live inputs.
				STREAM_API_TOKEN: bindings.secret(),
				// Cloudflare's own figures on the admin area's Platform and Costs: a read-only account token (Account Analytics,
				// Security Center Insights, the zone's Analytics, and Billing Read for Costs' bill).
				CF_INSIGHTS_TOKEN: bindings.secret(),
				// The sign-in page's Turnstile widget: one for the site and one for staging's address, each with its own
				// secret; Cloudflare's always-passes test key on this computer.
				TURNSTILE_SITE_KEY: bindings.text(isDev ? "1x00000000000000000000AA" : isPreview ? DEPLOY.staging.turnstileSiteKey : DEPLOY.turnstileSiteKey),
				TURNSTILE_SECRET: bindings.secret(),
				// The video joiner (join/): a recording carried on after its page closed is joined into one file there. Not in
				// cf dev (no second Worker locally): the join step waits and says so.
				JOINER: isDev ? undefined : bindings.durableObject({ worker: `${DEPLOY.worker}-join`, exportName: "Joiner" }),
				ZONE_ID: bindings.text(DEPLOY.zoneId),
				D1_ID: bindings.text(isPreview ? DEPLOY.staging.d1Id : DEPLOY.d1Id),
			},
		},
	};
});
