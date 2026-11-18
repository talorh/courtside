import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// infra/terraform reads the same JSON bodies the runbook's cf commands send, so the two ways of applying them can't
// drift apart: a new file in infra/ is either read by Terraform or named here with why it isn't.
const NOT_TERRAFORMS = new Map([["zone/cache-rules", "a subdomain's only, and Terraform leaves a shared zone's rules to cf"]]);

const jsonFiles = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
	const path = join(dir, name);
	if (statSync(path).isDirectory()) return name === "terraform" ? [] : jsonFiles(path);
	return name.endsWith(".json") ? [path.slice("infra/".length, -".json".length)] : [];
});

describe("the Terraform config", () => {
	it("reads every provisioning body in infra/, bar the ones named with their reason", () => {
		const locals = readFileSync("infra/terraform/locals.tf", "utf8");
		const read = [...locals.matchAll(/"([\w/-]+)"/g)].map((m) => m[1]);
		const missing = jsonFiles("infra").filter((f) => !read.includes(f) && !NOT_TERRAFORMS.has(f));
		expect(missing).toEqual([]);
	});

	it("keeps the provider's checksums in the repo, and the state, plans and variables out of it", () => {
		expect(readFileSync("infra/terraform/.terraform.lock.hcl", "utf8")).toContain('provider "registry.terraform.io/cloudflare/cloudflare"');
		const ignored = readFileSync(".gitignore", "utf8");
		for (const pattern of ["infra/terraform/.terraform/", "infra/terraform/*.tfstate", "infra/terraform/*.tfstate.*", "infra/terraform/*.tfplan", "infra/terraform/*.auto.tfvars.json"]) {
			expect(ignored).toContain(pattern);
		}
	});

	it("names no account, zone or record id: every one comes from deploy.config.ts through its variables", () => {
		for (const name of readdirSync("infra/terraform").filter((n) => n.endsWith(".tf"))) {
			expect(readFileSync(`infra/terraform/${name}`, "utf8"), name).not.toMatch(/\b[0-9a-f]{32}\b/);
		}
	});
});
