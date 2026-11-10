import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

type Params = SQLInputValue[];

class Statement {
	constructor(private readonly db: DatabaseSync, private readonly sql: string, private readonly params: Params = []) {}
	bind(...params: Params) { return new Statement(this.db, this.sql, params); }
	async first<T>(column?: string): Promise<T | null> {
		const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
		if (!row) return null;
		return (column ? row[column] : row) as T;
	}
	async all<T>() {
		return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true, meta: {} };
	}
	/** Like D1, rows come back from run() and batch() too (a SELECT, or a write with RETURNING). */
	async run() {
		if (/^\s*SELECT\b|\bRETURNING\b/i.test(this.sql)) {
			const results = this.db.prepare(this.sql).all(...this.params);
			const meta = this.db.prepare("SELECT changes() AS changes, last_insert_rowid() AS id").get() as { changes: number; id: number };
			return { results, success: true, meta: { changes: Number(meta.changes), last_row_id: Number(meta.id) } };
		}
		const r = this.db.prepare(this.sql).run(...this.params);
		return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
	}
}

class SqliteD1 {
	constructor(private readonly db: DatabaseSync) {}
	prepare(sql: string) { return new Statement(this.db, sql); }
	async batch(statements: Statement[]) {
		this.db.exec("BEGIN");
		try {
			const out = [];
			for (const s of statements) out.push(await s.run());
			this.db.exec("COMMIT");
			return out;
		} catch (err) {
			this.db.exec("ROLLBACK");
			throw err;
		}
	}
}

/** The example club's first team as the tests find it: Saints B12.1, Sam its team manager and the site's first admin,
 * and a squad of ten named after NBA players (never real children). */
export const SEED = `
INSERT INTO teams (id, name, code, season_start, ask_name, created_at) VALUES ('b12.1-2026', 'Saints U12 Boys 12.1', 'b12.1', 2026, 'Sam', '2026-11-10T00:00:00.000Z');
INSERT INTO members (id, team_id, email, name, role, created_at) VALUES (1, 'b12.1-2026', 'sam@saints.example', 'Sam Rivers', 'manager', '2026-10-01T00:00:00.000Z');
INSERT INTO admins (email, added_by, added_at) VALUES ('sam@saints.example', 'seed', '2026-10-01T00:00:00.000Z');
INSERT INTO players (team_id, number, name) VALUES ('b12.1-2026', 3, 'Chris'), ('b12.1-2026', 6, 'LeBron'), ('b12.1-2026', 11, 'Kyrie'), ('b12.1-2026', 13, 'Paolo'), ('b12.1-2026', 23, 'Jordan'),
	('b12.1-2026', 30, 'Steph'), ('b12.1-2026', 34, 'Giannis'), ('b12.1-2026', 35, 'Kevin'), ('b12.1-2026', 41, 'Dirk'), ('b12.1-2026', 99, 'Jae');
`;

/** Fresh in-memory database with every migration applied, then the example team seeded (SEED). */
export function createTestDb(): D1Database {
	const db = new DatabaseSync(":memory:");
	db.exec("PRAGMA foreign_keys = ON");
	// D1 applies each migration file in a transaction; do the same so deferred foreign keys behave alike.
	for (const file of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
		db.exec("BEGIN");
		db.exec(readFileSync(`migrations/${file}`, "utf8"));
		db.exec("COMMIT");
	}
	db.exec(SEED);
	return new SqliteD1(db) as unknown as D1Database;
}
