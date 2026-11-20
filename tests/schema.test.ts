import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1-sqlite.ts";

describe("schema", () => {
	it("seeds the team and Sam as its team manager", async () => {
		const db = createTestDb();
		const row = await db.prepare("SELECT role FROM members WHERE email = ?").bind("SAM@saints.example").first<{ role: string }>();
		expect(row?.role).toBe("manager");
	});

	it("accepts the coach role", async () => {
		const db = createTestDb();
		await db.prepare("INSERT INTO members (team_id, email, role) VALUES ('b12.1-2026', 'coach@x.com', 'coach')").run();
		expect(await db.prepare("SELECT role FROM members WHERE email = 'coach@x.com'").first<string>("role")).toBe("coach");
	});
	it("rejects an unknown role", async () => {
		const db = createTestDb();
		const insert = db.prepare("INSERT INTO members (team_id, email, role) VALUES ('b12.1-2026', 'x@y.z', 'admin')");
		await expect(insert.run()).rejects.toThrow(/CHECK/);
	});

	it("treats emails as case-insensitive per team", async () => {
		const db = createTestDb();
		const insert = db.prepare("INSERT INTO members (team_id, email, role) VALUES ('b12.1-2026', 'Sam@saints.example', 'watcher')");
		await expect(insert.run()).rejects.toThrow(/UNIQUE/);
	});
});

describe("0012 Request access's tries are sign-in events", () => {
	it("keeps every event, its id, address, internet address and device, takes the new kind, and keeps the index", () => {
		const db = new DatabaseSync(":memory:");
		db.exec("PRAGMA foreign_keys = ON");
		const files = readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort();
		// Each file in a transaction, as D1 applies them (so its deferred foreign keys hold).
		const apply = (f: string) => db.exec(`BEGIN; ${readFileSync(`migrations/${f}`, "utf8")}; COMMIT;`);
		for (const f of files.filter((f) => f < "0012")) apply(f);
		db.exec("INSERT INTO sign_in_events (kind, email, ip, at, device) VALUES ('signed_in', 'A@x.com', '1.2.3.4', '2026-11-15T00:00:00.000Z', 'iPhone, Safari')");
		db.exec("INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('mobile_view', 'b@x.com', '', '2026-11-15T01:00:00.000Z')");
		const before = db.prepare("SELECT * FROM sign_in_events ORDER BY id").all();
		expect(() => db.exec("INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('access', 'c@x.com', '5.5.5.5', 'now')")).toThrow(/CHECK/);
		for (const f of files.filter((f) => f >= "0012")) apply(f);
		expect(db.prepare("SELECT * FROM sign_in_events ORDER BY id").all()).toEqual(before);
		db.exec("INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('access', 'c@x.com', '5.5.5.5', 'now')");
		// The code from before still writes every kind it knows.
		for (const kind of ["code_sent", "unknown_email", "limited", "wrong", "signed_in", "robot", "desktop_view", "mobile_view"]) {
			db.exec(`INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('${kind}', 'd@x.com', '', 'now')`);
		}
		expect(() => db.exec("INSERT INTO sign_in_events (kind, email, ip, at) VALUES ('cheering', 'c@x.com', '', 'now')")).toThrow(/CHECK/);
		expect(db.prepare("SELECT device FROM sign_in_events WHERE kind = 'access'").all()).toEqual([{ device: "" }]);
		expect(db.prepare("SELECT COUNT(*) AS n FROM sign_in_events WHERE email = 'a@X.COM'").get()).toEqual({ n: 1 });
		expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'sign_in_events'").all()).toEqual([{ name: "sign_in_events_at" }]);
	});
});

describe("0020 a carried-on recording stays marked once its segments go", () => {
	it("marks the videos with segments waiting or a joined file, and no other", () => {
		const db = new DatabaseSync(":memory:");
		db.exec("PRAGMA foreign_keys = ON");
		const files = readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort();
		const apply = (f: string) => db.exec(`BEGIN; ${readFileSync(`migrations/${f}`, "utf8")}; COMMIT;`);
		for (const f of files.filter((f) => f < "0020")) apply(f);
		db.exec("INSERT INTO teams (id, name, code, season_start) VALUES ('b12.1-2026', 'Saints B12.1', 'b12.1', 2026)");
		const video = (key: string, status: string) => {
			db.exec("INSERT INTO games (team_id, starts_at, competition, opponent) VALUES ('b12.1-2026', '2026-11-13T18:40', 'Practice match', 'TBC')");
			const gameId = (db.prepare("SELECT MAX(id) AS id FROM games").get() as { id: number }).id;
			db.exec(`INSERT INTO videos (team_id, game_id, status, r2_key, original_name, original_bytes, delete_after, created_at) VALUES ('b12.1-2026', ${gameId}, '${status}', '${key}', 'n', 0, 'd', 'made-${key}')`);
			return (db.prepare("SELECT MAX(id) AS id FROM videos").get() as { id: number }).id;
		};
		const waiting = video("live.mp4", "uploading");
		db.exec(`INSERT INTO recording_segments (team_id, video_id, n, r2_key, r2_upload_id, created_at) VALUES ('b12.1-2026', ${waiting}, 2, 'live.2.mp4', 'up', 'now')`);
		video("live.joined.mp4", "processing");
		video("game.mov", "ready");
		for (const f of files.filter((f) => f >= "0020")) apply(f);
		expect(db.prepare("SELECT r2_key, carried_on_at FROM videos ORDER BY id").all()).toEqual([
			{ r2_key: "live.mp4", carried_on_at: "made-live.mp4" },
			{ r2_key: "live.joined.mp4", carried_on_at: "made-live.joined.mp4" },
			{ r2_key: "game.mov", carried_on_at: null },
		]);
	});
});
