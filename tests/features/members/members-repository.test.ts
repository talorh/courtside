import { describe, expect, it } from "vitest";
import {
	countActiveManagers, findActiveMemberByEmail, getActiveMember, listActiveMembers, markMemberRemoved, type MemberSort,
	touchLastSeen, updateMemberDetails, upsertMembers,
} from "../../../src/features/members/members-repository.ts";
import { createTestDb } from "../../helpers/d1-sqlite.ts";

const TEAM = "b12.1-2026";

describe("members repository", () => {
	it("finds Sam case-insensitively", async () => {
		const m = await findActiveMemberByEmail(createTestDb(), TEAM, "SAM@SAINTS.EXAMPLE");
		expect(m).toMatchObject({ role: "manager", name: "Sam Rivers", teamId: TEAM });
	});

	it("adds, removes and reactivates members", async () => {
		const db = createTestDb();
		await upsertMembers(db, TEAM, [{ email: "sam@x.com", name: "Sam", role: "filmer" }]);
		const sam = await findActiveMemberByEmail(db, TEAM, "sam@x.com");
		expect(sam?.role).toBe("filmer");
		await markMemberRemoved(db, TEAM, sam!.id, "2026-10-15T00:00:00.000Z");
		expect(await findActiveMemberByEmail(db, TEAM, "sam@x.com")).toBeNull();
		await upsertMembers(db, TEAM, [{ email: "sam@x.com", name: "", role: "watcher" }]);
		expect(await findActiveMemberByEmail(db, TEAM, "sam@x.com")).toMatchObject({ role: "watcher", name: "Sam" });
		await upsertMembers(db, TEAM, [{ email: "sam@x.com", name: "Other", role: "manager" }]);
		expect(await findActiveMemberByEmail(db, TEAM, "sam@x.com")).toMatchObject({ role: "watcher", name: "Sam" });
	});

	it("updates roles, counts admins and lists members", async () => {
		const db = createTestDb();
		await upsertMembers(db, TEAM, [{ email: "coach@x.com", name: "Coach", role: "manager" }]);
		expect(await countActiveManagers(db, TEAM)).toBe(2);
		const coach = await findActiveMemberByEmail(db, TEAM, "coach@x.com");
		await updateMemberDetails(db, TEAM, coach!.id, { name: "Coach", role: "watcher" });
		expect(await countActiveManagers(db, TEAM)).toBe(1);
		expect((await listActiveMembers(db, TEAM)).map((m) => m.email)).toEqual(["sam@saints.example", "coach@x.com"]);
	});

	it("lists by role (team manager, coach, Watch and film, Watch only), then by name within each", async () => {
		const db = createTestDb();
		await upsertMembers(db, TEAM, [
			{ email: "z@x.com", name: "zoe", role: "watcher" }, { email: "none@x.com", name: "", role: "watcher" },
			{ email: "a@x.com", name: "Aaron", role: "watcher" }, { email: "m@x.com", name: "Mia", role: "coach" },
			{ email: "f@x.com", name: "Fred", role: "filmer" }, { email: "b@x.com", name: "Bea", role: "manager" },
			{ email: "c@x.com", name: "Cal", role: "coach" },
		]);
		expect((await listActiveMembers(db, TEAM)).map((m) => m.name || m.email))
			.toEqual(["Bea", "Sam Rivers", "Cal", "Mia", "Fred", "Aaron", "zoe", "none@x.com"]);
	});

	it("lists by name (no name yet last, by email) or by Last seen (most recent first, never last, then by name)", async () => {
		const db = createTestDb();
		await upsertMembers(db, TEAM, [
			{ email: "z@x.com", name: "zoe", role: "watcher" }, { email: "none@x.com", name: "", role: "manager" },
			{ email: "a@x.com", name: "Aaron", role: "filmer" }, { email: "m@x.com", name: "Mia", role: "coach" },
		]);
		const seen = (email: string, at: string) => db.prepare("UPDATE members SET last_seen_at = ? WHERE email = ?").bind(at, email).run();
		await seen("sam@saints.example", "2026-10-24T07:00:00.000Z");
		await seen("z@x.com", "2026-10-24T07:00:00.000Z");
		await seen("m@x.com", "2026-10-20T00:00:00.000Z");
		const order = async (sort: MemberSort) => (await listActiveMembers(db, TEAM, sort)).map((m) => m.name || m.email);
		expect(await order("name")).toEqual(["Aaron", "Mia", "Sam Rivers", "zoe", "none@x.com"]);
		expect(await order("seen")).toEqual(["Sam Rivers", "zoe", "Mia", "Aaron", "none@x.com"]);
		expect(await order("role")).toEqual(["Sam Rivers", "none@x.com", "Mia", "Aaron", "zoe"]);
	});

	it("never leaves the team without a team manager, even if two demote or remove each other at once", async () => {
		const db = createTestDb();
		await upsertMembers(db, TEAM, [{ email: "b@x.com", name: "Bea", role: "manager" }]);
		const bea = await findActiveMemberByEmail(db, TEAM, "b@x.com");
		// Both checks passed (two admins), then both writes land: the second one is refused.
		await updateMemberDetails(db, TEAM, bea!.id, { name: "Bea", role: "watcher" });
		await expect(updateMemberDetails(db, TEAM, 1, { name: "Sam", role: "watcher" })).rejects.toThrow(/member/);
		await expect(markMemberRemoved(db, TEAM, 1, "2026-10-15T00:00:00.000Z")).rejects.toThrow(/member/);
		expect(await countActiveManagers(db, TEAM)).toBe(1);
	});
	it("throws when a targeted update matches nothing", async () => {
		await expect(updateMemberDetails(createTestDb(), TEAM, 999, { name: "", role: "watcher" })).rejects.toThrow(/member/);
		expect(await getActiveMember(createTestDb(), TEAM, 999)).toBeNull();
	});

	it("touches last_seen at most hourly", async () => {
		const db = createTestDb();
		const manager = await findActiveMemberByEmail(db, TEAM, "sam@saints.example");
		await touchLastSeen(db, TEAM, manager!.id, new Date("2026-10-15T00:00:00Z"));
		await touchLastSeen(db, TEAM, manager!.id, new Date("2026-10-15T00:30:00Z"));
		expect((await getActiveMember(db, TEAM, manager!.id))?.lastSeenAt).toBe("2026-10-15T00:00:00.000Z");
		await touchLastSeen(db, TEAM, manager!.id, new Date("2026-10-15T01:01:00Z"));
		expect((await getActiveMember(db, TEAM, manager!.id))?.lastSeenAt).toBe("2026-10-15T01:01:00.000Z");
	});
});
