import type { AppDeps } from "../app/deps.ts";
import type { StoredObject } from "../platform/r2-originals.ts";
import { localDate } from "../shared/time.ts";
import { parentsFirst, rowsOf, sqlStatements } from "./backup-sql.ts";

/** R2 key prefix for nightly backups. The bucket's lifecycle rule deletes them after 14 days (infra/r2-lifecycle.json). */
export const BACKUP_PREFIX = "backups/d1/";

interface SchemaRow {
	type: string;
	name: string;
	sql: string;
}

function literal(v: unknown): string {
	if (v === null || v === undefined) return "NULL";
	if (typeof v === "number" || typeof v === "bigint") return String(v);
	if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
		const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
		return `X'${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}'`;
	}
	return `'${String(v).replaceAll("'", "''")}'`;
}

const quoteId = (name: string) => `"${name.replaceAll('"', '""')}"`;

// The sign-in's tables (auth/) are copied without their rows: a device's session hashes, code hashes (six digits, so
// guessable from a copy) and a month of addresses and IP addresses for the limits. A restored site starts everyone
// with a fresh code, and a backup file carries nothing anyone could sign in with. The holds on
// addresses that asked too often last a day at most, so they're left out too.
const ROWS_LEFT_OUT = new Set(["sessions", "sign_in_codes", "sign_in_events", "sign_in_holds"]);

/**
 * A plain-SQL copy of the whole database (schema, then every row but the sign-in's), restored with `npm run restore-d1`
 * (scripts/restore-d1.mjs). The one deliberate exception to "every query filters by team_id": a backup must hold every
 * team's rows.
 */
export async function dumpDatabase(db: D1Database): Promise<{ sql: string; rows: number; tables: Record<string, number> }> {
	const { results: schema } = await db.prepare(
		`SELECT type, name, sql FROM sqlite_master
		 WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
		 ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid`,
	).all<SchemaRow>();
	// Parents first, so the file also restores in chunks (scripts/restore-d1.mjs), where PRAGMA defer_foreign_keys lasts
	// only to the end of each chunk.
	const tables = parentsFirst(schema.filter((s) => s.type === "table"));
	// Every table exists before any row goes in (foreign keys need their parent table), and indexes come after the rows.
	const out = ["PRAGMA defer_foreign_keys = true;", ...tables.map((s) => `${s.sql};`)];
	let rows = 0;
	const counts: Record<string, number> = {};
	for (const t of tables) {
		const { results } = ROWS_LEFT_OUT.has(t.name) ? { results: [] } : await db.prepare(`SELECT * FROM ${quoteId(t.name)}`).all<Record<string, unknown>>();
		counts[t.name] = results.length;
		for (const r of results) {
			const cols = Object.keys(r);
			out.push(`INSERT INTO ${quoteId(t.name)} (${cols.map(quoteId).join(", ")}) VALUES (${cols.map((c) => literal(r[c])).join(", ")});`);
			rows++;
		}
	}
	out.push(...schema.filter((s) => s.type !== "table").map((s) => `${s.sql};`));
	return { sql: `${out.join("\n")}\n`, rows, tables: counts };
}

// Tables that never empty out in normal use: one going from some rows to none overnight means something's wrong.
const KEY_TABLES = ["teams", "members", "games", "players"];

const sha256Hex = async (text: string) =>
	[...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The dump has one INSERT statement for every row it read, table by table, read as a restore reads it (a value may
 * hold new lines, and lines that look like statements). */
function checkDump(sql: string, tables: Record<string, number>): void {
	const found: Record<string, number> = {};
	for (const s of sqlStatements(sql)) {
		const name = rowsOf(s);
		if (name !== undefined) found[name] = (found[name] ?? 0) + 1;
	}
	for (const [name, count] of Object.entries(tables)) {
		if ((found[name] ?? 0) !== count) throw new Error(`Backup check: ${name} has ${count} rows but ${found[name] ?? 0} in the dump`);
	}
}

/** Stored as it was sent: R2 checked its sha256 on the way in, and its size is the one the run wrote down. */
const intact = (o: StoredObject) => /^[0-9a-f]{64}$/.test(o.custom.sha256 ?? "") && Number(o.custom.bytes) === o.size;

/** Compared with the last backup: a key table emptied, or half the rows gone, is worth a person's look. */
function shrinkage(previous: StoredObject | undefined, tables: Record<string, number>, rows: number): string[] {
	if (!previous?.custom.tables) return [];
	const before = JSON.parse(previous.custom.tables) as Record<string, number>;
	const problems = KEY_TABLES.filter((t) => (before[t] ?? 0) > 0 && !tables[t]).map((t) => `${t} went from ${before[t]} rows to none`);
	const prevRows = Number(previous.custom.rows ?? 0);
	if (prevRows >= 50 && rows * 2 < prevRows) problems.push(`rows fell from ${prevRows} to ${rows}`);
	return problems;
}

/**
 * Daily cron. One file per local date. R2's lock keeps a backup from being overwritten or deleted in its first 14
 * days, so a second run the same day finds the day's file stored intact and counts as done. Checked three ways: the dump
 * holds every row it read, R2 stores exactly those bytes (sha256) and lists them back at the right size, and nothing
 * important shrank since the last backup. A failed check fails the run (the file is kept to look at).
 */
export async function backupDatabase(deps: AppDeps): Promise<string> {
	const key = `${BACKUP_PREFIX}courtside-${localDate(deps.now())}.sql`;
	const listed = await deps.originals.list(BACKUP_PREFIX);
	const previous = listed.filter((o) => o.key < key).at(-1);
	const today = listed.find((o) => o.key === key);
	if (today && intact(today)) {
		console.log(JSON.stringify({ event: "db_backup", key, already: true }));
		if (today.custom.problems) throw new Error(`Backup check: ${key} is saved, but next to ${previous?.key ?? "the last backup"}: ${today.custom.problems}`);
		return key;
	}
	const { sql, rows, tables } = await dumpDatabase(deps.db);
	checkDump(sql, tables);
	const sha256 = await sha256Hex(sql);
	const bytes = new TextEncoder().encode(sql).byteLength;
	const problems = shrinkage(previous, tables, rows);
	const custom = { rows: String(rows), tables: JSON.stringify(tables), sha256, bytes: String(bytes), problems: problems.join("; ") };
	await deps.originals.put(key, sql, "application/sql", { sha256, custom });
	const stored = (await deps.originals.list(key)).find((o) => o.key === key);
	if (!stored || stored.size !== bytes || stored.custom.sha256 !== sha256) {
		if (!stored) throw new Error(`Backup check: ${key} wasn't stored`);
		await deps.originals.remove(key).catch((err: unknown) => {
			throw new Error(`Backup check: ${key} wasn't stored intact, and it couldn't be removed (the bucket's lock keeps a backup 14 days): ${String(err)}`);
		});
		throw new Error(`Backup check: ${key} wasn't stored intact, so it was removed`);
	}
	console.log(JSON.stringify({ event: "db_backup", key, rows, bytes, tables: Object.keys(tables).length, checked: problems.length === 0, problems }));
	if (problems.length) throw new Error(`Backup check: ${key} is saved, but next to ${previous!.key}: ${problems.join("; ")}`);
	return key;
}
