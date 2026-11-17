// npm run staging [-- --dry-run]   |   npm run staging -- setup [--dry-run]   (docs/runbooks/staging.md)
// Staging: the site as its own Worker, staging-<worker> (cloudflare.config.ts in staging mode), on its own database and
// bucket, behind the same sign-in, with test data only: for trying a change on real phones before npm run release.
// Deploying: the staging branch, committed, the live Worker's previews off and its old Preview gone, npm run check,
// staging's migrations, the first admins, cf deploy --mode staging with staging's keys, then staging's Worker's new
// deployment confirmed before it's recorded. setup (first, and after a key changes): the live Worker's workers.dev and
// preview URLs off, its old staging Preview deleted, then staging's keys put on at once, through the API and never
// printed. It never touches the live site's database or bucket.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { cfToken, profileArgs } from "./deploy-config.mjs";
import { firstAdminEmails } from "./first-admin.mjs";
import { headMoved, siteFromConfig, STAGING_REF } from "./release-checks.mjs";
import { deployedSince, deployEnv, deployPlan, liveWorkerChecks, parseArgs, removeOnExit, setupCalls, stagingFromConfig, stagingSecrets, switchRefusal } from "./staging-steps.mjs";

const say = (text) => console.log(`staging: ${text}`);
const fail = (text) => {
	console.error(`staging: STOPPED. ${text}`);
	process.exit(1);
};

const args = parseArgs(process.argv.slice(2));
if (args.error) fail(args.error);
const config = readFileSync("deploy.config.ts", "utf8");
const site = siteFromConfig(config);
let staging;
try {
	staging = stagingFromConfig(config);
} catch (err) {
	fail(err.message);
}
const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: site.accountId };
// The keys live in git-ignored files beside the code (the live site's, and staging's R2 key and Turnstile secret).
const read = (file) => {
	if (!existsSync(file)) fail(`${file} isn't here (runbook: Staging, Setting it up).`);
	return JSON.parse(readFileSync(file, "utf8"));
};
const keys = () => stagingSecrets(read(".secrets.production.json"), read(".secrets.staging.json"));

// Cloudflare's API with cf's own login, refreshed first; the token and the keys only ever go to Cloudflare.
let token = null;
async function api(method, path, { contentType, body } = {}) {
	if (!token) {
		execFileSync("npx", ["cf", "auth", "whoami", ...profileArgs()], { stdio: "ignore", env });
		token = cfToken(homedir());
	}
	const headers = { Authorization: `Bearer ${token}`, ...(contentType ? { "Content-Type": contentType } : {}) };
	const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
	const reply = await res.json().catch(() => ({}));
	return { status: res.status, ok: res.ok && reply.success === true, result: reply.result, errors: reply.errors ?? [] };
}

if (args.command === "setup") {
	const calls = setupCalls(site.accountId, staging.liveWorker, staging.worker, keys());
	if (args.dryRun) {
		for (const c of calls) say(`would ${c.method} ${c.path}: ${c.what}`);
		process.exit(0);
	}
	for (const c of calls) {
		const reply = await api(c.method, c.path, c);
		if (!reply.ok && reply.status === 404 && c.ifMissing) say(`${c.what}: ${c.ifMissing}`);
		else if (!reply.ok) fail(`${c.what}: Cloudflare said ${reply.status} ${JSON.stringify(reply.errors)}.`);
		else say(`done: ${c.what}`);
	}
	say("set up. Deploy the code with: npm run staging");
	process.exit(0);
}

if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) fail("Commit (or put away) the changes first, so it's clear what staging runs.");
// Staging runs the staging branch only (a fix/feature branching model): a change is merged into it
// from its feature/ or fix/ branch, then put here, then main is fast-forwarded to it for the release.
const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
if (branch !== "staging") fail(`Staging deploys the staging branch, not "${branch}": merge the change into staging first.`);
// Staging's address is its own only once the live Worker has no preview URLs and no Preview (read only; a dry run too).
const checks = liveWorkerChecks(site.accountId, staging.liveWorker);
const [subdomain, previews] = await Promise.all([api("GET", checks.subdomain), api("GET", checks.previews)]);
const refusal = switchRefusal(subdomain.status === 404 ? "missing" : subdomain.ok ? subdomain.result : null, previews.ok ? previews.result : null);
if (refusal) fail(refusal);
const head = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
// The commit being deployed, taken before the deploy: it's the one recorded, and only while HEAD is still on it.
const deployed = head();
const commit = deployed.slice(0, 7);
let firstAdmins;
try {
	firstAdmins = firstAdminEmails(staging);
} catch (err) {
	fail(err.message);
}
// Staging's keys go with the deploy, in a file only this user can read, written just before the deploy step and removed
// as soon as it's done, or when the command ends or is stopped. The steps run without those names in their environment.
const stagingKeys = keys();
const keysDir = mkdtempSync(join(tmpdir(), "courtside-staging-"));
const secretsFile = join(keysDir, "keys.json");
removeOnExit(process, () => rmSync(keysDir, { recursive: true, force: true }));
const stepEnv = deployEnv(env);
let failed = null;
let deployStarted = 0;
for (const step of deployPlan({ d1Id: staging.d1Id, dryRun: args.dryRun, firstAdmins, now: new Date().toISOString(), secretsFile })) {
	say(step.what);
	if (step.args.includes(secretsFile)) {
		writeFileSync(secretsFile, JSON.stringify(stagingKeys), { mode: 0o600 });
		deployStarted = Date.now();
	}
	if (spawnSync(step.cmd, step.args, { stdio: "inherit", env: stepEnv }).status !== 0) {
		failed = step.what;
		break;
	}
}
rmSync(keysDir, { recursive: true, force: true });
if (failed) fail(`${failed} failed.`);
if (args.dryRun) {
	say(`dry run done: nothing changed (${commit}).`);
	process.exit(0);
}
// The deploy said it worked: staging's own Worker must show it before anything is recorded.
const deployments = await api("GET", `/accounts/${site.accountId}/workers/scripts/${staging.worker}/deployments`);
if (!deployments.ok || !deployedSince(deployments.result, deployStarted)) {
	fail(`${staging.worker} has no deployment from just now (Cloudflare said ${deployments.status}). Nothing is recorded as on staging.`);
}
// What's on staging now, for npm run release's staging check (a ref the worktree and main share; no push sends it).
const movedOn = headMoved(deployed, head());
if (movedOn) fail(`${movedOn}. Nothing is recorded as on staging, as it may run either commit's code.`);
execFileSync("git", ["update-ref", STAGING_REF, deployed]);
say(`${commit} is on staging: https://${staging.host} (test data). Try it there, then release it.`);
