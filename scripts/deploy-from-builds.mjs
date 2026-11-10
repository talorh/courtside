// Workers Builds' deploy command (`npm run deploy:builds`, or `npm run deploy:builds -- maintenance | join` for the small
// Workers' own triggers), run on Cloudflare after `npm ci && npm run check` passes for a push to main, which only
// `npm run release` makes, once every check has passed (the browser suite included, which Builds can't run). Deploys
// with the newest CHANGELOG.md line as the message and the commit as the tag. Builds supplies the commit, the branch
// and the API token `cf` deploys with; `cf deploy` keeps a Worker's secrets as they are (it sends none: there's no
// secrets file here). The maintenance Worker is deployed as it stands, on or off: with its route when the route is on
// the zone now (read through the API with Builds' token), as `npm run maintenance -- deploy` does from a computer.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { newestChange } from "../src/features/changelog/changelog.ts";
import { listRoutes, maintenanceRoutes } from "./maintenance-steps.mjs";
import { buildsDeployArgs } from "./release-checks.mjs";

const WORKERS = ["site", "maintenance", "join"];
const which = process.argv[2] ?? "site";
if (!WORKERS.includes(which)) {
	console.error(`deploy: STOPPED. Say which Worker: ${WORKERS.slice(1).join(" or ")} (none for the site).`);
	process.exit(1);
}
const args = buildsDeployArgs({
	newest: newestChange(readFileSync("CHANGELOG.md", "utf8")),
	commit: process.env.WORKERS_CI_COMMIT_SHA ?? "",
	branch: process.env.WORKERS_CI_BRANCH ?? "",
});
const cwd = which === "site" ? "." : which;
// A small Worker is its own cf project, using the repo's packages (its node_modules is a link, git-ignored).
if (which !== "site" && !existsSync(`${which}/node_modules`)) symlinkSync("../node_modules", `${which}/node_modules`);
const env = { ...process.env };
if (which === "maintenance") {
	const token = process.env.CLOUDFLARE_API_TOKEN;
	if (!token) {
		console.error("deploy: STOPPED. CLOUDFLARE_API_TOKEN isn't set, so whether maintenance is on can't be read: nothing deployed.");
		process.exit(1);
	}
	const on = maintenanceRoutes(await listRoutes({ token, fetch })).length > 0;
	env.MAINTENANCE = on ? "on" : "";
	console.log(`deploy: maintenance is ${on ? "ON: deploying it with its route" : "off: deploying it with no route"}`);
}
console.log(`deploy: cf deploy --message "${args[2]}" --tag ${args[4]}${which === "site" ? "" : ` (in ${which}/)`}`);
process.exit(spawnSync("npx", ["cf", ...args], { cwd, stdio: "inherit", env }).status ?? 1);
