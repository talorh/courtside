import { describe, expect, it } from "vitest";
import type { Role } from "../../../src/auth/permissions.ts";
import { findActiveMemberByEmail, listActiveMembers, type Member } from "../../../src/features/members/members-repository.ts";
import { addMembers, memberActivity, removeMember, updateMember } from "../../../src/features/members/members-service.ts";
import { createTestDb } from "../../helpers/d1-sqlite.ts";

const TEAM = "b12.1-2026";
/** n families to add, `${prefix}0@x.com` on. */
const people = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ email: `${prefix}${i}@x.com`, name: "", role: "watcher" as const }));

describe("members service", () => {
	it("adds people a row at a time, each with their own name and role, skipping blank rows and repeats", async () => {
		const db = createTestDb();
		const rows = [
			{ email: " Sam@X.com ", name: " Sam ", role: "filmer" }, { email: "", name: "", role: "watcher" },
			{ email: "pat@x.com", name: "Pat", role: "coach" }, { email: "SAM@x.com", name: "Again", role: "watcher" },
		] as const;
		expect(await addMembers(db, TEAM, [...rows])).toHaveLength(2);
		expect(await findActiveMemberByEmail(db, TEAM, "sam@x.com")).toMatchObject({ name: "Sam", role: "filmer" });
		expect(await findActiveMemberByEmail(db, TEAM, "pat@x.com")).toMatchObject({ name: "Pat", role: "coach" });
	});
	it("refuses a row that isn't an email, a name with no email, and nothing to add", async () => {
		const db = createTestDb();
		await expect(addMembers(db, TEAM, [{ email: "not-an-email", name: "", role: "watcher" }])).rejects.toMatchObject({ status: 400, message: '"not-an-email" isn\'t an email address.' });
		await expect(addMembers(db, TEAM, [{ email: "", name: "Sam", role: "watcher" }])).rejects.toMatchObject({ status: 400, message: "Enter an email address for Sam." });
		await expect(addMembers(db, TEAM, [{ email: "", name: "", role: "watcher" }])).rejects.toMatchObject({ status: 400, message: "Enter an email address." });
		await expect(addMembers(db, TEAM, [])).rejects.toMatchObject({ status: 400, message: "Enter an email address." });
		expect((await listActiveMembers(db, TEAM)).length).toBe(1);
	});
	it("adds members with no limit on a team", async () => {
		const db = createTestDb();
		expect(await addMembers(db, TEAM, [{ email: "sam@x.com", name: "Sam", role: "filmer" }])).toHaveLength(1);
		expect((await findActiveMemberByEmail(db, TEAM, "sam@x.com"))?.name).toBe("Sam");
		expect(await addMembers(db, TEAM, people(60, "p"))).toHaveLength(60);
		expect((await listActiveMembers(db, TEAM)).length).toBe(62);
	});
	it("counts a team's own people: not removed ones, not an admin's hidden way in, and someone in two teams once in each", async () => {
		const db = createTestDb();
		await db.prepare("INSERT INTO teams (id, name, code, season_start) VALUES ('g14.5-2026', 'x', 'g14.5', 2026)").run();
		await addMembers(db, TEAM, people(24, "a"));
		await addMembers(db, "g14.5-2026", people(25, "a"));
		await db.prepare("UPDATE members SET removed_at = '2026-10-28T00:00:00.000Z' WHERE team_id = ? AND email = 'a0@x.com'").bind(TEAM).run();
		await db.prepare("INSERT INTO members (team_id, email, role, hidden) VALUES (?, 'admin2@x.com', 'manager', 1)").bind(TEAM).run();
		expect(await addMembers(db, TEAM, [{ email: "last@x.com", name: "", role: "watcher" }])).toHaveLength(1);
		// 23 left of the 24, the hidden admin, and the last one: the other team's 25 are its own.
		expect((await listActiveMembers(db, TEAM)).length).toBe(25);
		expect((await listActiveMembers(db, "g14.5-2026")).length).toBe(25);
	});
	it("adds only new emails and leaves existing members as they are", async () => {
		const db = createTestDb();
		expect(await addMembers(db, TEAM, [{ email: "sam@saints.example", name: "", role: "filmer" }, { email: "new@x.com", name: "", role: "filmer" }])).toHaveLength(1);
		expect((await findActiveMemberByEmail(db, TEAM, "sam@saints.example"))?.role).toBe("manager");
		expect((await findActiveMemberByEmail(db, TEAM, "new@x.com"))?.role).toBe("filmer");
	});
	it("keeps at least one admin and stops self-removal", async () => {
		const db = createTestDb();
		await expect(updateMember(db, TEAM, 1, { name: "Sam", role: "watcher" })).rejects.toMatchObject({ status: 409 });
		await expect(removeMember(db, TEAM, 1, 1, new Date())).rejects.toMatchObject({ status: 409 });
		await expect(removeMember(db, TEAM, 1, 99, new Date())).rejects.toMatchObject({ status: 404 });
	});
	it("sums up who's using the site from Last seen: the last 7 days, 8 to 30 days ago, longer ago, or never", () => {
		const m = (id: number, role: Role, lastSeenAt: string | null): Member => ({ id, teamId: TEAM, email: `${id}@x.com`, name: "", role, lastSeenAt, hideScores: false, hidden: false });
		const activity = memberActivity([
			m(1, "manager", "2026-10-24T00:00:00.000Z"), m(2, "filmer", "2026-10-17T00:00:00.000Z"), // 7 days ago to the minute: still this week
			m(3, "filmer", "2026-10-16T23:59:00.000Z"), m(4, "watcher", "2026-09-24T00:00:00.000Z"), // 30 days ago to the minute
			m(5, "watcher", "2026-09-23T23:59:00.000Z"), m(6, "coach", null),
		], new Date("2026-10-24T00:00:00Z"));
		expect(activity).toEqual({ total: 6, byRole: { watcher: 2, filmer: 2, coach: 1, manager: 1 }, week: 2, month: 2, older: 1, never: 1 });
	});
});
