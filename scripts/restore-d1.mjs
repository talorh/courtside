// Restores a nightly backup (backups/d1/courtside-YYYY-MM-DD.sql, src/jobs/backup-db.ts) into an empty D1 database.
// `cf` has no import, so it goes in through `cf d1 query`, one request at a time, each its own transaction on D1: the
// tables, then each table's rows, parents first, then the indexes (restorePlan, src/jobs/backup-sql.ts). Then every
// table's row count is checked against the file. A database that already has tables is refused.
// Usage: npm run restore-d1 -- <file.sql> <database-id> [--account <account id>]
// Drill: npm run restore-d1 -- <file.sql> --sqlite <new file.db> (a local SQLite database, the same requests, each in
// its own transaction with foreign keys on, as D1 runs them; `cf d1 query` has no local mode).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { restorePlan } from "../src/jobs/backup-sql.ts";

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const account = option("--account"), sqlite = option("--sqlite");
const [file, db] = args;
if (!file || (!db && !sqlite)) {
	console.error("Usage: npm run restore-d1 -- <file.sql> <database-id> [--account <account id>], or <file.sql> --sqlite <new file.db>");
	process.exit(1);
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// Cloudflare's API sometimes refuses for a moment ("7403 ... not authorized"), so that's asked again.
function cfQuery(sql) {
	for (let attempt = 1; ; attempt++) {
		try {
			const out = execFileSync("cf", ["d1", "query", db, "--sql", sql], {
				env: account ? { ...process.env, CLOUDFLARE_ACCOUNT_ID: account } : process.env,
				encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
			});
			return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
		} catch (err) {
			const said = `${err.stdout ?? ""}${err.stderr ?? ""}`;
			if (attempt >= 5 || !/7403|403 Forbidden/.test(said)) throw new Error(`cf d1 query failed: ${said || err}`);
			console.warn(`refused (attempt ${attempt}), asking again in ${attempt * 3} s`);
			pause(attempt * 3000);
		}
	}
}
const local = sqlite ? new DatabaseSync(sqlite) : null;
local?.exec("PRAGMA foreign_keys = ON");
/** Runs one request as D1 does: in its own transaction. Returns the last statement's rows. */
function run(sql) {
	if (!local) return cfQuery(sql);
	local.exec("BEGIN");
	try {
		const last = sql.trim().split("\n").at(-1);
		local.exec(sql);
		local.exec("COMMIT");
		return /^SELECT/i.test(last) ? local.prepare(last).all() : [];
	} catch (err) {
		local.exec("ROLLBACK");
		throw err;
	}
}

const plan = restorePlan(readFileSync(file, "utf8"));
const there = run("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'");
if (there.length) throw new Error(`The database already has tables (${there.map((r) => r.name).join(", ")}): restore into a new, empty one.`);
plan.requests.forEach((request, i) => {
	run(request);
	if (i % 10 === 9) console.log(`  ${i + 1} of ${plan.requests.length} requests`);
});
const counts = Object.fromEntries(Object.keys(plan.rows).map((t) => [t, run(`SELECT count(*) AS n FROM "${t.replaceAll('"', '""')}"`)[0].n]));
const wrong = Object.keys(plan.rows).filter((t) => counts[t] !== plan.rows[t]);
console.log("restored rows:", counts);
if (wrong.length) throw new Error(`Row counts differ from the file for: ${wrong.join(", ")}`);
console.log(`restored ${file} into ${sqlite ?? db}: ${Object.keys(plan.rows).length} tables, ${plan.requests.length} requests; counts match`);
