// npm run terraform -- setup | check | plan | adopt | apply | drift | upgrade   (docs/runbooks/terraform.md)
// The club's Cloudflare setup as Terraform (infra/terraform), for a club that would rather manage it that way than with
// the runbook's cf commands; both send the same infra/ files. setup readies this computer (scripts/terraform-setup.mjs).
// The commands that reach Cloudflare run only while deploy.config.ts cloudflareSetup is "terraform". check: fmt, validate and the tests against a stand-in
// provider, with no token and nothing sent. plan writes the variables from deploy.config.ts and src/club.ts and saves a
// plan; adopt plans the import of an install cf made; apply applies the saved plan alone, after the site owner's yes
// (AGENTS.md); drift says whether Cloudflare still matches. The token is CLOUDFLARE_API_TOKEN, else the cf login's
// own, never printed.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { cfToken, keepLoginInFile, profileArgs } from "./deploy-config.mjs";
import { setUp } from "./terraform-setup.mjs";
import { applyRefusal, parseArgs, PLAN_FILE, planArgs, PLATFORMS, setupRefusal, terraformVars, withOutputs } from "./terraform-steps.mjs";

// Every cf command below keeps the login in its plaintext file, out of the keyring.
keepLoginInFile();

// The state, saved plans and variables hold secrets and ids: readable by this user alone.
process.umask(0o077);
const DIR = "infra/terraform";
const VARS = `${DIR}/courtside.auto.tfvars.json`;
const say = (text) => console.log(`terraform: ${text}`);
const fail = (text) => {
	console.error(`terraform: STOPPED. ${text}`);
	process.exit(1);
};

const args = parseArgs(process.argv.slice(2));
if (args.error) fail(args.error);
if (args.command === "setup") process.exit((await setUp(say)) ? 0 : 1);
const refusal = setupRefusal(readFileSync("deploy.config.ts", "utf8"), args.command);
if (refusal) fail(refusal);
const bin = "terraform";
if (spawnSync(bin, ["version"], { stdio: "ignore" }).status !== 0) fail("Terraform isn't installed: npm run terraform -- setup.");

const run = (tfArgs, env = process.env) => spawnSync(bin, tfArgs, { cwd: DIR, stdio: "inherit", env }).status;
const must = (tfArgs, env) => {
	if (run(tfArgs, env) !== 0) fail(`${bin} ${tfArgs[0]} failed.`);
};

if (args.command === "check") {
	// Nothing here needs Cloudflare: the provider is fetched by its locked checksums and the tests use a stand-in.
	must(["fmt", "-check", "-recursive"]);
	must(["init", "-backend=false", "-input=false", "-lockfile=readonly"]);
	must(["validate"]);
	must(["test"]);
	say("formatted, valid, and its tests pass");
	process.exit(0);
}
if (args.command === "upgrade") {
	// The one way the lock file changes: a newer provider within terraform.tf's constraint, locked for every platform.
	must(["init", "-backend=false", "-input=false", "-upgrade"]);
	must(["providers", "lock", ...PLATFORMS.map((p) => `-platform=${p}`)]);
	say(".terraform.lock.hcl updated: read its diff and the provider's changelog, then npm run terraform -- check");
	process.exit(0);
}
if (args.command === "apply" && applyRefusal(existsSync(`${DIR}/${PLAN_FILE}`))) fail(applyRefusal(false));

// A plan, adopt, apply or drift reaches Cloudflare: the variables, then the token (the cf login's, refreshed first).
try {
	const vars = terraformVars(readFileSync("deploy.config.ts", "utf8"), readFileSync("src/club.ts", "utf8"), { adopt: args.command === "adopt" });
	writeFileSync(VARS, `${JSON.stringify(vars, null, 2)}\n`);
} catch (err) {
	fail(err.message);
}
let token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
	execFileSync("npx", ["cf", "auth", "whoami", ...profileArgs()], { stdio: "ignore" });
	try { token = cfToken(homedir()); } catch (e) { fail(e.message); }
}
const env = { ...process.env, CLOUDFLARE_API_TOKEN: token };
must(["init", "-input=false", "-lockfile=readonly"], env);

if (args.command === "apply") {
	must(["apply", "-input=false", PLAN_FILE], env);
	// A plan applies once; the next change starts from a new one.
	rmSync(`${DIR}/${PLAN_FILE}`);
	writeBack();
	process.exit(0);
}
const status = run(planArgs(args.command), env);
if (args.command === "drift") {
	if (status === 0) say("Cloudflare matches infra/: no drift");
	else if (status === 2) fail("Cloudflare differs from infra/ (the plan above): someone changed it outside Terraform, or infra/ changed");
	else fail(`${bin} plan failed.`);
	process.exit(0);
}
if (status !== 0) fail(`${bin} plan failed.`);
say(`plan saved as ${DIR}/${PLAN_FILE}. Read it with the site owner; on their yes, npm run terraform -- apply`);

/** The ids an apply made into deploy.config.ts, and the sign-in widgets' secrets into the git-ignored secrets files as
 * TURNSTILE_SECRET (the release and npm run staging -- setup put them on the Workers). Read from the state, never shown. */
function writeBack() {
	const out = spawnSync(bin, ["output", "-json"], { cwd: DIR, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
	if (out.status !== 0) fail("applied, but terraform output failed: deploy.config.ts and the secrets files weren't updated (docs/runbooks/terraform.md §4).");
	const value = (name) => JSON.parse(out.stdout)[name]?.value;
	try {
		writeFileSync("deploy.config.ts", withOutputs(readFileSync("deploy.config.ts", "utf8"), { d1_ids: value("d1_ids"), turnstile_site_keys: value("turnstile_site_keys") }));
	} catch (err) {
		fail(`applied, but ${err.message}`);
	}
	const secrets = value("turnstile_secrets");
	for (const [env, file] of [["live", ".secrets.production.json"], ["staging", ".secrets.staging.json"]]) {
		const keys = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
		writeFileSync(file, `${JSON.stringify({ ...keys, TURNSTILE_SECRET: secrets[env] }, null, 2)}\n`, { mode: 0o600 });
	}
	say("applied. deploy.config.ts has the databases' ids and the site keys (commit it); the secrets files have the Turnstile secrets");
}
