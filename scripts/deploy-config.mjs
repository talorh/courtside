// What the scripts need to know about where the site runs, read from deploy.config.ts and src/club.ts as text (the
// scripts are plain Node and don't load TypeScript). Tested in tests/scripts/release-checks.test.ts.
import { readFileSync } from "node:fs";

const field = (text, name) => new RegExp(`\\b${name}:\\s*"([^"]*)"`).exec(text)?.[1];

/** The deploy settings: the account, zone, Worker name, the live database and bucket, and staging's. */
export function readDeploy(text) {
	const staging = /staging:\s*\{([^}]*)\}/.exec(text)?.[1] ?? "";
	const out = {
		accountId: field(text, "accountId"), zoneId: field(text, "zoneId"), worker: field(text, "worker"),
		d1Id: field(text, "d1Id"), d1Name: field(text, "d1Name"), bucket: field(text, "bucket"),
		staging: { d1Id: field(staging, "d1Id"), d1Name: field(staging, "d1Name"), bucket: field(staging, "bucket") },
	};
	for (const [k, v] of Object.entries(out)) if (k !== "staging" && !v) throw new Error(`couldn't read ${k} from deploy.config.ts`);
	if (!out.staging.d1Id || !out.staging.bucket) throw new Error("couldn't read staging's database and bucket from deploy.config.ts");
	return out;
}

/** The club's domain, from src/club.ts. */
export function readDomain(text) {
	const domain = field(text, "domain");
	if (!domain) throw new Error("couldn't read the domain from src/club.ts");
	return domain;
}

/** `--profile <name>` when CF_PROFILE names the cf login to use (a computer with several accounts), else nothing. */
export const profileArgs = () => (process.env.CF_PROFILE ? ["--profile", process.env.CF_PROFILE] : []);

/** The cf login's OAuth token on this computer, for the few API calls cf has no command for. */
export function cfToken(home) {
	const name = process.env.CF_PROFILE ?? "default";
	return JSON.parse(readFileSync(`${home}/.config/cloudflare/config/${name}.json`, "utf8")).oauth_token;
}

export const deployConfig = () => readDeploy(readFileSync("deploy.config.ts", "utf8"));
export const clubDomain = () => readDomain(readFileSync("src/club.ts", "utf8"));
