// npm run maintenance -- on | off | status | deploy   (docs/runbooks/maintenance.md)
// The maintenance page Worker (maintenance/) and its switch: a route on the club's domain that puts the page in front of the
// site while it's on. Every cf step runs as a dry run first. Switching on or off, and deploying, need the site
// owner's yes (AGENTS.md: Cloudflare changes); status only reads.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { cfToken, profileArgs } from "./deploy-config.mjs";
import { deleteRoute, listRoutes, maintenanceRoutes, parseArgs, planCommands } from "./maintenance-steps.mjs";

const say = (text) => console.log(`maintenance: ${text} (${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`);
const fail = (text) => {
	console.error(`maintenance: STOPPED. ${text}`);
	process.exit(1);
};

const args = parseArgs(process.argv.slice(2));
if (args.error) fail(args.error);

// cf's own login, refreshed first; the token is only ever sent to Cloudflare's API, never printed.
execFileSync("npx", ["cf", "auth", "whoami", ...profileArgs()], { stdio: "ignore" });
const token = cfToken(homedir());
const routeIds = async () => maintenanceRoutes(await listRoutes({ token, fetch })).map((r) => r.id);
const on = (await routeIds()).length > 0;
say(`maintenance is ${on ? "ON: the site shows the maintenance page to everyone but admins" : "off"}`);
if (args.command === "status") process.exit(0);

// maintenance/ is its own cf project, using the repo's packages (its node_modules is a link, git-ignored).
if (!existsSync("maintenance/node_modules")) symlinkSync("../node_modules", "maintenance/node_modules");
if (args.command !== "off") {
	say("the maintenance tests");
	if (spawnSync("npx", ["vitest", "run", "tests/maintenance"], { stdio: "inherit" }).status !== 0) fail("The maintenance tests failed: nothing changed.");
}
for (const step of planCommands(args.command, { on })) {
	say(`cf ${step.args.join(" ")}`);
	const ran = spawnSync("npx", ["cf", ...step.args, ...profileArgs()], { cwd: "maintenance", stdio: "inherit", env: { ...process.env, ...step.env } });
	if (ran.status !== 0) fail(`cf ${step.args.join(" ")} failed.${step.args.includes("--dry-run") ? " Nothing changed." : ""}`);
}

const left = await routeIds();
if (args.command === "off" && left.length) {
	say("the route is still there after deploying without it: deleting it through the API");
	for (const id of left) await deleteRoute(id, { token, fetch });
}
const nowOn = (await routeIds()).length > 0;
const wanted = args.command === "on" || (args.command === "deploy" && on);
if (nowOn !== wanted) fail(`maintenance should be ${wanted ? "on" : "off"} but is ${nowOn ? "on" : "off"}. Look in the dashboard: Workers & Pages, the maintenance Worker, Domains & Routes.`);
say(nowOn ? "ON. Switch off with: npm run maintenance -- off" : "off: the site is back for everyone");
