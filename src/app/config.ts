const REQUIRED = {
	accountId: "ACCOUNT_ID",
	streamCustomerCode: "STREAM_CUSTOMER_CODE",
	r2Bucket: "R2_BUCKET",
	streamKeyId: "STREAM_KEY_ID",
	streamKeyJwk: "STREAM_KEY_JWK",
	r2AccessKeyId: "R2_ACCESS_KEY_ID",
	r2SecretAccessKey: "R2_SECRET_ACCESS_KEY",
	streamApiToken: "STREAM_API_TOKEN",
	/** The sign-in page's Turnstile widget (platform/turnstile.ts): its site key, shown on the page, and its secret. */
	turnstileSiteKey: "TURNSTILE_SITE_KEY",
	turnstileSecret: "TURNSTILE_SECRET",
} as const;

export type AppConfig = { readonly [K in keyof typeof REQUIRED]: string } & {
	readonly devAuthEmail: string | null;
	/** STAGING=1: this is staging (docs/runbooks/staging.md), with test data, never the live site. */
	readonly staging: boolean;
	/** WORKER_NAME: the Worker's name in the account (cloudflare.config.ts), for its own figures on Platform. */
	readonly workerName: string;
	/** CF_INSIGHTS_TOKEN (the read-only courtside-insights-read), ZONE_ID and D1_ID: Cloudflare's own figures on the admin
	 * area's Platform. Null when any is missing (local dev): Platform says it needs the token. */
	readonly cloudflareInsights: { token: string; zoneId: string; d1Id: string } | null;
};

const insights = (token: string | null, zoneId: string | null, d1Id: string | null) => (token && zoneId && d1Id ? { token, zoneId, d1Id } : null);

export class ConfigError extends Error {
	override name = "ConfigError";
}

/** Reads Worker env into typed config. Throws if anything required is missing, so a half-provisioned Worker can't start. */
export function loadConfig(env: object): AppConfig {
	const source = env as Record<string, unknown>;
	const values: Record<string, string> = {};
	const missing: string[] = [];
	for (const [key, name] of Object.entries(REQUIRED)) {
		const value = source[name];
		if (typeof value === "string" && value.trim() !== "") values[key] = value;
		else missing.push(name);
	}
	if (missing.length > 0) throw new ConfigError(`Missing configuration: ${missing.join(", ")}`);
	const optional = (name: string) => (typeof source[name] === "string" && source[name] !== "" ? source[name] as string : null);
	return {
		...(values as Record<keyof typeof REQUIRED, string>), devAuthEmail: optional("DEV_AUTH_EMAIL"),
		staging: optional("STAGING") === "1", workerName: optional("WORKER_NAME") ?? "courtside",
		cloudflareInsights: insights(optional("CF_INSIGHTS_TOKEN"), optional("ZONE_ID"), optional("D1_ID")),
	};
}
