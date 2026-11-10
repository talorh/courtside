// The nightly backup's file (backup-db.ts) as statements: in the order a restore must run them, and split back apart
// for one (scripts/restore-d1.mjs), since `cf` has no import and D1 takes a large file only in chunks, each chunk its
// own transaction.

/**
 * Each table after the tables its foreign keys point at (the REFERENCES in its CREATE TABLE), so every row goes in
 * after the rows it points to. Creation order isn't enough: a table a migration rebuilt (members, 0003) comes after
 * the ones that point at it.
 */
export function parentsFirst<T extends { name: string; sql: string }>(tables: T[]): T[] {
	const byName = new Map(tables.map((t) => [t.name, t]));
	const ordered: T[] = [];
	const visit = (t: T, path: string[]) => {
		if (ordered.includes(t)) return;
		if (path.includes(t.name)) throw new Error(`Foreign key cycle: ${[...path, t.name].join(" → ")}`);
		for (const [, name] of t.sql.matchAll(/\bREFERENCES\s+"?(\w+)"?/gi)) {
			const parent = byName.get(name!);
			if (parent && parent !== t) visit(parent, [...path, t.name]);
		}
		ordered.push(t);
	};
	for (const t of tables) visit(t, []);
	return ordered;
}

/** Statements per request when restoring: well inside one D1 request's limits. */
export const RESTORE_CHUNK = 40;

const tableOf = (s: string) => /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?([^"\s(]+)"?/i.exec(s)?.[1];
const rowsOf = (s: string) => /^INSERT INTO "((?:[^"]|"")+)"/.exec(s)?.[1]?.replaceAll('""', '"');

/**
 * A backup file as the requests that restore it, in order, each its own transaction on D1: every table, then each
 * table's rows (parents first, so older files, which listed members after games, restore too) in
 * chunks, then the indexes. `rows`: how many each table should end up with.
 */
export function restorePlan(sql: string): { requests: string[]; rows: Record<string, number> } {
	const statements = sqlStatements(sql);
	const tables = parentsFirst(statements.flatMap((s) => { const name = tableOf(s); return name ? [{ name, sql: s }] : []; }));
	if (!tables.length) throw new Error("That file has no tables in it: is it a backup?");
	const requests = [tables.map((t) => t.sql).join("\n")];
	const rows: Record<string, number> = {};
	for (const t of tables) {
		const inserts = statements.filter((s) => rowsOf(s) === t.name);
		rows[t.name] = inserts.length;
		for (let i = 0; i < inserts.length; i += RESTORE_CHUNK) requests.push(inserts.slice(i, i + RESTORE_CHUNK).join("\n"));
	}
	const rest = statements.filter((s) => !tableOf(s) && !rowsOf(s) && !/^PRAGMA\b/i.test(s));
	if (rest.length) requests.push(rest.join("\n"));
	return { requests, rows };
}

/** The statements in a SQL file: each ends at a semicolon outside a string, a quoted name or a comment. */
export function sqlStatements(sql: string): string[] {
	const out: string[] = [];
	let start = 0;
	for (let i = 0; i < sql.length; i++) {
		const c = sql[i];
		if (c === "'" || c === '"') {
			const close = sql.indexOf(c, i + 1); // a doubled quote inside is two strings back to back: the same either way
			i = close < 0 ? sql.length : close;
		} else if (c === "-" && sql[i + 1] === "-") {
			const end = sql.indexOf("\n", i);
			i = end < 0 ? sql.length : end;
		} else if (c === "/" && sql[i + 1] === "*") {
			const end = sql.indexOf("*/", i + 2);
			i = end < 0 ? sql.length : end + 1;
		} else if (c === ";") {
			const statement = sql.slice(start, i + 1).trim();
			if (statement !== ";") out.push(statement);
			start = i + 1;
		}
	}
	const rest = sql.slice(start).trim();
	if (rest) out.push(rest);
	return out;
}
