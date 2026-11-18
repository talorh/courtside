// What the scripts need to know about where the site runs, read from deploy.config.ts and src/club.ts as text (the
// scripts are plain Node and don't load TypeScript). Tested in tests/scripts/release-checks.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A quoted field's value in a config file's text. */
export const field = (text, name) => new RegExp(`\\b${name}:\\s*"([^"]*)"`).exec(text)?.[1];

/** The deploy settings: the account, zone, Worker name, the live database and bucket, and staging's (and its address); and the first
 * admins' emails, checked only where it's used (scripts/first-admin.mjs). */
export function readDeploy(text) {
	const staging = /staging:\s*\{([^}]*)\}/.exec(text)?.[1] ?? "";
	const out = {
		accountId: field(text, "accountId"), zoneId: field(text, "zoneId"), worker: field(text, "worker"),
		d1Id: field(text, "d1Id"), d1Name: field(text, "d1Name"), bucket: field(text, "bucket"),
		staging: { d1Id: field(staging, "d1Id"), d1Name: field(staging, "d1Name"), bucket: field(staging, "bucket"), host: field(staging, "host") },
	};
	const firstAdmins = field(text, "firstAdmins");
	for (const [k, v] of Object.entries(out)) if (k !== "staging" && !v) throw new Error(`couldn't read ${k} from deploy.config.ts`);
	if (!out.staging.d1Id || !out.staging.bucket) throw new Error("couldn't read staging's database and bucket from deploy.config.ts");
	return { ...out, firstAdmins };
}

/** The club's domain, from src/club.ts. */
export function readDomain(text) {
	const domain = field(text, "domain");
	if (!domain) throw new Error("couldn't read the domain from src/club.ts");
	return domain;
}

/** `--profile <name>` when CF_PROFILE names the cf login to use (a computer with several accounts), else nothing. */
export const profileArgs = () => (process.env.CF_PROFILE ? ["--profile", process.env.CF_PROFILE] : []);

/** Every cf command this process runs from here on keeps the login in its plaintext file, where cfToken reads it: cf can
 * keep a login in the OS keyring instead (an encrypted file, the plaintext one deleted), which the scripts can't read. */
export function keepLoginInFile(env = process.env) {
	env.CLOUDFLARE_AUTH_USE_KEYRING = "false";
}

/** cf's own folder: XDG_CONFIG_HOME's, else ~/Library/Preferences on a Mac, else ~/.config (as cf works it out). */
export function cfConfigDir(home, env = process.env, platform = process.platform) {
	const base = env.XDG_CONFIG_HOME || (platform === "darwin" ? join(home, "Library", "Preferences") : join(home, ".config"));
	return join(base, "cloudflare");
}

/** The cf login's OAuth token on this computer (CF_PROFILE's, else the default login), for the few API calls cf has no
 * command for. No message quotes the file. */
export function cfToken(home, { env = process.env, platform = process.platform } = {}) {
	const name = env.CF_PROFILE ?? "default";
	const again = `Log in again, kept out of the keyring: CLOUDFLARE_AUTH_USE_KEYRING=false npx cf auth ${name === "default" ? "login --force" : `create ${name}`}`;
	let text;
	try {
		text = readFileSync(join(cfConfigDir(home, env, platform), "config", `${name}.json`), "utf8");
	} catch {
		throw new Error(`cf's ${name} login has no plaintext file (cf may have moved it into the OS keyring, which the scripts can't read). ${again}`);
	}
	let login;
	try {
		login = JSON.parse(text);
	} catch {
		// Not passed on: JSON.parse's message quotes the file, which holds the token.
		throw new Error(`cf's ${name} login file couldn't be read as JSON. ${again}`);
	}
	if (typeof login?.oauth_token !== "string" || !login.oauth_token) throw new Error(`cf's ${name} login has no token. ${again}`);
	return login.oauth_token;
}

export const deployConfig = () => readDeploy(readFileSync("deploy.config.ts", "utf8"));
export const clubDomain = () => readDomain(readFileSync("src/club.ts", "utf8"));
