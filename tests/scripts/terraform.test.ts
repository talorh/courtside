import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: a Node script (plain JS), tested here on its own.
import { applyRefusal, CF_TERRAFORMING, CF_TERRAFORMING_SHA256, cfTerraformingAsset, parseArgs, planArgs, setupRefusal, terraformInstall, terraformVars, terraformVersionOk, withOutputs } from "../../scripts/terraform-steps.mjs";

const club = readFileSync("src/club.ts", "utf8");
// deploy.config.ts as an install leaves it, with made-up ids.
const installed = readFileSync("deploy.config.ts", "utf8")
	.replace("REPLACE_WITH_ACCOUNT_ID", "0123456789abcdef0123456789abcdef")
	.replace("REPLACE_WITH_ZONE_ID", "fedcba9876543210fedcba9876543210")
	.replace('turnstileSiteKey: "REPLACE_WITH_TURNSTILE_SITE_KEY"', 'turnstileSiteKey: "0x4AAAAAAAlive"')
	.replace("REPLACE_WITH_STAGING_D1_ID", "00000000-0000-4000-8000-000000000002")
	.replace("REPLACE_WITH_STAGING_TURNSTILE_SITE_KEY", "0x4AAAAAAAstaging")
	.replace("REPLACE_WITH_WORKERS_SUBDOMAIN", "saints-club");

describe("npm run terraform's variables", () => {
	it("come from deploy.config.ts and src/club.ts alone", () => {
		expect(terraformVars(installed, club, { adopt: false })).toEqual({
			account_id: "0123456789abcdef0123456789abcdef", zone_id: "fedcba9876543210fedcba9876543210",
			domain: "saints.example", zone: "saints.example", worker: "courtside",
			d1: { live: "courtside", staging: "courtside-staging" },
			buckets: { live: "courtside-originals", staging: "courtside-staging" },
			staging_host: "staging-courtside.saints-club.workers.dev", dmarc_reports: "", adopt: false,
		});
	});

	it("carry the existing ids when adopting an install cf made", () => {
		expect(terraformVars(installed, club, { adopt: true })).toMatchObject({
			adopt: true,
			ids: { d1: { live: "00000000-0000-4000-8000-000000000001", staging: "00000000-0000-4000-8000-000000000002" }, turnstile: { live: "0x4AAAAAAAlive", staging: "0x4AAAAAAAstaging" } },
		});
	});

	it("take the DMARC Management address once deploy.config.ts has it", () => {
		const withDmarc = installed.replace("REPLACE_WITH_DMARC_REPORTS_ADDRESS", "0a1b2c3d4e5f");
		expect(terraformVars(withDmarc, club, { adopt: false }).dmarc_reports).toBe("0a1b2c3d4e5f");
	});

	it("are refused while deploy.config.ts still has the install's placeholders", () => {
		expect(() => terraformVars(readFileSync("deploy.config.ts", "utf8"), club, { adopt: false })).toThrow(/accountId/);
		expect(() => terraformVars(installed.replace("0x4AAAAAAAlive", "REPLACE_WITH_TURNSTILE_SITE_KEY"), club, { adopt: true })).toThrow(/turnstileSiteKey/);
	});
});

describe("npm run terraform's commands", () => {
	it("knows its commands and refuses anything else", () => {
		expect(parseArgs(["plan"])).toEqual({ command: "plan" });
		expect(parseArgs(["destroy"]).error).toMatch(/Usage/);
		expect(parseArgs([]).error).toMatch(/Usage/);
	});

	it("plans into a saved file that apply alone uses, and drift asks only whether anything changed", () => {
		expect(planArgs("plan")).toEqual(["plan", "-input=false", "-out=courtside.tfplan"]);
		expect(planArgs("adopt")).toEqual(["plan", "-input=false", "-out=courtside.tfplan"]);
		expect(planArgs("drift")).toEqual(["plan", "-input=false", "-lock=false", "-detailed-exitcode"]);
	});

	it("applies only a saved plan", () => {
		expect(applyRefusal(false)).toMatch(/npm run terraform -- plan/);
		expect(applyRefusal(true)).toBeUndefined();
	});
});

describe("npm run terraform's place in the install", () => {
	it("changes Cloudflare only for a club whose deploy.config.ts says it uses Terraform; checks and setup need nothing", () => {
		const terraform = installed.replace('cloudflareSetup: "cf"', 'cloudflareSetup: "terraform"');
		for (const command of ["plan", "adopt", "apply", "drift"]) {
			expect(setupRefusal(installed, command)).toMatch(/cloudflareSetup/);
			expect(setupRefusal(terraform, command)).toBeUndefined();
		}
		for (const command of ["check", "setup", "upgrade"]) expect(setupRefusal(installed, command)).toBeUndefined();
	});

	it("knows setup as a command", () => {
		expect(parseArgs(["setup"])).toEqual({ command: "setup" });
	});

	it("wants Terraform 1.10 or later", () => {
		expect(terraformVersionOk("Terraform v1.17.2\non linux_amd64\n")).toBe(true);
		expect(terraformVersionOk("Terraform v1.10.0\n")).toBe(true);
		expect(terraformVersionOk("Terraform v1.9.8\n")).toBe(false);
		expect(terraformVersionOk("")).toBe(false);
	});

	it("installs this computer's cf-terraforming release, by the name in its checksums", () => {
		expect(cfTerraformingAsset("linux", "x64")).toBe(`cf-terraforming_${CF_TERRAFORMING}_linux_amd64.tar.gz`);
		expect(cfTerraformingAsset("darwin", "arm64")).toBe(`cf-terraforming_${CF_TERRAFORMING}_darwin_arm64.tar.gz`);
		expect(cfTerraformingAsset("win32", "x64")).toBeUndefined();
	});

	it("says how to install Terraform from HashiCorp's own packages on each system", () => {
		expect(terraformInstall("fedora").join("\n")).toMatch(/rpm\.releases\.hashicorp\.com\/fedora\/hashicorp\.repo[\s\S]*dnf install -y terraform/);
		expect(terraformInstall("debian").join("\n")).toMatch(/apt\.releases\.hashicorp\.com[\s\S]*apt install -y terraform/);
		expect(terraformInstall("darwin").join("\n")).toMatch(/brew install hashicorp\/tap\/terraform/);
		expect(terraformInstall("other")).toEqual([]);
	});
});

describe("what npm run terraform -- apply writes back", () => {
	const outputs = {
		d1_ids: { live: "11111111-1111-4111-8111-111111111111", staging: "22222222-2222-4222-8222-222222222222" },
		turnstile_site_keys: { live: "0x4AAAAAAAnewlive", staging: "0x4AAAAAAAnewstaging" },
	};

	it("puts the databases' ids and the site keys into deploy.config.ts, live and staging each in its own place", () => {
		const text = withOutputs(installed, outputs);
		expect(text).toContain('d1Id: "11111111-1111-4111-8111-111111111111"');
		expect(text).toContain('turnstileSiteKey: "0x4AAAAAAAnewlive"');
		expect(/staging:\s*\{[^}]*\}/.exec(text)?.[0]).toMatch(/d1Id: "22222222-2222-4222-8222-222222222222"[\s\S]*turnstileSiteKey: "0x4AAAAAAAnewstaging"/);
		expect(text.replace(/"[^"]*"/g, '""')).toBe(installed.replace(/"[^"]*"/g, '""'));
	});

	it("refuses an output that isn't an id or a site key, rather than writing it into the config", () => {
		expect(() => withOutputs(installed, { ...outputs, d1_ids: { live: 'x", evil: "y', staging: outputs.d1_ids.staging } })).toThrow(/d1_ids/);
		expect(() => withOutputs(installed, { ...outputs, turnstile_site_keys: { live: "", staging: "0x4AAAAAAAs" } })).toThrow(/turnstile_site_keys/);
	});

	it("installs cf-terraforming only when it matches the checksum pinned here, for every release file setup can pick", () => {
		for (const [platform, arch] of [["linux", "x64"], ["linux", "arm64"], ["darwin", "x64"], ["darwin", "arm64"]]) {
			expect(CF_TERRAFORMING_SHA256[cfTerraformingAsset(platform, arch)], `${platform} ${arch}`).toMatch(/^[0-9a-f]{64}$/);
		}
	});
});
