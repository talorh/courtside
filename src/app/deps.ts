import { CLUB, mailFrom } from "../club.ts";
import { type Clipper, createClipper } from "../platform/stream-clips.ts";
import { createHostedImages, type ImagesPort, type ImageUrlCache, newImageUrlCache } from "../platform/hosted-images.ts";
import { createPlayhqClient, type PlayhqPort } from "../platform/playhq.ts";
import { createR2Originals, type OriginalsPort } from "../platform/r2-originals.ts";
import { createPresigner, type Presigner } from "../platform/r2-presigner.ts";
import { createStreamClient, type StreamPort } from "../platform/stream-client.ts";
import { createLiveClient, type LivePort } from "../platform/stream-live.ts";
import { newStorageCache, type StorageCache, withCachedStorage } from "../platform/storage-cache.ts";
import { createTokenSigner, newTokenCache, type TokenCache, type TokenSigner } from "../platform/stream-tokens.ts";
import { type AiPort, createAi } from "../platform/workers-ai.ts";
import type { Team } from "../features/teams/team.ts";
import type { AppConfig } from "./config.ts";
import { type CloudflareInsights, createCloudflareInsights } from "../platform/cloudflare-insights.ts";
import { type CloudflareBilling, createCloudflareBilling } from "../platform/cloudflare-billing.ts";
import { createEmail, type EmailPort } from "../platform/email.ts";
import { countedEmail } from "../features/admin/counted-email.ts";
import { type AssetsPort, createAssets } from "../platform/static-assets.ts";
import { createExchangeRates, type ExchangeRates } from "../platform/exchange-rates.ts";
import { createTurnstile, type TurnstilePort } from "../platform/turnstile.ts";
import { createJoiner, type JoinerPort } from "../platform/joiner.ts";

/** Everything a handler, service or job may use. Built per request/run in src/index.ts; faked in tests. */
export interface AppDeps {
	db: D1Database;
	config: AppConfig;
	stream: StreamPort;
	originals: OriginalsPort;
	presigner: Presigner;
	tokens: TokenSigner;
	clipper: Clipper;
	live: LivePort;
	playhq: PlayhqPort;
	ai: AiPort;
	images: ImagesPort;
	/** Emails: to the site's admins, and to a team manager about their own team (features/admin/admin-mail.ts only). */
	email: EmailPort;
	/** Cloudflare's own figures for the admin area's Platform; null without its read-only token. */
	cloudflare: CloudflareInsights | null;
	/** Cloudflare's own bill, day by day, for Costs (the same read-only token, with Billing Read); null without it. */
	billing: CloudflareBilling | null;
	/** The files in public/, served once the sign-in is checked (app/static-files.ts). */
	assets: AssetsPort;
	/** The sign-in page's check that a person is asking for a code (platform/turnstile.ts). */
	turnstile: TurnstilePort;
	/** The day's US dollar to the club's currency rate, for Costs (platform/exchange-rates.ts). */
	rates: ExchangeRates;
	/** The video joiner's Durable Object (platform/joiner.ts); null without its binding (cf dev), when a join waits. */
	joiner: JoinerPort | null;
	now: () => Date;
	/** The browser that sent the request, as the admin Log names it ("iPhone, Safari": shared/device.ts); "" for the jobs
	 * and anything that isn't a browser. Every Log line from a person is written with it. */
	device: string;
	/** Finishes a write the response needn't wait for (a member's last seen, a server error's count) after it has gone:
	 * the Worker's ctx.waitUntil. Without it (the jobs, the tests), the write is awaited. */
	defer?: (work: Promise<unknown>) => void;
}

/** A write that never fails (its own catch logs) goes on after the response where the Worker allows (deps.defer). */
export const afterwards = (deps: AppDeps, work: Promise<unknown>): Promise<unknown> => (deps.defer ? (deps.defer(work), Promise.resolve()) : work);

/** AppDeps for one team's work: a request for that team's pages, or a job's step for it. */
export type TeamDeps = AppDeps & { team: Team };

/** `deps` for `team`: every port as it is, with the team added. */
export const withTeam = (deps: AppDeps, team: Team): TeamDeps => ({ ...deps, team });

/**
 * `storageCache`, `tokenCache`, `imageUrlCache`: kept by src/index.ts for the life of the Worker instance. `fetch`: what
 * the platform clients call out with (the cron passes a budgeted one, `platform/fetch-budget.ts`).
 */
export function buildDeps(
	env: Env, config: AppConfig,
	o: { storageCache?: StorageCache; tokenCache?: TokenCache; imageUrlCache?: ImageUrlCache; fetch?: typeof globalThis.fetch } = {},
): AppDeps {
	const { storageCache = newStorageCache(), tokenCache = newTokenCache(), imageUrlCache = newImageUrlCache(), fetch } = o;
	const now = () => new Date();
	// Staging labels what it makes in the account's shared Stream and Images (platform/site-label.ts).
	const site = config.staging ? "staging" : null;
	const stream = { accountId: config.accountId, apiToken: config.streamApiToken, fetch, site };
	return {
		db: env.DB,
		config,
		now,
		joiner: env.JOINER ? createJoiner(env.JOINER) : null,
		device: "",
		stream: createStreamClient(stream),
		originals: createR2Originals(env.ORIGINALS),
		presigner: createPresigner({
			accountId: config.accountId,
			bucket: config.r2Bucket,
			accessKeyId: config.r2AccessKeyId,
			secretAccessKey: config.r2SecretAccessKey,
			fetch,
		}),
		clipper: createClipper(stream),
		live: withCachedStorage(createLiveClient(stream), storageCache, now),
		playhq: createPlayhqClient({ fetch }),
		ai: createAi(env.AI),
		images: createHostedImages(env.IMAGES, { now, cache: imageUrlCache, site }),
		email: countedEmail(createEmail(env.ADMIN_MAIL, { email: mailFrom(), name: CLUB.siteName }), env.DB, now), // every email counted by month, for the allowance alert
		cloudflare: config.cloudflareInsights ? createCloudflareInsights({
			accountId: config.accountId, zoneId: config.cloudflareInsights.zoneId, databaseId: config.cloudflareInsights.d1Id, bucket: config.r2Bucket,
			scriptName: config.workerName, token: config.cloudflareInsights.token, fetch,
		}) : null,
		billing: config.cloudflareInsights ? createCloudflareBilling({ accountId: config.accountId, token: config.cloudflareInsights.token, fetch }) : null,
		assets: createAssets(env.ASSETS),
		turnstile: createTurnstile({ secret: config.turnstileSecret, fetch }),
		rates: createExchangeRates({ fetch }),
		tokens: createTokenSigner({ keyId: config.streamKeyId, jwkBase64: config.streamKeyJwk, now, cache: tokenCache }),
	};
}
