import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { deployPlan, parseArgs, previewSecrets, setupCalls, stagingFromConfig } from "../../scripts/staging-steps.mjs";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { firstAdminSql } from "../../scripts/first-admin.mjs";

const LIVE = { STREAM_KEY_ID: "k", STREAM_KEY_JWK: "j", STREAM_API_TOKEN: "t", CF_INSIGHTS_TOKEN: "i", R2_ACCESS_KEY_ID: "live-r2", R2_SECRET_ACCESS_KEY: "live-r2-secret", TURNSTILE_SECRET: "live-ts" };
const STAGING = { R2_ACCESS_KEY_ID: "staging-r2", R2_SECRET_ACCESS_KEY: "staging-r2-secret", TURNSTILE_SECRET: "staging-ts" };

describe("npm run staging (docs/runbooks/staging.md)", () => {
	it("deploys by default, sets up with setup, and dry-runs either", () => {
		expect(parseArgs([])).toEqual({ command: "deploy", dryRun: false });
		expect(parseArgs(["--dry-run"])).toEqual({ command: "deploy", dryRun: true });
		expect(parseArgs(["setup", "--dry-run"])).toEqual({ command: "setup", dryRun: true });
		expect(parseArgs(["live"])).toHaveProperty("error");
	});

	it("checks the code, migrates staging's own database, then deploys the preview called staging", () => {
		const { d1Id, worker } = stagingFromConfig(readFileSync("deploy.config.ts", "utf8"));
		expect(worker).toBe("courtside");
		expect(d1Id).toBe("REPLACE_WITH_STAGING_D1_ID"); // the install fills it in; never the live database's id
		const plan = deployPlan({ d1Id, dryRun: true });
		const profile = process.env.CF_PROFILE ? ` --profile ${process.env.CF_PROFILE}` : "";
		expect(plan.map((s: { cmd: string; args: string[] }) => [s.cmd, ...s.args].join(" "))).toEqual([
			"npm run check",
			`npx cf d1 migrations apply ${d1Id} --dir migrations${profile} --dry-run`,
			`npx cf previews deploy --preview-name staging${profile} --dry-run`,
		]);
	});

	it("makes deploy.config.ts firstAdmins staging's first admins after its migrations, while staging has none, and not in a dry run", () => {
		const { firstAdmins } = stagingFromConfig(readFileSync("deploy.config.ts", "utf8"));
		expect(firstAdmins).toBe("REPLACE_WITH_THE_ADMINS_EMAILS"); // the install fills it in
		const admins = ["jordan@saints.example", "magic@saints.example"];
		const plan = deployPlan({ d1Id: "s1", dryRun: false, firstAdmins: admins, now: "2026-11-16T00:00:00.000Z" });
		const profile = process.env.CF_PROFILE ? ` --profile ${process.env.CF_PROFILE}` : "";
		expect(plan.map((s: { what: string }) => s.what)).toEqual(["npm run check", "staging's migrations", "the first admins, while staging has none", "the code on staging"]);
		expect([plan[2].cmd, ...plan[2].args].join(" ")).toBe(`npx cf d1 query s1 --sql ${firstAdminSql(admins, "2026-11-16T00:00:00.000Z", "npm run staging")}${profile}`);
	});

	it("gives staging the live site's Stream keys and its own R2 key, never the live bucket's", () => {
		const env = previewSecrets(LIVE, STAGING);
		// Insights' read-only token too: staging shows Cloudflare's figures for the account.
		expect(Object.keys(env).sort()).toEqual(["CF_INSIGHTS_TOKEN", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "STREAM_API_TOKEN", "STREAM_KEY_ID", "STREAM_KEY_JWK", "TURNSTILE_SECRET"]);
		expect(env.R2_ACCESS_KEY_ID).toEqual({ type: "secret_text", text: "staging-r2" });
		// Staging's own Turnstile widget (its address), never the live site's.
		expect(env.TURNSTILE_SECRET).toEqual({ type: "secret_text", text: "staging-ts" });
		expect(JSON.stringify(env)).not.toContain("live-r2");
		expect(() => previewSecrets(LIVE, {})).toThrow(/R2_ACCESS_KEY_ID/);
	});

	it("sets the secrets, then turns on the Worker's Preview URLs and leaves workers.dev off", () => {
		const calls = setupCalls("acct", previewSecrets(LIVE, STAGING), "courtside");
		expect(calls.map((c: { method: string; path: string }) => `${c.method} ${c.path}`)).toEqual(["PATCH /accounts/acct/workers/workers/courtside", "POST /accounts/acct/workers/scripts/courtside/subdomain"]);
		expect(calls[1]?.body).toEqual({ enabled: false, previews_enabled: true });
	});

	it("the config: a preview build runs on staging's database and bucket, with no domain or cron triggers", () => {
		const text = readFileSync("cloudflare.config.ts", "utf8");
		expect(text).toContain("domains: isPreview ? [] : [club.domain]");
		expect(text).toContain("triggers: isPreview ? [] : [");
		expect(text).toContain("DB: isPreview ? bindings.d1({ id: DEPLOY.staging.d1Id, name: DEPLOY.staging.d1Name })");
		expect(text).not.toMatch(/ACCESS_AUD|accessAud|cloudflareaccess/); // the site's own sign-in
		expect(text).toContain("workersDev: false,");
	});
});
