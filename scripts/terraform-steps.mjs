// npm run terraform's decisions, kept apart from running anything so tests/scripts/terraform.test.ts can check them:
// the variables for infra/terraform, read from deploy.config.ts and src/club.ts as text, and each command's arguments.
import { field, readDeploy, readDomain } from "./deploy-config.mjs";

export const COMMANDS = ["setup", "check", "plan", "adopt", "apply", "drift", "upgrade"];
/** The commands that reach the club's Cloudflare account. */
const CHANGES_CLOUDFLARE = ["plan", "adopt", "apply", "drift"];
/** cf-terraforming's release that setup installs, and the oldest Terraform the config runs on (terraform.tf). */
export const CF_TERRAFORMING = "0.31.0";
/** That release's files' SHA-256, from its checksums.txt, pinned here so a release changed after the fact isn't
 * installed. A new release updates both. */
export const CF_TERRAFORMING_SHA256 = {
	"cf-terraforming_0.31.0_linux_amd64.tar.gz": "ad7cebe739561d975ac9a0ad5da2f46b11e687c827614f64fba73e3ceb02d373",
	"cf-terraforming_0.31.0_linux_arm64.tar.gz": "953246c5623690ec0ec83cc73e3112c3ea5ec91936bc0db3f5f69c811027665d",
	"cf-terraforming_0.31.0_darwin_amd64.tar.gz": "0ab4e6d2ca0ea4d1057f950e8efcd429f846c056c96fdaa9fed5ac6dc043ce84",
	"cf-terraforming_0.31.0_darwin_arm64.tar.gz": "e2f8c0697d8fc77de9e9fe396108a629130cd9048a4394753dc4acc8ca87d64e",
};
const TERRAFORM_AT_LEAST = [1, 10];
export const PLAN_FILE = "courtside.tfplan";
/** The platforms whose provider checksums .terraform.lock.hcl carries: whoever works on the repo, wherever. */
export const PLATFORMS = ["linux_amd64", "linux_arm64", "darwin_amd64", "darwin_arm64", "windows_amd64"];

// A value the install hasn't filled in yet.
const placeholder = (value) => !value || value.includes("REPLACE_WITH_");
const stagingField = (text, name) => field(/staging:\s*\{([^}]*)\}/.exec(text)?.[1] ?? "", name);

/** The command, or the usage line. */
export function parseArgs(argv) {
	const [command, ...rest] = argv;
	if (!COMMANDS.includes(command) || rest.length) return { error: `Usage: npm run terraform -- ${COMMANDS.join(" | ")}` };
	return { command };
}

/** infra/terraform's variables (courtside.auto.tfvars.json); adopt adds the ids of what an install already has. */
export function terraformVars(configText, clubText, { adopt }) {
	const deploy = readDeploy(configText);
	const domain = readDomain(clubText);
	const zone = field(clubText, "zone") ?? domain;
	const need = { accountId: deploy.accountId, zoneId: deploy.zoneId, "staging.host": deploy.staging.host };
	if (adopt) Object.assign(need, {
		d1Id: deploy.d1Id, "staging.d1Id": deploy.staging.d1Id,
		turnstileSiteKey: field(configText, "turnstileSiteKey"), "staging.turnstileSiteKey": stagingField(configText, "turnstileSiteKey"),
	});
	for (const [name, value] of Object.entries(need)) {
		if (placeholder(value)) throw new Error(`deploy.config.ts ${name} isn't filled in yet (INSTALL.md).`);
	}
	const dmarc = field(configText, "dmarcReports");
	const vars = {
		account_id: deploy.accountId, zone_id: deploy.zoneId, domain, zone, worker: deploy.worker,
		d1: { live: deploy.d1Name, staging: deploy.staging.d1Name }, buckets: { live: deploy.bucket, staging: deploy.staging.bucket },
		staging_host: deploy.staging.host, dmarc_reports: placeholder(dmarc) ? "" : dmarc, adopt,
	};
	if (!adopt) return vars;
	return { ...vars, ids: { d1: { live: need.d1Id, staging: need["staging.d1Id"] }, turnstile: { live: need.turnstileSiteKey, staging: need["staging.turnstileSiteKey"] } } };
}

/** plan and adopt save the plan for apply; drift exits 2 when Cloudflare differs from the config, and changes nothing. */
export function planArgs(command) {
	return command === "drift" ? ["plan", "-input=false", "-lock=false", "-detailed-exitcode"] : ["plan", "-input=false", `-out=${PLAN_FILE}`];
}

/** apply runs only the plan that was saved and read, never a fresh one. */
export function applyRefusal(planSaved) {
	return planSaved ? undefined : `No saved plan: run npm run terraform -- plan (or -- adopt), read it, then apply.`;
}

/** A club whose deploy.config.ts keeps cloudflareSetup at "cf" sets Cloudflare up with cf: Terraform mustn't touch it. */
export function setupRefusal(configText, command) {
	if (!CHANGES_CLOUDFLARE.includes(command) || field(configText, "cloudflareSetup") === "terraform") return undefined;
	return `deploy.config.ts cloudflareSetup is "cf", so this club sets Cloudflare up with cf (docs/runbooks/cloudflare-setup.md). To move to Terraform, set it to "terraform" first, then npm run terraform -- adopt (docs/runbooks/terraform.md §5).`;
}

/** Whether \`terraform version\` names 1.10 or later. */
export function terraformVersionOk(versionText) {
	const m = /Terraform v(\d+)\.(\d+)\./.exec(versionText);
	if (!m) return false;
	const [major, minor] = [Number(m[1]), Number(m[2])];
	return major > TERRAFORM_AT_LEAST[0] || (major === TERRAFORM_AT_LEAST[0] && minor >= TERRAFORM_AT_LEAST[1]);
}

/** The release file for this computer (Node's platform and arch), as cf-terraforming's checksums.txt names it. */
export function cfTerraformingAsset(platform, arch) {
	const os = { linux: "linux", darwin: "darwin" }[platform];
	const cpu = { x64: "amd64", arm64: "arm64" }[arch];
	return os && cpu ? `cf-terraforming_${CF_TERRAFORMING}_${os}_${cpu}.tar.gz` : undefined;
}

/** HashiCorp's own packages on each system, as its install page gives them: the commands setup shows, for the owner's
 * yes, as they need sudo. Fedora's must name an older release in the repo file while HashiCorp has none for the newest. */
export function terraformInstall(system) {
	const hashicorp = {
		fedora: ["sudo dnf config-manager addrepo --from-repofile=https://rpm.releases.hashicorp.com/fedora/hashicorp.repo", "sudo dnf install -y terraform"],
		debian: [
			"curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg",
			'echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(. /etc/os-release && echo "$VERSION_CODENAME") main" | sudo tee /etc/apt/sources.list.d/hashicorp.list',
			"sudo apt update && sudo apt install -y terraform",
		],
		darwin: ["brew tap hashicorp/tap", "brew install hashicorp/tap/terraform"],
	};
	return hashicorp[system] ?? [];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SITE_KEY = /^0x[0-9A-Za-z_-]+$/;

/** deploy.config.ts with the ids an apply made: the databases' and the sign-in widgets' site keys, live outside the
 * staging block and staging's inside it. Anything that isn't an id or a site key is refused, not written. */
export function withOutputs(configText, { d1_ids, turnstile_site_keys }) {
	for (const [name, values, shape] of [["d1_ids", d1_ids, UUID], ["turnstile_site_keys", turnstile_site_keys, SITE_KEY]]) {
		if (!shape.test(values?.live ?? "") || !shape.test(values?.staging ?? "")) throw new Error(`Terraform's ${name} output isn't what was expected: nothing written.`);
	}
	const set = (text, name, value) => text.replace(new RegExp(`\\b${name}:\\s*"[^"]*"`), `${name}: "${value}"`);
	const block = /staging:\s*\{[^}]*\}/.exec(configText);
	if (!block) throw new Error("deploy.config.ts has no staging block.");
	const before = configText.slice(0, block.index), after = configText.slice(block.index + block[0].length);
	const staging = set(set(block[0], "d1Id", d1_ids.staging), "turnstileSiteKey", turnstile_site_keys.staging);
	return set(set(before, "d1Id", d1_ids.live), "turnstileSiteKey", turnstile_site_keys.live) + staging + after;
}
