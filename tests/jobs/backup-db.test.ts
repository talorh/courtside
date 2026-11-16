import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { backupDatabase, dumpDatabase } from "../../src/jobs/backup-db.ts";
import { parentsFirst, RESTORE_CHUNK, RESTORE_CHUNK_BYTES, restorePlan, sqlStatements } from "../../src/jobs/backup-sql.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { seedGame, seedVideo } from "../helpers/seed.ts";

const TABLES = ["teams", "members", "games", "videos"];

describe("the backup file's statements", () => {
	it("splits at each semicolon outside quotes and comments, as SQLite reads them", () => {
		const sql = `PRAGMA defer_foreign_keys = true;
CREATE TABLE "a" (
  id INTEGER PRIMARY KEY, -- Sam's note; with a semicolon
  at TEXT DEFAULT (strftime('%Y', 'now')) /* it's; fine */
);
INSERT INTO "a" ("id", "at") VALUES (1, 'semi; colon
and a new line, O''Brien''s');
INSERT INTO "a" ("id", "at") VALUES (2, NULL);
`;
		const out = sqlStatements(sql);
		expect(out).toHaveLength(4);
		expect(out[1]).toMatch(/^CREATE TABLE "a" \([\s\S]*\n\);$/);
		expect(out[2]).toBe(`INSERT INTO "a" ("id", "at") VALUES (1, 'semi; colon\nand a new line, O''Brien''s');`);
		const db = new DatabaseSync(":memory:");
		for (const s of out) db.exec(s);
		expect(db.prepare("SELECT at FROM a WHERE id = 1").get()).toEqual({ at: "semi; colon\nand a new line, O'Brien's" });
	});

	it("puts each table after the tables its foreign keys point at", () => {
		const tables = [
			{ name: "games", sql: "CREATE TABLE games (id INTEGER, team_id TEXT REFERENCES teams(id), created_by INTEGER REFERENCES members(id))" },
			{ name: "members", sql: 'CREATE TABLE members (id INTEGER, team_id TEXT REFERENCES "teams"(id), boss INTEGER REFERENCES members(id))' },
			{ name: "teams", sql: "CREATE TABLE teams (id TEXT)" },
		];
		expect(parentsFirst(tables).map((t) => t.name)).toEqual(["teams", "members", "games"]);
	});

	it("plans a restore in chunks (scripts/restore-d1.mjs) that works for a file listing a table's rows before the rows they point at", async () => {
		const deps = createTestDeps();
		for (let i = 0; i < RESTORE_CHUNK + 5; i++) await seedGame(deps, { opponent: `Team ${i}` });
		const { sql, tables } = await dumpDatabase(deps.db);
		const lines = sql.split("\n");
		const members = lines.filter((l) => l.startsWith('INSERT INTO "members" ('));
		const old = [...lines.filter((l) => !members.includes(l)), ...members].join("\n");
		const plan = restorePlan(old);
		expect(plan.rows).toEqual(tables);
		// Each request is its own transaction on D1, with foreign keys on.
		const restored = new DatabaseSync(":memory:");
		restored.exec("PRAGMA foreign_keys = ON");
		for (const request of plan.requests) {
			restored.exec("BEGIN");
			restored.exec(request);
			restored.exec("COMMIT");
		}
		expect(restored.prepare("SELECT count(*) AS n FROM games").get()).toEqual({ n: RESTORE_CHUNK + 5 });
		expect(restored.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
		expect(plan.requests.slice(1, -1).every((r) => sqlStatements(r).length <= RESTORE_CHUNK)).toBe(true);
		expect(() => restorePlan("SELECT 1;")).toThrow("no tables");
	});

	it("keeps each chunk of rows under a size too, so long values never make a request too big for one command", () => {
		const long = "x".repeat(5000);
		const rows = Array.from({ length: RESTORE_CHUNK }, (_, i) => `INSERT INTO "notes" ("id", "body") VALUES (${i}, '${long}');`);
		const huge = `INSERT INTO "notes" ("id", "body") VALUES (99, '${"y".repeat(RESTORE_CHUNK_BYTES)}');`;
		const plan = restorePlan(['CREATE TABLE "notes" (id INTEGER, body TEXT);', ...rows, huge].join("\n"));
		const chunks = plan.requests.slice(1);
		expect(plan.rows).toEqual({ notes: RESTORE_CHUNK + 1 });
		expect(chunks.flatMap(sqlStatements)).toEqual([...rows, huge]);
		expect(chunks.slice(0, -1).every((r) => new TextEncoder().encode(r).byteLength <= RESTORE_CHUNK_BYTES)).toBe(true);
		// A row bigger than the cap on its own goes in a request by itself.
		expect(chunks.at(-1)).toBe(huge);
	});
});

describe("database backup", () => {
	it("restores statement by statement too, with foreign keys on and no transaction around it (a restore in chunks runs that way on D1)", async () => {
		const deps = createTestDeps();
		// The game's created_by points at Sam in members, a table migration 0003 rebuilt after games.
		const gameId = await seedGame(deps);
		await seedVideo(deps, { gameId, streamUid: "u1" });
		const { sql, tables } = await dumpDatabase(deps.db);
		const restored = new DatabaseSync(":memory:");
		restored.exec("PRAGMA foreign_keys = ON");
		for (const statement of sqlStatements(sql)) restored.exec(statement);
		expect(restored.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
		for (const t of TABLES) expect(restored.prepare(`SELECT count(*) AS n FROM ${t}`).get(), t).toEqual({ n: tables[t] });
	});

	it("dumps schema and rows that restore into an empty database", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { venue: "O'Brien's Stadium" });
		await seedVideo(deps, { gameId, streamUid: "u1" });
		const { sql, rows } = await dumpDatabase(deps.db);
		expect(rows).toBeGreaterThan(2);
		const restored = new DatabaseSync(":memory:");
		restored.exec("PRAGMA foreign_keys = ON");
		// D1 runs an imported file as one transaction, which is what lets the deferred foreign keys work.
		restored.exec(`BEGIN;\n${sql}COMMIT;`);
		for (const t of TABLES) {
			const original = await deps.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
			expect(restored.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all(), t).toEqual(original.results);
		}
		expect(restored.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
		expect(restored.prepare("SELECT venue FROM games").get()).toEqual({ venue: "O'Brien's Stadium" });
	});

	it("writes one file per local day under the backups prefix, with its row counts and checksum", async () => {
		// 3am on the 17th in the club's time zone is still the 16th in UTC: the file is named for the club's day.
		const deps = createTestDeps(new Date("2026-10-16T16:00:00Z"));
		expect(await backupDatabase(deps)).toBe("backups/d1/courtside-2026-10-17.sql");
		const saved = deps.originals.puts.get("backups/d1/courtside-2026-10-17.sql")!;
		expect(saved.contentType).toBe("application/sql");
		expect(JSON.parse(saved.custom.tables!)).toMatchObject({ teams: 1, members: 1 });
		expect(saved.custom.sha256).toMatch(/^[0-9a-f]{64}$/);
	});

	it("fails the run if R2 didn't store exactly what was sent", async () => {
		const deps = createTestDeps(new Date("2026-10-16T16:00:00Z"));
		deps.originals.corruptNextPut = true;
		await expect(backupDatabase(deps)).rejects.toThrow("sha256");
	});

	it("keeps the file but fails the run when a key table emptied since the last backup", async () => {
		const deps = createTestDeps(new Date("2026-10-16T16:00:00Z"));
		await seedGame(deps);
		await backupDatabase(deps);
		await deps.db.prepare("DELETE FROM games").run();
		const tomorrow = { ...deps, now: () => new Date("2026-10-17T16:00:00Z") };
		await expect(backupDatabase(tomorrow)).rejects.toThrow("games went from 1 rows to none");
		expect(deps.originals.puts.has("backups/d1/courtside-2026-10-18.sql")).toBe(true);
	});

	it("counts the rows by statement, so a value with a line that looks like a row of its own is still one row", async () => {
		const deps = createTestDeps(new Date("2026-10-16T16:00:00Z"));
		const gameId = await seedGame(deps);
		const note = (body: string) => deps.db.prepare("INSERT INTO coach_notes (team_id, game_id, body, created_by) VALUES (?, ?, ?, 1)").bind(deps.team.id, gameId, body).run();
		await note("line one\nline two");
		await note('hello\nINSERT INTO "coach_notes" (x');
		expect(await backupDatabase(deps)).toBe("backups/d1/courtside-2026-10-17.sql");
		expect(JSON.parse(deps.originals.puts.get("backups/d1/courtside-2026-10-17.sql")!.custom.tables!)).toMatchObject({ coach_notes: 2 });
	});
});

/** R2's lock on the backups: a file can be neither overwritten nor deleted in its first 14 days. */
function lockBackups(deps: ReturnType<typeof createTestDeps>) {
	const { originals } = deps;
	const put = originals.put.bind(originals);
	originals.put = async (key, ...rest) => {
		if (originals.puts.has(key)) throw new Error("R2 put failed (409): the object is locked");
		return put(key, ...rest);
	};
	originals.remove = async () => { throw new Error("R2 delete failed (403): the object is locked"); };
	return deps;
}

describe("a second backup on the same day", () => {
	it("counts as done when the day's file is already stored intact, and overwrites nothing", async () => {
		const deps = lockBackups(createTestDeps(new Date("2026-10-16T16:00:00Z")));
		await backupDatabase(deps);
		const first = deps.originals.puts.get("backups/d1/courtside-2026-10-17.sql")!;
		await seedGame(deps, { opponent: "Later" });
		const later = { ...deps, now: () => new Date("2026-10-16T17:00:00Z") };
		expect(await backupDatabase(later)).toBe("backups/d1/courtside-2026-10-17.sql");
		expect(deps.originals.puts.get("backups/d1/courtside-2026-10-17.sql")).toBe(first);
	});

	it("still fails the run when the day's file is saved but something shrank", async () => {
		const deps = lockBackups(createTestDeps(new Date("2026-10-16T16:00:00Z")));
		await seedGame(deps);
		await backupDatabase(deps);
		await deps.db.prepare("DELETE FROM games").run();
		const tomorrow = { ...deps, now: () => new Date("2026-10-17T16:00:00Z") };
		await expect(backupDatabase(tomorrow)).rejects.toThrow("games went from 1 rows to none");
		await expect(backupDatabase(tomorrow)).rejects.toThrow("games went from 1 rows to none");
	});

	it("says a file that wasn't stored intact couldn't be removed, when the lock keeps it", async () => {
		const deps = lockBackups(createTestDeps(new Date("2026-10-16T16:00:00Z")));
		const list = deps.originals.list.bind(deps.originals);
		deps.originals.list = async (prefix) => (await list(prefix)).map((o) => ({ ...o, size: o.size - 1 }));
		const err = await backupDatabase(deps).catch((e: unknown) => String(e));
		expect(err).toContain("courtside-2026-10-17.sql wasn't stored intact, and it couldn't be removed");
		expect(err).toContain("the object is locked");
	});

	it("removes a file that wasn't stored intact when nothing locks it", async () => {
		const deps = createTestDeps(new Date("2026-10-16T16:00:00Z"));
		const list = deps.originals.list.bind(deps.originals);
		deps.originals.list = async (prefix) => (await list(prefix)).map((o) => ({ ...o, size: o.size - 1 }));
		await expect(backupDatabase(deps)).rejects.toThrow("courtside-2026-10-17.sql wasn't stored intact, so it was removed");
		expect(deps.originals.removed).toEqual(["backups/d1/courtside-2026-10-17.sql"]);
	});
});

// The sign-in's tables hold a device's session hashes, code hashes (six digits, so guessable from a copy) and a month of
// addresses and IP addresses for the limits. A backup keeps the tables and none of their rows: a
// restored site starts everyone with a fresh code, and a backup file carries nothing anyone could sign in with.
describe("the sign-in's tables in a backup", () => {
	it("are created but left empty", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO sessions (id, email, created_at, expires_at) VALUES ('h', 'a@x.com', '2026-10-31T00:00:00.000Z', '2026-11-30T00:00:00.000Z')").run();
		await deps.db.prepare("INSERT INTO sign_in_codes (email, code_hash, created_at, expires_at) VALUES ('a@x.com', 'c', '2026-10-31T00:00:00.000Z', '2026-10-31T00:10:00.000Z')").run();
		await deps.db.prepare("INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('code_sent', 'a@x.com', '1.2.3.4', '2026-10-31T00:00:00.000Z')").run();
		await deps.db.prepare("INSERT INTO sign_in_holds (email, until, count_from) VALUES ('a@x.com', '2026-10-31T00:15:00.000Z', '2026-10-31T00:15:00.000Z')").run();
		const { sql, tables } = await dumpDatabase(deps.db);
		expect(sql).toContain("CREATE TABLE sessions");
		expect(sql).not.toMatch(/INSERT INTO "(sessions|sign_in_codes|sign_in_events|sign_in_holds)"/);
		expect(sql).not.toContain("1.2.3.4");
		expect([tables.sessions, tables.sign_in_codes, tables.sign_in_events, tables.sign_in_holds]).toEqual([0, 0, 0, 0]);
	});
});
