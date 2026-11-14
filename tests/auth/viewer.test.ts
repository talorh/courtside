import { describe, expect, it } from "vitest";
import { isAdmin } from "../../src/auth/admins-repository.ts";
import { ensureHiddenManager, membershipsStatement, toMembership } from "../../src/auth/memberships-repository.ts";
import { loadViewer } from "../../src/auth/viewer.ts";
import { listActiveMembers, upsertMembers } from "../../src/features/members/members-repository.ts";
import { ownerTeamId } from "../../src/features/teams/owner-repository.ts";
import { getTeam, listTeams } from "../../src/features/teams/teams-repository.ts";
import { countingDb } from "../helpers/counting-db.ts";
import { createTestDb } from "../helpers/d1-sqlite.ts";

const B12 = "b12.1-2026";
const listMemberships = async (db: D1Database, email: string) =>
	(await membershipsStatement(db, email).all<Parameters<typeof toMembership>[0]>()).results.map(toMembership);
const G14 = "g14.5-2026";

async function twoTeams() {
	const db = createTestDb();
	await db.prepare("INSERT INTO teams (id, name, code, season_start) VALUES (?, 'Saints U14 Girls 14.5', 'g14.5', 2026)").bind(G14).run();
	await db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'both@x.com', 'Both', 'filmer'), (?, 'both@x.com', 'Both', 'watcher'), (?, 'jane@x.com', 'Jane', 'manager')")
		.bind(B12, G14, G14).run();
	return db;
}

describe("teams", () => {
	it("reads a team with its code, season and status, and lists the ones that aren't deleted", async () => {
		const db = await twoTeams();
		expect(await getTeam(db, B12)).toEqual({ id: B12, code: "b12.1", name: "Saints U12 Boys 12.1", seasonStart: 2026, askName: "Sam", status: "active", closedAt: null, deleteAfter: null });
		expect(await getTeam(db, "nope")).toBeNull();
		await db.prepare("INSERT INTO teams (id, name, code, season_start, status) VALUES ('old', 'x', 'b14.2', 2026, 'deleted')").run();
		expect((await listTeams(db)).map((t) => t.id)).toEqual([B12, G14]);
	});
});

describe("memberships and the viewer", () => {
	it("finds every team someone is in, whatever the email's case, active teams first", async () => {
		const db = await twoTeams();
		const both = await listMemberships(db, "BOTH@x.com");
		expect(both.map((m) => [m.team.id, m.member.role])).toEqual([[B12, "filmer"], [G14, "watcher"]]);
		expect(both[0]?.team.code).toBe("b12.1");
		await db.prepare("UPDATE teams SET status = 'closed' WHERE id = ?").bind(B12).run();
		expect((await listMemberships(db, "both@x.com")).map((m) => m.team.id)).toEqual([G14, B12]);
	});

	it("leaves out removed memberships and deleted teams", async () => {
		const db = await twoTeams();
		await db.prepare("UPDATE members SET removed_at = '2026-10-28T00:00:00.000Z' WHERE team_id = ? AND email = 'both@x.com'").bind(G14).run();
		expect((await listMemberships(db, "both@x.com")).map((m) => m.team.id)).toEqual([B12]);
		await db.prepare("UPDATE teams SET status = 'deleted' WHERE id = ?").bind(B12).run();
		expect(await listMemberships(db, "both@x.com")).toEqual([]);
	});

	it("knows the admins from the admins table, in any case, and not removed ones", async () => {
		const db = createTestDb();
		expect(await isAdmin(db, "Sam@saints.example")).toBe(true);
		expect(await isAdmin(db, "jane@x.com")).toBe(false);
		await db.prepare("UPDATE admins SET removed_at = '2026-10-28T00:00:00.000Z'").run();
		expect(await isAdmin(db, "sam@saints.example")).toBe(false);
	});

	it("loads who's asking in one trip to the database", async () => {
		const { db, counter } = countingDb(await twoTeams());
		const viewer = await loadViewer(db, "Sam@Saints.Example", new Date());
		expect(counter.trips).toBe(1);
		expect(viewer).toMatchObject({ email: "sam@saints.example", isAdmin: true });
		expect(viewer.memberships.map((m) => [m.team.id, m.member.role])).toEqual([[B12, "manager"]]);
	});

	it("gives an admin a hidden team manager membership once, and never touches a real one", async () => {
		const db = await twoTeams();
		const hidden = (await ensureHiddenManager(db, G14, "sam@saints.example")).member;
		expect(hidden).toMatchObject({ teamId: G14, role: "manager", hidden: true, email: "sam@saints.example" });
		expect((await ensureHiddenManager(db, G14, "sam@saints.example")).member.id).toBe(hidden.id);
		expect(await db.prepare("SELECT COUNT(*) AS n FROM members WHERE team_id = ? AND email = 'sam@saints.example'").bind(G14).first("n")).toBe(1);
		const real = (await ensureHiddenManager(db, B12, "sam@saints.example")).member;
		expect(real).toMatchObject({ teamId: B12, role: "manager", hidden: false });
		await db.prepare("UPDATE members SET removed_at = '2026-10-28T00:00:00.000Z' WHERE id = ?").bind(hidden.id).run();
		expect((await ensureHiddenManager(db, G14, "sam@saints.example")).member).toMatchObject({ id: hidden.id, hidden: true });
	});

	it("drops hidden memberships for someone who isn't an admin any more", async () => {
		const db = await twoTeams();
		await ensureHiddenManager(db, G14, "sam@saints.example");
		expect((await loadViewer(db, "sam@saints.example", new Date())).memberships.map((m) => m.team.id)).toEqual([B12, G14]);
		await db.prepare("UPDATE admins SET removed_at = '2026-10-28T00:00:00.000Z'").run();
		expect((await loadViewer(db, "sam@saints.example", new Date())).memberships.map((m) => m.team.id)).toEqual([B12]);
	});

	it("makes a hidden membership real when a team manager adds that person, with the role they chose, and lists only real ones", async () => {
		const db = await twoTeams();
		await ensureHiddenManager(db, G14, "sam@saints.example");
		expect((await listActiveMembers(db, G14)).map((m) => m.email)).toEqual(["jane@x.com", "both@x.com"]);
		await upsertMembers(db, G14, [{ email: "sam@saints.example", name: "Sam", role: "coach" }]);
		const row = (await listActiveMembers(db, G14)).find((m) => m.email === "sam@saints.example");
		expect(row).toMatchObject({ role: "coach", hidden: false, name: "Sam" });
	});
});

describe("which team owns a thing", () => {
	it("answers for games, videos, clips and photos by their site-wide ids", async () => {
		const db = await twoTeams();
		await db.prepare("INSERT INTO games (id, team_id, starts_at, competition) VALUES (40, ?, '2026-10-30T18:40', 'VJBL')").bind(G14).run();
		expect(await ownerTeamId(db, "games", 40)).toBe(G14);
		expect(await ownerTeamId(db, "games", 999)).toBeNull();
		expect(await ownerTeamId(db, "videos", 1)).toBeNull();
	});
});
