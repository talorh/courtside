// npm run terraform -- setup: this computer made ready for Terraform (docs/runbooks/terraform.md §2). Terraform comes
// from HashiCorp's own packages and needs sudo, so it's only named here, for the owner to run or say yes to.
// cf-terraforming isn't packaged by the systems: its release for this computer is downloaded, checked against the
// SHA-256 pinned in terraform-steps.mjs, and put in ~/.local/bin. Nothing is piped into a shell.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { CF_TERRAFORMING, CF_TERRAFORMING_SHA256, cfTerraformingAsset, terraformInstall, terraformVersionOk } from "./terraform-steps.mjs";

const RELEASES = `https://github.com/cloudflare/cf-terraforming/releases/download/v${CF_TERRAFORMING}`;
const output = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" }).stdout ?? "";

/** Which of HashiCorp's install pages fits this computer. */
function system() {
	if (process.platform === "darwin") return "darwin";
	const release = existsSync("/etc/os-release") ? readFileSync("/etc/os-release", "utf8") : "";
	const ids = /^ID(?:_LIKE)?=(.*)$/gm;
	const names = [...release.matchAll(ids)].flatMap((m) => m[1].replaceAll('"', "").split(" "));
	return names.includes("fedora") ? "fedora" : names.some((n) => n === "debian" || n === "ubuntu") ? "debian" : "other";
}

/** Downloads cf-terraforming's release for this computer, checks it, and installs it; the problem, if any. */
async function installCfTerraforming() {
	const asset = cfTerraformingAsset(process.platform, process.arch);
	if (!asset) return `cf-terraforming has no release for ${process.platform} ${process.arch}: install it as its README says.`;
	const res = await fetch(`${RELEASES}/${asset}`);
	if (!res.ok) throw new Error(`${asset}: ${res.status}`);
	const archive = Buffer.from(await res.arrayBuffer());
	if (createHash("sha256").update(archive).digest("hex") !== CF_TERRAFORMING_SHA256[asset]) return `${asset} doesn't match its pinned SHA-256: nothing installed.`;
	const dir = mkdtempSync(join(tmpdir(), "cf-terraforming-"));
	try {
		writeFileSync(join(dir, asset), archive);
		execFileSync("tar", ["-xzf", join(dir, asset), "-C", dir, "cf-terraforming"]);
		// The archive's own file, never a link it might carry in its place.
		if (!lstatSync(join(dir, "cf-terraforming")).isFile()) return `${asset} holds no plain cf-terraforming file: nothing installed.`;
		const bin = join(homedir(), ".local", "bin");
		mkdirSync(bin, { recursive: true });
		copyFileSync(join(dir, "cf-terraforming"), join(bin, "cf-terraforming"));
		execFileSync("chmod", ["755", join(bin, "cf-terraforming")]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	return undefined;
}

/** Terraform checked and cf-terraforming installed; true when the computer is ready. */
export async function setUp(say) {
	let ready = true;
	if (terraformVersionOk(output("terraform", ["version"]))) say(`Terraform: ${output("terraform", ["version"]).split("\n")[0]}`);
	else {
		ready = false;
		const steps = terraformInstall(system());
		say(steps.length
			? `Terraform 1.10 or later isn't installed. HashiCorp's own packages, with the owner's yes (they need sudo):\n  ${steps.join("\n  ")}\nOn Fedora, if HashiCorp has no packages for this release yet, put the previous release's number for $releasever in /etc/yum.repos.d/hashicorp.repo. Then npm run terraform -- setup again.`
			: "Terraform 1.10 or later isn't installed: install it from developer.hashicorp.com/terraform/install, then npm run terraform -- setup again.");
	}
	const installed = ["cf-terraforming", join(homedir(), ".local", "bin", "cf-terraforming")].some((c) => output(c, ["version"]).includes(`v${CF_TERRAFORMING}`));
	if (installed) say(`cf-terraforming: v${CF_TERRAFORMING}`);
	else {
		const problem = await installCfTerraforming().catch((err) => `cf-terraforming couldn't be downloaded (${err.message}).`);
		if (problem) {
			ready = false;
			say(problem);
		} else say(`cf-terraforming v${CF_TERRAFORMING} installed in ~/.local/bin, checked against its pinned SHA-256`);
	}
	if (!(process.env.PATH ?? "").split(":").includes(join(homedir(), ".local", "bin"))) say("~/.local/bin isn't on PATH: add it in your shell's profile.");
	return ready;
}
