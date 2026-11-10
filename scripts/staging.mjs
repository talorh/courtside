// npm run staging [-- --dry-run]   |   npm run staging -- setup [--dry-run]   (docs/runbooks/staging.md)
// Staging: the site as a Worker Preview of the Worker, on its own database and bucket, behind the same sign-in, with test
// data only: for trying a change on real phones before npm run release. Deploying: the staging branch, committed, npm run check,
// staging's migrations, then cf previews deploy staging. setup (once, and after a key changes): staging's keys, through
// the API and never printed, and the Worker's Preview URLs on. It never touches the live site's database or bucket.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { cfToken, profileArgs } from "./deploy-config.mjs";
import { siteFromConfig, STAGING_REF } from "./release-checks.mjs";
import { deployPlan, parseArgs, previewSecrets, setupCalls, stagingFromConfig } from "./staging-steps.mjs";

const say = (text) => console.log(`staging: ${text}`);
const fail = (text) => {
	console.error(`staging: STOPPED. ${text}`);
	process.exit(1);
};

const args = parseArgs(process.argv.slice(2));
if (args.error) fail(args.error);
const config = readFileSync("deploy.config.ts", "utf8");
const site = siteFromConfig(config);
const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: site.accountId };

if (args.command === "setup") {
	// The keys live in git-ignored files beside the code (the live site's, and staging's R2 key).
	const read = (file) => {
		if (!existsSync(file)) fail(`${file} isn't here (runbook: Staging, Setting it up).`);
		return JSON.parse(readFileSync(file, "utf8"));
	};
	const calls = setupCalls(site.accountId, previewSecrets(read(".secrets.production.json"), read(".secrets.staging.json")), site.name);
	if (args.dryRun) {
		for (const c of calls) say(`would ${c.method} ${c.path}: ${c.what}`);
		process.exit(0);
	}
	// cf's own login, refreshed first; the token and the keys only ever go to Cloudflare's API.
	execFileSync("npx", ["cf", "auth", "whoami", ...profileArgs()], { stdio: "ignore", env });
	const token = cfToken(homedir());
	for (const c of calls) {
		const res = await fetch(`https://api.cloudflare.com/client/v4${c.path}`, {
			method: c.method, headers: { Authorization: `Bearer ${token}`, "Content-Type": c.contentType }, body: JSON.stringify(c.body),
		});
		const reply = await res.json().catch(() => ({}));
		if (!res.ok || !reply.success) fail(`${c.what}: Cloudflare said ${res.status} ${JSON.stringify(reply.errors ?? [])}.`);
		say(`done: ${c.what}`);
	}
	say("set up. Deploy the code with: npm run staging");
	process.exit(0);
}

if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) fail("Commit (or put away) the changes first, so it's clear what staging runs.");
// Staging runs the staging branch only (a fix/feature branching model): a change is merged into it
// from its feature/ or fix/ branch, then put here, then main is fast-forwarded to it for the release.
const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
if (branch !== "staging") fail(`Staging deploys the staging branch, not "${branch}": merge the change into staging first.`);
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
for (const step of deployPlan({ d1Id: stagingFromConfig(config).d1Id, dryRun: args.dryRun })) {
	say(step.what);
	if (spawnSync(step.cmd, step.args, { stdio: "inherit", env }).status !== 0) fail(`${step.what} failed.`);
}
if (args.dryRun) {
	say(`dry run done: nothing changed (${commit}).`);
	process.exit(0);
}
// What's on staging now, for npm run release's staging check (a ref the worktree and main share; no push sends it).
execFileSync("git", ["update-ref", STAGING_REF, execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()]);
say(`${commit} is on staging: https://staging-${site.name}.<your workers.dev subdomain> (test data). Try it there, then release it.`);
