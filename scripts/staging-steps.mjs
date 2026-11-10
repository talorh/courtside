import { profileArgs, readDeploy } from "./deploy-config.mjs";

// npm run staging's workings (scripts/staging.mjs), as plain functions (tests/scripts/staging.test.ts): what it runs, and
// the keys it gives staging.

/** The preview's name: its address is staging-<worker>.<the account's workers.dev subdomain>. */
export const PREVIEW = "staging";

export function parseArgs(argv) {
	const dryRun = argv.includes("--dry-run");
	const rest = argv.filter((a) => a !== "--dry-run");
	if (rest.length === 0) return { command: "deploy", dryRun };
	if (rest.length === 1 && rest[0] === "setup") return { command: "setup", dryRun };
	return { error: `Unknown ${rest.join(" ")}: npm run staging [-- --dry-run], or npm run staging -- setup [--dry-run].` };
}

/** Staging's database and the Worker's name, from deploy.config.ts (as text). */
export function stagingFromConfig(text) {
	const d = readDeploy(text);
	return { d1Id: d.staging.d1Id, worker: d.worker };
}

/** Deploying to staging: the checks, staging's migrations, then the preview. A dry run checks, then dry-runs the rest. */
export function deployPlan({ d1Id, dryRun }) {
	const dry = dryRun ? ["--dry-run"] : [];
	return [
		{ what: "npm run check", cmd: "npm", args: ["run", "check"] },
		{ what: "staging's migrations", cmd: "npx", args: ["cf", "d1", "migrations", "apply", d1Id, "--dir", "migrations", ...profileArgs(), ...dry] },
		{ what: "the code on staging", cmd: "npx", args: ["cf", "previews", "deploy", PREVIEW, ...profileArgs(), ...dry] },
	];
}

// Staging's keys: the live site's Stream ones (Stream is the account's, shared) and Insights' read-only token (the
// account's figures), and its own R2 key, for its own bucket, and its own Turnstile widget's secret.
const FROM_LIVE = ["STREAM_KEY_ID", "STREAM_KEY_JWK", "STREAM_API_TOKEN", "CF_INSIGHTS_TOKEN"];
const FROM_STAGING = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "TURNSTILE_SECRET"];

/** The secrets every new staging deploy gets (the Worker's Previews base configuration), as the API wants them. */
export function previewSecrets(live, staging) {
	const missing = [...FROM_LIVE.filter((k) => !live[k]), ...FROM_STAGING.filter((k) => !staging[k])];
	if (missing.length) throw new Error(`missing from the secrets files: ${missing.join(", ")}`);
	const env = {};
	for (const k of FROM_LIVE) env[k] = { type: "secret_text", text: live[k] };
	for (const k of FROM_STAGING) env[k] = { type: "secret_text", text: staging[k] };
	return env;
}

/** The Cloudflare API calls setup makes: the secrets for staging, then the Worker's Preview URLs on (workers.dev stays off). */
export function setupCalls(accountId, env, worker) {
	return [
		{ what: "staging's keys (Previews base configuration)", method: "PATCH", path: `/accounts/${accountId}/workers/workers/${worker}`,
			contentType: "application/merge-patch+json", body: { previews_base_config: { env } } },
		{ what: "the Worker's Preview URLs on, workers.dev still off", method: "POST", path: `/accounts/${accountId}/workers/scripts/${worker}/subdomain`,
			contentType: "application/json", body: { enabled: false, previews_enabled: true } },
	];
}
