// npm run admin -- add <email> [--staging]   The site's first admin (and any later one, when the admin area isn't to
// hand): a row in the admins table of the live database (or staging's), through cf's D1 query. Someone removed before
// comes back. The site reads the table on their next request, so there's nothing to deploy.
import { execFileSync } from "node:child_process";
import { deployConfig, profileArgs } from "./deploy-config.mjs";

const [command, email, ...rest] = process.argv.slice(2);
const fail = (text) => {
	console.error(`admin: STOPPED. ${text}`);
	process.exit(1);
};
if (command !== "add" || !email) fail("Usage: npm run admin -- add <email> [--staging]");
const address = email.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.includes("'")) fail(`"${email}" isn't an email address.`);
const deploy = deployConfig();
const staging = rest.includes("--staging");
const d1Id = staging ? deploy.staging.d1Id : deploy.d1Id;
if (d1Id.startsWith("REPLACE_WITH") || d1Id.startsWith("00000000-")) fail("deploy.config.ts still has its placeholders: INSTALL.md fills them in first.");
const now = new Date().toISOString();
const sql = `INSERT INTO admins (email, added_by, added_at) VALUES ('${address}', 'npm run admin', '${now}') ON CONFLICT (email) DO UPDATE SET added_by = excluded.added_by, added_at = excluded.added_at, removed_at = NULL`;
execFileSync("npx", ["cf", "d1", "query", d1Id, "--sql", sql, ...profileArgs()], { stdio: "inherit", env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: deploy.accountId } });
console.log(`admin: ${address} is a site admin on ${staging ? "staging" : "the live site"}. They sign in with a code sent to that address.`);
