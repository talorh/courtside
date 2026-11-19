import { describe, expect, it } from "vitest";
import { filterUsers, parseUserFilters, usersHref } from "../../../src/features/admin/users-filter.ts";
import type { UserRow } from "../../../src/features/admin/users-repository.ts";
import { summariseUsers } from "../../../src/features/admin/users-summary.ts";

// The Users page's rows (one person's place on one team), filtered by team, role, status and words, in the order
// asked; and its dashboard, counting each person once.

const NOW = new Date("2026-11-19T00:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const user = (o: Partial<UserRow>): UserRow => ({ memberId: 1, teamId: "b12.1-2026", code: "B12.1", seasonStart: 2026, teamStatus: "active", email: "steph@example.com",
	name: "Steph's mum", role: "watcher", lastSeenAt: ago(1), addedAt: ago(40), isAdmin: false, locked: false, ...o });
const ROWS = [
	user({}),
	user({ memberId: 2, email: "jordan@example.com", name: "Jordan's dad", role: "manager", lastSeenAt: ago(10) }),
	user({ memberId: 3, teamId: "b14.3-2026", code: "B14.3", email: "jordan@example.com", name: "Jordan's dad", role: "filmer", lastSeenAt: ago(45) }),
	user({ memberId: 4, email: "magic@example.com", name: "", role: "coach", lastSeenAt: null, locked: true }),
	user({ memberId: 5, teamId: "b12.1-2025", code: "B12.1", seasonStart: 2025, teamStatus: "closed", email: "bird@example.com", name: "Larry", lastSeenAt: ago(200), isAdmin: true }),
];
const ids = (rows: UserRow[]) => rows.map((r) => r.memberId);
const f = (q: string) => parseUserFilters(new URL(`https://x/admin/users${q}`));

describe("the Users page's filters", () => {
	it("keeps everyone by name when the address asks for nothing, or for something it doesn't know", () => {
		expect(f("")).toEqual({ team: "", role: "", status: "", q: "", sort: "name", dir: "asc" });
		expect(f("?role=boss&status=x&sort=height&dir=up")).toEqual({ team: "", role: "", status: "", q: "", sort: "name", dir: "asc" });
		// By name, someone with no name by their email; ties by team.
		expect(ids(filterUsers(ROWS, f(""), NOW))).toEqual([2, 3, 5, 4, 1]);
	});

	it("filters by team, role, status and words in a name, an email or a team code", () => {
		expect(ids(filterUsers(ROWS, f("?team=b14.3-2026"), NOW))).toEqual([3]);
		expect(ids(filterUsers(ROWS, f("?role=manager"), NOW))).toEqual([2]);
		expect(ids(filterUsers(ROWS, f("?status=active"), NOW))).toEqual([2, 1]);
		expect(ids(filterUsers(ROWS, f("?status=quiet"), NOW))).toEqual([3, 5]);
		expect(ids(filterUsers(ROWS, f("?status=never"), NOW))).toEqual([4]);
		// Not signed in yet is the person's: someone who uses one team isn't, on a team they haven't opened.
		const both = [...ROWS, user({ memberId: 6, teamId: "b14.3-2026", code: "B14.3", lastSeenAt: null })];
		expect(ids(filterUsers(both, f("?status=never"), NOW))).toEqual([4]);
		expect(ids(filterUsers(ROWS, f("?status=locked"), NOW))).toEqual([4]);
		expect(ids(filterUsers(ROWS, f("?status=admin"), NOW))).toEqual([5]);
		expect(ids(filterUsers(ROWS, f("?status=week"), NOW))).toEqual([1]);
		// Everyone on more than one team, each of their rows.
		expect(ids(filterUsers(ROWS, f("?status=multi"), NOW))).toEqual([2, 3]);
		expect(ids(filterUsers(ROWS, f("?q=MAGIC"), NOW))).toEqual([4]);
		expect(ids(filterUsers(ROWS, f("?q=b14"), NOW))).toEqual([3]);
		expect(ids(filterUsers(ROWS, f("?team=b12.1-2026&role=watcher&q=steph"), NOW))).toEqual([1]);
	});

	it("sorts by any column either way; last seen newest first, never signed in last", () => {
		expect(ids(filterUsers(ROWS, f("?sort=email"), NOW))).toEqual([5, 2, 3, 4, 1]);
		expect(ids(filterUsers(ROWS, f("?sort=email&dir=desc"), NOW))).toEqual([1, 4, 2, 3, 5]);
		expect(ids(filterUsers(ROWS, f("?sort=role"), NOW))).toEqual([2, 4, 3, 5, 1]);
		expect(ids(filterUsers(ROWS, f("?sort=seen"), NOW))).toEqual([1, 2, 3, 5, 4]);
		expect(ids(filterUsers(ROWS, f("?sort=seen&dir=desc"), NOW))).toEqual([4, 5, 3, 2, 1]);
		expect(ids(filterUsers(ROWS, f("?sort=team"), NOW))).toEqual([2, 4, 1, 5, 3]);
	});

	it("writes the address back, leaving out what's the usual", () => {
		expect(usersHref(f(""))).toBe("/admin/users");
		expect(usersHref(f("?team=b12.1-2026&sort=seen&dir=desc&q=a b"))).toBe("/admin/users?team=b12.1-2026&q=a+b&sort=seen&dir=desc");
	});
});

describe("the Users page's dashboard", () => {
	it("counts each person once: who uses the site, who hasn't signed in, who's locked, on two teams or an admin", () => {
		const s = summariseUsers(ROWS, ["magic@example.com", "gone@example.com"], NOW);
		expect(s).toMatchObject({ people: 4, week: 1, month: 2, never: 1, locked: 2, multi: 1, admins: 1 });
		expect(s.roles).toEqual({ watcher: 2, filmer: 1, coach: 1, manager: 1 });
	});

	it("gives each team its people, who used it this month, who hasn't signed in and its team managers, running teams first", () => {
		expect(summariseUsers(ROWS, [], NOW).teams.map((t) => [t.code, t.seasonStart, t.running, t.people, t.active, t.never, t.managers])).toEqual([
			["B12.1", 2026, true, 3, 2, 1, 1], ["B14.3", 2026, true, 1, 0, 0, 0], ["B12.1", 2025, false, 1, 0, 0, 0],
		]);
	});
});
