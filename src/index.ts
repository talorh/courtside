import { loadConfig } from "./app/config.ts";
import { buildDeps } from "./app/deps.ts";
import { handleRequest } from "./app/handle-request.ts";
import { buildRouter } from "./app/routes.ts";
import { sessionAuthenticator } from "./auth/session.ts";
import { buildAdminRouter } from "./features/admin/admin-routes.ts";
import { DAILY_CRONS, dailyDue, runDaily } from "./jobs/daily.ts";
import { runSync } from "./jobs/sync-videos.ts";
import { createFetchBudget } from "./platform/fetch-budget.ts";
import { newImageUrlCache } from "./platform/hosted-images.ts";
import { newStorageCache } from "./platform/storage-cache.ts";
import { newTokenCache } from "./platform/stream-tokens.ts";

// Outside calls per cron run (Workers Paid allows 10,000): enough for a night with about 30 teams streaming or
// processing. A run still stays quick: each step's batches are small, and what's left waits five minutes.
const CRON_FETCH_BUDGET = 200;

// Lives as long as this Worker instance: admin pages reuse one Stream storage answer for a few minutes.
const storageCache = newStorageCache();
// Also per instance: plain Stream tokens are reused for an hour (Watch games signs one per game).
const tokenCache = newTokenCache();
// And photos' signed links, reused for an hour, so a phone that's seen the Photos page keeps its pictures cached.
const imageUrlCache = newImageUrlCache();

export default {
	async fetch(req, env, ctx) {
		const config = loadConfig(env);
		const deps = { ...buildDeps(env, config, { storageCache, tokenCache, imageUrlCache }), defer: (work: Promise<unknown>) => ctx.waitUntil(work) };
		// Who's asking: the session cookie (the site's own sign-in, auth/session.ts).
		const authenticate = sessionAuthenticator({ db: env.DB, now: deps.now, devAuthEmail: config.devAuthEmail });
		return handleRequest(req, deps, authenticate, buildRouter(), buildAdminRouter());
	},
	async scheduled(controller, env) {
		// Of the daily job's two triggers, the one that isn't 3am in the club's time zone today does nothing (jobs/daily.ts).
		const daily = DAILY_CRONS.has(controller.cron);
		if (daily && !dailyDue(controller.scheduledTime)) return;
		// Every team's work, each with its own deps (src/jobs/teams.ts).
		const deps = buildDeps(env, loadConfig(env), { fetch: createFetchBudget(CRON_FETCH_BUDGET).fetch });
		await (daily ? runDaily(deps) : runSync(deps));
	},
} satisfies ExportedHandler<Env>;
