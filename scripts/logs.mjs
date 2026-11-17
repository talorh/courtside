// npm run logs -- [options]   (docs/runbooks/incident.md): the live site's log lines from Workers Observability, newest
// first, in the club's time zone (src/club.ts). Read only. By default the last hour's warnings and errors; see
// logs-steps.mjs for the rest.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { deployConfig, profileArgs } from "./deploy-config.mjs";
import { describeEvent, logsBody, parseLogsArgs } from "./logs-steps.mjs";

const deploy = deployConfig();
const timeZone = /\btimeZone:\s*"([^"]+)"/.exec(readFileSync("src/club.ts", "utf8"))?.[1] ?? "UTC";
const o = parseLogsArgs(process.argv.slice(2), deploy.worker);
if (o.error) {
	console.error(`logs: ${o.error}`);
	process.exit(1);
}
const ran = spawnSync("npx", ["cf", "o11y", "telemetry", "query", ...profileArgs(), "--body", JSON.stringify(logsBody(o, Date.now()))], {
	encoding: "utf8", env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: deploy.accountId }, maxBuffer: 64 * 1024 * 1024,
});
if (ran.status !== 0) {
	console.error(`logs: the query failed. ${ran.stderr || ran.stdout}`);
	process.exit(1);
}
const events = JSON.parse(ran.stdout).events?.events ?? [];
for (const e of events) console.log(describeEvent(e, timeZone));
console.log(events.length ? `logs: ${events.length} line(s)${events.length === 100 ? " (the newest 100: narrow it with --since or a filter)" : ""}` : "logs: nothing matched");
