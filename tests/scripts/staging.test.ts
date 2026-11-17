import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { deployedSince, deployEnv, deployPlan, liveWorkerChecks, parseArgs, removeOnExit, setupCalls, stagingFromConfig, stagingSecrets, switchRefusal } from "../../scripts/staging-steps.mjs";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { firstAdminSql } from "../../scripts/first-admin.mjs";

const LIVE = { STREAM_KEY_ID: "k", STREAM_KEY_JWK: "j", STREAM_API_TOKEN: "t", CF_INSIGHTS_TOKEN: "i", R2_ACCESS_KEY_ID: "live-r2", R2_SECRET_ACCESS_KEY: "live-r2-secret", TURNSTILE_SECRET: "live-ts" };
const STAGING = { R2_ACCESS_KEY_ID: "staging-r2", R2_SECRET_ACCESS_KEY: "staging-r2-secret", TURNSTILE_SECRET: "staging-ts" };
const CONFIG = readFileSync("cloudflare.config.ts", "utf8");
const DEPLOY = readFileSync("deploy.config.ts", "utf8");
const profile = process.env.CF_PROFILE ? ` --profile ${process.env.CF_PROFILE}` : "";

describe("npm run staging (docs/runbooks/staging.md)", () => {
	it("deploys by default, sets up with setup, and dry-runs either", () => {
		expect(parseArgs([])).toEqual({ command: "deploy", dryRun: false });
		expect(parseArgs(["--dry-run"])).toEqual({ command: "deploy", dryRun: true });
		expect(parseArgs(["setup", "--dry-run"])).toEqual({ command: "setup", dryRun: true });
		expect(parseArgs(["live"])).toHaveProperty("error");
	});

	it("reads staging's own Worker, address and database from deploy.config.ts, never the live site's", () => {
		const staging = stagingFromConfig(DEPLOY);
		expect(staging.d1Id).toBe("REPLACE_WITH_STAGING_D1_ID"); // the install fills it in; never the live database's id
		expect(staging.liveWorker).toBe("courtside");
		expect(staging.worker).toBe("staging-courtside");
		expect(staging.host).toBe("staging-courtside.REPLACE_WITH_WORKERS_SUBDOMAIN.workers.dev");
	});

	it("checks the code, migrates staging's own database, then deploys its own Worker in staging mode with its keys", () => {
		const { d1Id } = stagingFromConfig(DEPLOY);
		const plan = deployPlan({ d1Id, dryRun: true, secretsFile: "/tmp/x/keys.json" });
		expect(plan.map((s: { cmd: string; args: string[] }) => [s.cmd, ...s.args].join(" "))).toEqual([
			"npm run check",
			`npx cf d1 migrations apply ${d1Id} --dir migrations${profile} --dry-run`,
			`npx cf deploy --mode staging --secrets-file /tmp/x/keys.json${profile} --dry-run`,
		]);
		expect(deployPlan({ d1Id, dryRun: false, firstAdmins: [], now: "", secretsFile: "k.json" }).at(-1).args).not.toContain("--dry-run");
	});

	it("makes deploy.config.ts firstAdmins staging's first admins after its migrations, while staging has none, and not in a dry run", () => {
		const { firstAdmins } = stagingFromConfig(DEPLOY);
		expect(firstAdmins).toBe("REPLACE_WITH_THE_ADMINS_EMAILS"); // the install fills it in
		const admins = ["jordan@saints.example", "magic@saints.example"];
		const plan = deployPlan({ d1Id: "s1", dryRun: false, firstAdmins: admins, now: "2026-11-16T00:00:00.000Z", secretsFile: "k.json" });
		expect(plan.map((s: { what: string }) => s.what)).toEqual(["npm run check", "staging's migrations", "the first admins, while staging has none", "the code on staging"]);
		expect([plan[2].cmd, ...plan[2].args].join(" ")).toBe(`npx cf d1 query s1 --sql ${firstAdminSql(admins, "2026-11-16T00:00:00.000Z", "npm run staging")}${profile}`);
	});

	it("gives staging the live site's Stream keys and Insights token, and its own R2 key and Turnstile secret", () => {
		const keys = stagingSecrets(LIVE, STAGING);
		expect(Object.keys(keys).sort()).toEqual(["CF_INSIGHTS_TOKEN", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "STREAM_API_TOKEN", "STREAM_KEY_ID", "STREAM_KEY_JWK", "TURNSTILE_SECRET"]);
		expect(keys.R2_ACCESS_KEY_ID).toBe("staging-r2");
		expect(keys.TURNSTILE_SECRET).toBe("staging-ts");
		expect(JSON.stringify(keys)).not.toContain("live-r2");
		expect(JSON.stringify(keys)).not.toContain("live-ts");
		expect(() => stagingSecrets(LIVE, {})).toThrow(/R2_ACCESS_KEY_ID/);
	});

	it("setup turns the live Worker's workers.dev and preview URLs off, deletes its old staging Preview, then puts staging's keys on", () => {
		const calls = setupCalls("acct", "courtside", "staging-courtside", stagingSecrets(LIVE, STAGING));
		expect(calls.map((c: { method: string; path: string }) => `${c.method} ${c.path}`)).toEqual([
			"POST /accounts/acct/workers/scripts/courtside/subdomain",
			"DELETE /accounts/acct/workers/workers/courtside/previews/staging",
			"PATCH /accounts/acct/workers/scripts/staging-courtside/secrets-bulk"]);
		expect(calls[0]?.what).toMatch(/live Worker's workers.dev and preview URLs off/);
		expect(calls[0]?.body).toEqual({ enabled: false, previews_enabled: false });
		expect(calls[0]?.ifMissing).toBeUndefined();
		expect(calls[1]?.body).toBeUndefined();
		expect(calls[1]?.ifMissing).toMatch(/already gone/);
		expect(calls[2]?.ifMissing).toMatch(/first npm run staging/);
		expect(calls[2]?.contentType).toBe("application/merge-patch+json");
		expect(calls[2]?.body.secrets.R2_ACCESS_KEY_ID).toEqual({ type: "secret_text", text: "staging-r2" });
		expect(Object.keys(calls[2]?.body.secrets)).toHaveLength(7);
		expect(JSON.stringify(calls[2]?.body)).not.toContain("live-r2");
	});

	it("reads, without changing anything, the live Worker's workers.dev and preview URLs and its Previews before a deploy", () => {
		expect(liveWorkerChecks("acct", "courtside")).toEqual({
			subdomain: "/accounts/acct/workers/scripts/courtside/subdomain", previews: "/accounts/acct/workers/workers/courtside/previews" });
	});

	it("refuses to deploy while the live Worker's previews are on or it still has a Preview, so staging's address is its own", () => {
		const off = { enabled: false, previews_enabled: false };
		expect(switchRefusal(off, [])).toBeNull();
		expect(switchRefusal({ ...off, previews_enabled: true }, [])).toMatch(/preview URLs are on.*npm run staging -- setup/);
		expect(switchRefusal({ ...off, enabled: true }, [])).toMatch(/workers.dev.*npm run staging -- setup/);
		expect(switchRefusal(off, [{ name: "staging", urls: ["https://staging-courtside.saints-club.workers.dev"] }]))
			.toMatch(/still has a Preview, staging.*npm run staging -- setup/);
		expect(switchRefusal(null, [])).toMatch(/couldn't read/);
		expect(switchRefusal(off, null)).toMatch(/couldn't read/);
	});

	it("records staging only once staging's Worker has a deployment from this deploy", () => {
		const since = Date.parse("2026-11-17T10:00:00Z");
		const at = (iso: string) => ({ deployments: [{ id: "d", created_on: iso }] });
		expect(deployedSince(at("2026-11-17T10:00:30Z"), since)).toBe(true);
		expect(deployedSince(at("2026-11-17T09:59:30Z"), since)).toBe(true); // a clock a little ahead of Cloudflare's
		expect(deployedSince(at("2026-11-17T09:50:00Z"), since)).toBe(false);
		expect(deployedSince({ deployments: [] }, since)).toBe(false);
		expect(deployedSince(null, since)).toBe(false);
	});

	it("the config: staging mode is its own Worker on workers.dev, on staging's database and bucket, with no domain or cron triggers", () => {
		expect(CONFIG).toContain("const isStaging = mode === \"staging\";");
		expect(CONFIG).toContain("name: isStaging ? `staging-${DEPLOY.worker}` : DEPLOY.worker,");
		expect(CONFIG).toContain("domains: isStaging ? [] : [club.domain]");
		expect(CONFIG).toContain("workersDev: isStaging,");
		expect(CONFIG).toContain("triggers: isStaging ? [] : [");
		expect(CONFIG).toContain("DB: isStaging ? bindings.d1({ id: DEPLOY.staging.d1Id, name: DEPLOY.staging.d1Name })");
		expect(CONFIG).toContain("STAGING: isStaging && bindings.text(\"1\"),");
		expect(CONFIG).toContain("JOINER: isDev ? undefined : bindings.durableObject({ worker: `${DEPLOY.worker}-join`, exportName: \"Joiner\" }),");
		expect(CONFIG).not.toMatch(/ACCESS_AUD|accessAud|cloudflareaccess/); // the site's own sign-in
	});

	it("no version of either Worker gets a preview URL: Previews are gone", () => {
		expect(CONFIG).toContain("previewUrls: false,");
		expect(CONFIG).not.toMatch(/previewUrls: true|isPreview/);
	});

	it("runs its steps without any of staging's secret names in the environment, so a shell's export can't take the file's place", () => {
		const env = deployEnv({ PATH: "/usr/bin", CLOUDFLARE_ACCOUNT_ID: "acct", ...LIVE });
		expect(env).toEqual({ PATH: "/usr/bin", CLOUDFLARE_ACCOUNT_ID: "acct" });
		const shell = { R2_ACCESS_KEY_ID: "x" };
		deployEnv(shell);
		expect(shell).toEqual({ R2_ACCESS_KEY_ID: "x" });
	});

	it("removes the keys file when it exits, and on Ctrl-C or a stop, then stops", () => {
		for (const [event, code] of [["exit", undefined], ["SIGINT", 130], ["SIGTERM", 143]] as const) {
			const proc = new EventEmitter() as EventEmitter & { exit: (code: number) => void };
			const exits: number[] = [];
			proc.exit = (c) => exits.push(c);
			const remove = vi.fn();
			removeOnExit(proc, remove);
			proc.emit(event);
			expect(remove).toHaveBeenCalledTimes(1);
			expect(exits).toEqual(code === undefined ? [] : [code]);
		}
	});
});
