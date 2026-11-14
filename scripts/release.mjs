// npm run release: the only way to deploy the site (docs/development-standards.md §11). In order,
// stopping at the first that fails: the code is committed on main; it was tried on staging (npm run staging recorded
// it, and only docs, tests or notes changed since); npm run check; the browser suite (npm run e2e:
// Go live on Android, iPhone and Firefox); every migration on every database; nothing uploading or streaming on the live
// site; CHANGELOG.md has this deploy's line; cf deploy --dry-run; then it pushes the commit to main on Cloudflare,
// where Workers Builds runs npm run check again and deploys it with that line as its message and the commit as its tag
// (scripts/release-push.mjs), and follows that build. Nothing skips a step.
// Node strips its types itself, as it reads the changelog and R2 with the site's own code.
// `npm run release -- --check-only` does every check and the dry run, then stops without pushing.
// `npm run release -- --maintenance`: a release behind the maintenance page (docs/runbooks/maintenance.md). It refuses
// unless the page is on, and waits 2 quiet minutes instead of 15, as nobody can start anything behind it.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { availableParallelism, homedir, loadavg } from "node:os";
import { newestChange } from "../src/features/changelog/changelog.ts";
import { createPresigner } from "../src/platform/r2-presigner.ts";
import { cfToken } from "./deploy-config.mjs";
import { listRoutes, maintenanceRoutes } from "./maintenance-steps.mjs";
import {
	busyComputer,
	busyOnSite, databasesFromConfig, MAINTENANCE_QUIET_MINUTES, OPEN_STREAMS_SQL, QUIET_MINUTES, sameAsLive, siteFromConfig, STAGING_REF, stagingProblem,
	UPLOADING_SQL, JOINING_SQL,
} from "./release-checks.mjs";
import { pushMain, waitForBuild, workerTag } from "./release-push.mjs";

const step = (what) => console.log(`\nrelease: ${what}`);
const fail = (why) => {
	console.error(`\nrelease: STOPPED. ${why}`);
	process.exit(1);
};
const stop = (why) => fail(`Nothing deployed. ${why}`);
const passes = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" }).status === 0;
const output = (cmd, args, env = {}) => execFileSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 64e6 });

step("the code is committed on main");
if (output("git", ["status", "--porcelain"]).trim()) stop("Commit (or put away) the changes first: git status isn't clean.");
if (output("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim() !== "main") stop("Release from main: it's what Workers Builds deploys.");
const commit = output("git", ["rev-parse", "HEAD"]).trim();
const tag = commit.slice(0, 7); // as Workers Builds tags it (buildsDeployArgs)

step("this commit was tried on staging (or only docs, tests or notes changed since)");
const git = (args) => spawnSync("git", args, { encoding: "utf8" });
const staged = git(["rev-parse", "--verify", "--quiet", STAGING_REF]).stdout.trim() || null;
const inHistory = staged !== null && git(["merge-base", "--is-ancestor", staged, commit]).status === 0;
const changed = inHistory ? output("git", ["diff", "--name-only", staged, commit]).split("\n").filter(Boolean) : [];
const notStaged = stagingProblem({ staged, head: commit, inHistory, changed });
if (notStaged) stop(`Staging first: ${notStaged}.`);

// Before the release's own work (the unit tests spawn a worker a file), so it reads what else is running.
step("the computer is quiet (the browser suite's camera timings need it)");
const loaded = busyComputer(loadavg()[0], availableParallelism());
if (loaded) stop(`${loaded}.`);
step("npm run check");
if (!passes("npm", ["run", "check"])) stop("npm run check failed.");
step("the browser suite (npm run e2e)");
if (!passes("npm", ["run", "e2e"])) stop("The browser suite failed: every scenario must pass before a deploy.");

const config = readFileSync("deploy.config.ts", "utf8");
const site = siteFromConfig(config);
// cf's D1 calls sometimes want the account named and sometimes refuse it,
// so a refusal is tried once the other way.
const cfRead = (args, accountId) => {
	try {
		return output("cf", args, accountId === site.accountId ? {} : { CLOUDFLARE_ACCOUNT_ID: accountId });
	} catch {
		return output("cf", args, { CLOUDFLARE_ACCOUNT_ID: accountId });
	}
};
step("every migration applied to every database (the code may need it)");
for (const db of databasesFromConfig(config)) {
	const text = cfRead(["d1", "migrations", "list", db.d1Id, "--dir", "migrations"], db.accountId);
	const unapplied = JSON.parse(text.slice(text.indexOf("["))).map((m) => m.Name);
	if (unapplied.length) stop(`${db.name}'s database (${db.d1Id}) hasn't had ${unapplied.join(", ")}: apply it first (cf d1 migrations apply, --dry-run first).`);
}
const behindMaintenance = process.argv.includes("--maintenance");
if (behindMaintenance) {
	step("the maintenance page is on (--maintenance)");
	const token = cfToken(homedir());
	if (!maintenanceRoutes(await listRoutes({ token, fetch })).length) stop("--maintenance, but the maintenance page is off: npm run maintenance -- on first.");
}
const quietMinutes = behindMaintenance ? MAINTENANCE_QUIET_MINUTES : QUIET_MINUTES;
step(`nothing uploading or streaming on the live site (${site.name}), in any team: ${quietMinutes} minutes quiet`);
// A read-only query of the live site's database.
function query(sql) {
	const text = cfRead(["d1", "query", site.d1Id, "--sql", sql], site.accountId);
	return JSON.parse(text.slice(text.indexOf("[")))[0].results;
}
const streams = query(OPEN_STREAMS_SQL);
const uploading = query(UPLOADING_SQL);
const secrets = JSON.parse(readFileSync(site.secretsFile, "utf8"));
const r2 = createPresigner({ accountId: site.accountId, bucket: site.bucket, accessKeyId: secrets.R2_ACCESS_KEY_ID, secretAccessKey: secrets.R2_SECRET_ACCESS_KEY });
const uploads = await Promise.all(uploading.map(async (u) => ({ ...u, lastPartAt: ((await r2.listParts(u.r2Key, u.r2UploadId)) ?? []).map((p) => p.uploaded).sort().at(-1) ?? null })));
const joins = query(JOINING_SQL);
const busy = busyOnSite({ streams, uploads, joins, now: new Date(), quietMinutes });
if (busy.length) stop(`The site is busy: ${busy.join("; ")}. Wait until it has been quiet for ${quietMinutes} minutes.`);

step("CHANGELOG.md has this deploy's line");
const line = newestChange(readFileSync("CHANGELOG.md", "utf8"));
if (!line) stop("CHANGELOG.md has no lines.");
const liveMessage = () => {
	const deployments = output("cf", ["workers", "deployments", "list", "--worker", site.name, "--per-page", "1"]);
	return JSON.parse(deployments.slice(deployments.indexOf("{"))).deployments?.[0]?.annotations?.["workers/message"] ?? null;
};
if (sameAsLive(line, liveMessage())) stop(`The newest CHANGELOG.md line is what the site already runs ("${line}"). Add this deploy's line at the top.`);

// The deploy Workers Builds will run, without a secrets file (cf deploy keeps the Worker's secrets).
step(`cf deploy --dry-run (${tag}: ${line})`);
if (!passes("cf", ["deploy", "--message", line, "--tag", tag, "--dry-run"])) stop("The dry run failed.");
if (process.argv.includes("--check-only")) {
	console.log(`\nrelease: every check passed and the dry run worked; not pushed or deployed (--check-only).`);
	process.exit(0);
}
step("push main to Cloudflare (Workers Builds deploys it)");
const scriptId = workerTag(site.name); // looked up first: once main is pushed, Builds deploys whatever happens here
const pushedAt = Date.now() - 120_000; // Cloudflare's clock may be a little behind this computer's
let moved;
try {
	moved = pushMain(site.accountId, site.name);
} catch (err) {
	stop(`The push to Cloudflare was refused or failed: ${`${err.stderr ?? ""}`.trim() || err.message}`);
}
if (!moved) stop(`main on Cloudflare already has ${tag}, so no build starts. To build it again: cf builds create <trigger> --branch main (cf builds triggers list).`);
step(`Workers Builds: npm ci && npm run check, then npm run deploy:builds`);
const build = await waitForBuild({ scriptId, commit, pushedAt, say: (s) => console.log(`  ${s}`) });
if (build.state === "failed") stop(`The build of ${tag} failed (${build.outcome}); the site still runs the previous version. Its log: cf builds logs ${build.uuid}`);
if (build.state !== "deployed") fail(`The build of ${tag} hadn't finished after 20 minutes: it may still deploy. Check: cf builds get ${build.uuid ?? "(none started)"}`);
if (liveMessage() !== line) fail(`The build of ${tag} says it deployed, but the live deployment's message isn't "${line}". Check: cf workers deployments list --worker ${site.name}`);
console.log(`\nrelease: deployed ${tag}: ${line} (Workers Builds, build ${build.uuid})\nWatch the logs for 10 minutes (cf o11y telemetry, service ${site.name}).`);
