// npm run release's last steps (deploy from main): push the release commit to main in the
// site's Cloudflare Artifacts repo (the Worker's name as namespace and repository), where Workers Builds runs `npm ci && npm run
// check` and then `npm run deploy:builds` (scripts/deploy-from-builds.mjs); then follow that build until it stops.
import { execFileSync } from "node:child_process";
import { buildFor } from "./release-checks.mjs";


const cfJson = (args) => {
	const out = execFileSync("cf", args, { encoding: "utf8", maxBuffer: 64e6, stdio: ["ignore", "pipe", "pipe"] });
	return JSON.parse(out.slice(out.search(/[[{]/)));
};
const list = (x) => (Array.isArray(x) ? x : (x.result ?? x.builds ?? []));

/**
 * Pushes HEAD to main with a write token that lasts 10 minutes and is revoked straight after. The token reaches git in
 * the environment, never on a command line or in .git/config. Returns false if main already had this commit; throws if
 * the push is refused (main on Cloudflare has a commit this one doesn't: never forced).
 */
export function pushMain(accountId, name) {
	const remote = `https://${accountId}.artifacts.cloudflare.net/git/${name}/${name}.git`;
	const create = () => cfJson(["artifacts", "namespaces", "tokens", "create", name, "--repo", name, "--scope", "write", "--ttl", "600"]);
	// Cloudflare's Artifacts refuses every request now and then for minutes at a time (403 Access denied, with the login
	// fine and the rest of the account answering): keep asking, every 30
	// seconds for up to 10 minutes, before giving up.
	let token;
	for (let tries = 1; ; tries++) {
		try {
			token = create();
			break;
		} catch (err) {
			if (tries >= 20) throw err;
			const why = String(err.stderr ?? err.message).split("\n").find((l) => /\[\d+\]/.test(l))?.replace(/[│┌└]/g, "").trim() ?? "no reason";
			console.warn(`release: Cloudflare refused the push token (${why}): trying again in 30 seconds (${tries} of 20)`);
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
		}
	}
	// No prompting: a refused token fails the push at once instead of waiting for a password.
	const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token.plaintext}` };
	try {
		const said = execFileSync("git", ["push", "--porcelain", remote, "HEAD:refs/heads/main"], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
		return !said.includes("[up to date]");
	} finally {
		try {
			execFileSync("cf", ["artifacts", "namespaces", "tokens", "revoke", token.id, "--namespace", NAMESPACE, "--force"], { stdio: "ignore" });
		} catch (err) {
			console.warn(`release: couldn't revoke push token ${token.id} (it expires in 10 minutes anyway): ${err.message}`);
		}
	}
}

/** The Worker's tag, which Workers Builds files its builds under (`cf builds list --external-script-id`). */
export function workerTag(name) {
	const tag = list(cfJson(["workers", "scripts", "search", "--name", name])).find((s) => s.script_name === name)?.id;
	if (!tag) throw new Error(`no Worker called ${name} in this account`);
	return tag;
}

/** Follows the build of `commit` started since `pushedAt` (ms) until it stops: its last state, or "unfinished" at 20 minutes. */
export async function waitForBuild({ scriptId, commit, pushedAt, say }) {
	const end = Date.now() + 20 * 60_000;
	let now = { state: "waiting" };
	let said = "";
	while (Date.now() < end) {
		try {
			now = buildFor(list(cfJson(["builds", "list", "--external-script-id", scriptId, "--per-page", "10"])), commit, pushedAt);
			const line = now.uuid ? `${now.state} (build ${now.uuid})` : "waiting for Workers Builds to start";
			if (line !== said) say((said = line));
			if (now.state === "deployed" || now.state === "failed") return now;
		} catch (err) {
			// The build goes on whether or not this computer can see it, so a failed look is said and tried again.
			say(`couldn't read the builds just now (${`${err.stderr ?? err.message}`.trim().split("\n")[0]}); looking again`);
		}
		await new Promise((r) => setTimeout(r, 10_000));
	}
	return { ...now, state: "unfinished" };
}
