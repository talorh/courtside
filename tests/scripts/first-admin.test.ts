import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { firstAdminEmails, firstAdminSql } from "../../scripts/first-admin.mjs";
import { createTestDb } from "../helpers/d1-sqlite.ts";

const AT = "2026-11-16T00:00:00.000Z";
const admins = async (db: D1Database) => (await db.prepare("SELECT email, added_by AS addedBy, removed_at AS removedAt FROM admins ORDER BY email").all()).results;

describe("the first admins (deploy.config.ts firstAdmins)", () => {
	it("are the emails in deploy.config.ts, in lower case, each once, and refuse the placeholder or anything that isn't an email", () => {
		expect(firstAdminEmails({ firstAdmins: " Jordan@Saints.example " })).toEqual(["jordan@saints.example"]);
		expect(firstAdminEmails({ firstAdmins: "jordan@saints.example, magic@saints.example,JORDAN@saints.example" })).toEqual(["jordan@saints.example", "magic@saints.example"]);
		for (const bad of [undefined, "", "REPLACE_WITH_YOUR_EMAIL", "jordan", "jordan@saints", "o'neal@saints.example", "a b@saints.example", "jordan@saints.example,", "jordan@saints.example, magic"]) {
			expect(() => firstAdminEmails({ firstAdmins: bad })).toThrow(/deploy\.config\.ts firstAdmins/);
		}
	});

	it("are all made admins on a new install, when the site has no admin at all", async () => {
		const db = createTestDb();
		await db.prepare("DELETE FROM admins").run();
		await db.prepare(firstAdminSql(["jordan@saints.example", "magic@saints.example"], AT, "npm run release")).run();
		expect(await admins(db)).toEqual([
			{ email: "jordan@saints.example", addedBy: "npm run release", removedAt: null },
			{ email: "magic@saints.example", addedBy: "npm run release", removedAt: null },
		]);
		// The next deploy changes nothing, even with another email added to the list.
		await db.prepare(firstAdminSql(["jordan@saints.example", "magic@saints.example", "bird@saints.example"], "2026-11-17T00:00:00.000Z", "npm run release")).run();
		expect(await admins(db)).toHaveLength(2);
	});

	it("never once the site has had an admin: someone else is one, or the first admin was removed", async () => {
		const db = createTestDb(); // sam@saints.example is an admin
		await db.prepare(firstAdminSql(["jordan@saints.example"], AT, "npm run staging")).run();
		expect(await admins(db)).toEqual([{ email: "sam@saints.example", addedBy: "seed", removedAt: null }]);
		await db.prepare("UPDATE admins SET email = 'jordan@saints.example', removed_at = ?").bind(AT).run();
		await db.prepare(firstAdminSql(["jordan@saints.example"], AT, "npm run staging")).run();
		expect(await admins(db)).toEqual([{ email: "jordan@saints.example", addedBy: "seed", removedAt: AT }]);
	});
});
