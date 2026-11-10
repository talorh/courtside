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
