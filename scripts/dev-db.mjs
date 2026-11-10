// npm run dev:db   The local dev server's database (cf dev keeps it in .cloudflare/state, which git ignores): every
// migration applied to it. The database is known to cf by the id in deploy.config.ts, so the same command works before
// and after the install fills the id in. Run once, and after a new migration; `rm -rf .cloudflare/state` starts over.
import { execFileSync } from "node:child_process";
import { deployConfig } from "./deploy-config.mjs";

export const LOCAL_STATE = ".cloudflare/state";

if (process.argv[1]?.endsWith("dev-db.mjs")) {
	execFileSync("npx", ["cf", "d1", "migrations", "apply", deployConfig().d1Id, "--local", "--persist-to", LOCAL_STATE, "--dir", "migrations"], { stdio: "inherit" });
	console.log("dev:db: the local database has every migration. Example data: npm run dev:seed");
}
