import { clubDomain, deployConfig } from "./deploy-config.mjs";

// npm run maintenance's logic, as plain functions (tests/scripts/maintenance.test.ts): its arguments, the cf commands
// each command runs in maintenance/, and the zone's Workers routes, read and deleted through Cloudflare's API (cf has no
// command that lists routes).

/** The zone (deploy.config.ts), the route pattern on the club's domain (src/club.ts), and the Worker's name. */
export const ZONE = deployConfig().zoneId;
export const PATTERN = `${clubDomain()}/*`;
export const WORKER = `${deployConfig().worker}-maintenance`;
const COMMANDS = ["on", "off", "status", "deploy"];

/** `on`, `off`, `status`, `deploy`. The page always says "We'll be back soon", so there's no time to give. */
export function parseArgs(argv) {
	const [command, ...rest] = argv;
	if (!COMMANDS.includes(command)) return { error: "Say on, off, status or deploy." };
	if (rest.includes("--back")) return { error: "The page no longer takes a time: it always says we'll be back soon. Just: npm run maintenance -- on" };
	return { command };
}

/**
 * The cf commands, each a dry run then the real thing, run in maintenance/. `on`: a deploy with the route. `off`: a
 * deploy with no route; a route left behind is deleted after (scripts/maintenance.mjs). `deploy`: a new version, keeping
 * maintenance on or off as it is (`on`: whether its route is on the zone now). `status` runs none.
 */
export function planCommands(command, { on }) {
	const env = (maintenance) => ({ MAINTENANCE: maintenance ? "on" : "" });
	const twice = (args, e) => [{ args: [...args, "--dry-run"], env: e }, { args, env: e }];
	if (command === "on") return twice(["deploy"], env(true));
	if (command === "off") return twice(["deploy"], env(false));
	if (command === "deploy") return twice(["deploy"], env(on));
	return [];
}

/** The maintenance Worker's own route among the zone's: the one that puts the maintenance page in front of the site. */
export const maintenanceRoutes = (routes) => routes.filter((r) => r.pattern === PATTERN && r.script === WORKER);

async function api(path, { token, fetch, method = "GET" }) {
	const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE}/workers/routes${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
	const body = await res.json().catch(() => null);
	if (!res.ok || !body?.success) throw new Error(`Cloudflare's API said ${res.status}: ${body?.errors?.map((e) => e.message).join("; ") || "no reason given"}`);
	return body.result;
}

/** Every Workers route on the zone ({ id, pattern, script }). */
export const listRoutes = (o) => api("", o);

/** Takes one route off the zone: the fallback when applying no triggers leaves the maintenance route in place. */
export const deleteRoute = (id, o) => api(`/${id}`, { ...o, method: "DELETE" });
