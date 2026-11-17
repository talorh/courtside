import { profileArgs, readDeploy } from "./deploy-config.mjs";
import { firstAdminSql } from "./first-admin.mjs";

// npm run staging's workings (scripts/staging.mjs), as plain functions (tests/scripts/staging.test.ts): what it runs, and
// the keys it gives staging.

export function parseArgs(argv) {
	const dryRun = argv.includes("--dry-run");
	const rest = argv.filter((a) => a !== "--dry-run");
	if (rest.length === 0) return { command: "deploy", dryRun };
	if (rest.length === 1 && rest[0] === "setup") return { command: "setup", dryRun };
	return { error: `Unknown ${rest.join(" ")}: npm run staging [-- --dry-run], or npm run staging -- setup [--dry-run].` };
}

/** Staging's own Worker (staging-<worker>), its address and database, the live Worker's name and the first admins'
 * emails, from deploy.config.ts (as text). */
export function stagingFromConfig(text) {
	const d = readDeploy(text);
	if (!d.staging.host) throw new Error("couldn't read staging's address (staging.host) from deploy.config.ts");
	return { d1Id: d.staging.d1Id, worker: `staging-${d.worker}`, host: d.staging.host, liveWorker: d.worker, firstAdmins: d.firstAdmins };
}

/**
 * Deploying to staging: the checks, staging's migrations, the first admins (`firstAdmins`, while staging has never had
 * an admin, so a new install can sign in), then staging's own Worker (the config in staging mode). Its keys go with every
 * deploy (`secretsFile`), as a Worker that doesn't exist yet can't be given them any other way. A dry run checks, then
 * dry-runs the rest: cf's D1 query has no dry run, so it leaves the first admins out.
 */
export function deployPlan({ d1Id, dryRun, firstAdmins, now, secretsFile }) {
	const dry = dryRun ? ["--dry-run"] : [];
	const admins = () => ({ what: "the first admins, while staging has none", cmd: "npx", args: ["cf", "d1", "query", d1Id, "--sql", firstAdminSql(firstAdmins, now, "npm run staging"), ...profileArgs()] });
	return [
		{ what: "npm run check", cmd: "npm", args: ["run", "check"] },
		{ what: "staging's migrations", cmd: "npx", args: ["cf", "d1", "migrations", "apply", d1Id, "--dir", "migrations", ...profileArgs(), ...dry] },
		...(dryRun ? [] : [admins()]),
		{ what: "the code on staging", cmd: "npx", args: ["cf", "deploy", "--mode", "staging", "--secrets-file", secretsFile, ...profileArgs(), ...dry] },
	];
}

// Staging's keys: the live site's Stream ones (Stream is the account's, shared) and Insights' read-only token (the
// account's figures), and its own R2 key, for its own bucket, and its own Turnstile widget's secret.
const FROM_LIVE = ["STREAM_KEY_ID", "STREAM_KEY_JWK", "STREAM_API_TOKEN", "CF_INSIGHTS_TOKEN"];
const FROM_STAGING = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "TURNSTILE_SECRET"];

/** Staging's secrets by name, from the two secrets files: the deploy's secrets file, and setup's keys. */
export function stagingSecrets(live, staging) {
	const missing = [...FROM_LIVE.filter((k) => !live[k]), ...FROM_STAGING.filter((k) => !staging[k])];
	if (missing.length) throw new Error(`missing from the secrets files: ${missing.join(", ")}`);
	const keys = {};
	for (const k of FROM_LIVE) keys[k] = live[k];
	for (const k of FROM_STAGING) keys[k] = staging[k];
	return keys;
}

/** The environment for npm run staging's steps: the caller's, less staging's secret names, so the keys file is the only
 * place the deploy takes them from (a shell's export can't put another value in). */
export function deployEnv(env) {
	const out = { ...env };
	for (const name of [...FROM_LIVE, ...FROM_STAGING]) delete out[name];
	return out;
}

/** Runs `remove` (the keys file's folder) when the process exits, and on Ctrl-C (SIGINT) or a stop (SIGTERM), then stops. */
export function removeOnExit(proc, remove) {
	proc.on("exit", remove);
	for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
		proc.on(signal, () => {
			remove();
			proc.exit(code);
		});
	}
}

/** The live Worker's old Preview, which staging was before it became its own Worker: it holds staging's address. */
export const OLD_PREVIEW = "staging";

/**
 * The Cloudflare API calls setup makes, in this order: the live Worker's workers.dev and preview URLs off (so no version
 * of it answers on a workers.dev address), its old staging Preview deleted (it holds staging's address), then staging's
 * keys onto staging's own Worker at once, without a deploy (after a key changes). A call with `ifMissing` is done when
 * Cloudflare answers 404: the Preview already gone (or never made), or staging's Worker not made yet (its first deploy
 * sends the keys).
 */
export function setupCalls(accountId, liveWorker, stagingWorker, keys) {
	const secrets = Object.fromEntries(Object.entries(keys).map(([name, text]) => [name, { type: "secret_text", text }]));
	return [
		{ what: "the live Worker's workers.dev and preview URLs off", method: "POST", path: `/accounts/${accountId}/workers/scripts/${liveWorker}/subdomain`,
			contentType: "application/json", body: { enabled: false, previews_enabled: false } },
		{ what: `the live Worker's old Preview, ${OLD_PREVIEW}, deleted`, method: "DELETE",
			path: `/accounts/${accountId}/workers/workers/${liveWorker}/previews/${OLD_PREVIEW}`, ifMissing: "already gone" },
		{ what: `staging's keys on ${stagingWorker}`, method: "PATCH", path: `/accounts/${accountId}/workers/scripts/${stagingWorker}/secrets-bulk`,
			contentType: "application/merge-patch+json", body: { secrets },
			ifMissing: `${stagingWorker} isn't there yet: its first npm run staging makes it and sends them` },
	];
}

/** What a deploy reads first (GET only): the live Worker's workers.dev and preview URL settings, and its Previews. */
export function liveWorkerChecks(accountId, liveWorker) {
	return { subdomain: `/accounts/${accountId}/workers/scripts/${liveWorker}/subdomain`, previews: `/accounts/${accountId}/workers/workers/${liveWorker}/previews` };
}

/**
 * Why a deploy mustn't go yet, or null. While the live Worker's previews are on, or its old Preview still holds staging's
 * address, a live version would answer beside staging's own Worker.
 */
export function switchRefusal(subdomain, previews) {
	const setup = "Run npm run staging -- setup first (docs/runbooks/staging.md).";
	if (!subdomain || !Array.isArray(previews)) return `couldn't read the live Worker's settings and Previews. ${setup}`;
	if (subdomain.enabled) return `The live Worker answers on workers.dev. ${setup}`;
	if (subdomain.previews_enabled) return `The live Worker's preview URLs are on. ${setup}`;
	if (previews.length) return `The live Worker still has a Preview, ${previews.map((p) => p.name).join(", ")}. ${setup}`;
	return null;
}

/** Whether staging's Worker has a deployment made since the deploy began (a minute's grace for this computer's clock). */
export function deployedSince(reply, sinceMs) {
	const newest = Math.max(...(reply?.deployments ?? []).map((d) => Date.parse(d.created_on)));
	return newest >= sinceMs - 60_000;
}
