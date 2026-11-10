import { describe, expect, it } from "vitest";
import { currentTeam, readTeamCookies } from "../../src/app/current-team.ts";
import { ensureHiddenManager } from "../../src/auth/memberships-repository.ts";
import { loadViewer } from "../../src/auth/viewer.ts";
import { countingDb } from "../helpers/counting-db.ts";
import { createTestDb } from "../helpers/d1-sqlite.ts";

const B12 = "b12.1-2026";
const G14 = "g14.5-2026";
const MANAGER = "sam@saints.example";

async function twoTeams() {
	const db = createTestDb();
	await db.prepare("INSERT INTO teams (id, name, code, season_start) VALUES (?, 'Saints U14 Girls 14.5', 'g14.5', 2026)").bind(G14).run();
	await db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'both@x.com', 'filmer'), (?, 'both@x.com', 'watcher'), (?, 'jane@x.com', 'manager')")
		.bind(B12, G14, G14).run();
	return db;
}

const cookies = (team: string | null = null, adminTeam: string | null = null) => ({ team, adminTeam });
const id = (t: Awaited<ReturnType<typeof currentTeam>>["team"]) => (typeof t === "string" ? t : t.id);

describe("the team cookies", () => {
	it("reads team, admin_team and viewas among the other cookies, and nothing else", () => {
		const req = new Request("https://saints.example/", { headers: { Cookie: `CF_Authorization=x; team=${G14}; admin_team=${B12}; theme=dark; viewas=${B12}:parent` } });
		expect(readTeamCookies(req)).toEqual({ team: G14, adminTeam: B12, viewAs: `${B12}:parent` });
		expect(readTeamCookies(new Request("https://saints.example/"))).toEqual({ team: null, adminTeam: null, viewAs: null });
		expect(readTeamCookies(new Request("https://saints.example/", { headers: { Cookie: "myteam=b; team=" } }))).toEqual({ team: null, adminTeam: null, viewAs: null });
	});
});

describe("the current team", () => {
	it("is the team the cookie names, when the person is in it", async () => {
		const db = await twoTeams();
		const both = await loadViewer(db, "both@x.com", new Date());
		expect(await currentTeam(db, both, cookies(G14))).toEqual({ team: expect.objectContaining({ id: G14, code: "g14.5" }), setCookies: [] });
		expect(id((await currentTeam(db, both, cookies(B12))).team)).toBe(B12);
	});

	it("is someone's only team, with the cookie put right, when it names a team they're not in, a deleted team or nonsense", async () => {
		const db = await twoTeams();
		const jane = await loadViewer(db, "jane@x.com", new Date());
		for (const cookie of [B12, "nonsense", null]) {
			const now = await currentTeam(db, jane, cookies(cookie));
			expect(id(now.team)).toBe(G14);
			expect(now.setCookies).toEqual([`team=${G14}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`]);
		}
		await db.prepare("UPDATE members SET removed_at = '2026-10-28T00:00:00.000Z' WHERE team_id = ? AND email = 'both@x.com'").bind(G14).run();
		await db.prepare("UPDATE teams SET status = 'deleted' WHERE id = ?").bind(G14).run();
		expect(id((await currentTeam(db, await loadViewer(db, "both@x.com", new Date()), cookies(G14))).team)).toBe(B12);
	});

	it("asks Which team? when someone in several current teams hasn't chosen, and clears a cookie that's no use", async () => {
		const db = await twoTeams();
		const both = await loadViewer(db, "both@x.com", new Date());
		expect(await currentTeam(db, both, cookies())).toEqual({ team: "choose", setCookies: [] });
		expect(await currentTeam(db, both, cookies("old-team"))).toEqual({ team: "choose", setCookies: ["team=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"] });
	});

	it("is the one current team of someone whose other team's season is over, unless they chose the old one", async () => {
		const db = await twoTeams();
		await db.prepare("UPDATE teams SET status = 'closed' WHERE id = ?").bind(B12).run();
		const both = await loadViewer(db, "both@x.com", new Date());
		expect(id((await currentTeam(db, both, cookies())).team)).toBe(G14);
		expect(id((await currentTeam(db, both, cookies(B12))).team)).toBe(B12);
	});

	it("is none for someone on no team's list", async () => {
		const db = await twoTeams();
		expect(await currentTeam(db, await loadViewer(db, "stranger@x.com", new Date()), cookies(B12))).toEqual({
			team: "none", setCookies: ["team=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"],
		});
	});

	it("is an admin's visit to a team they aren't in, for this browser session only; the next session it's their own team again", async () => {
		const db = await twoTeams();
		const manager = await loadViewer(db, MANAGER, new Date());
		const { db: counted, counter } = countingDb(db);
		expect(await currentTeam(counted, manager, cookies(B12, G14))).toEqual({ team: expect.objectContaining({ id: G14 }), setCookies: [] });
		expect(counter.trips).toBe(1);
		expect(id((await currentTeam(db, manager, cookies(B12))).team)).toBe(B12);
	});

	it("ignores and clears admin_team for someone who isn't an admin now, or when its team is deleted", async () => {
		const db = await twoTeams();
		const cleared = "admin_team=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0";
		expect(await currentTeam(db, await loadViewer(db, "both@x.com", new Date()), cookies(B12, G14))).toEqual({ team: expect.objectContaining({ id: B12 }), setCookies: [cleared] });
		await db.prepare("UPDATE teams SET status = 'deleted' WHERE id = ?").bind(G14).run();
		expect(await currentTeam(db, await loadViewer(db, MANAGER, new Date()), cookies(B12, G14))).toEqual({ team: expect.objectContaining({ id: B12 }), setCookies: [cleared] });
		expect((await currentTeam(db, await loadViewer(db, MANAGER, new Date()), cookies(B12, "nonsense"))).setCookies).toEqual([cleared]);
	});

	it("never counts an admin's hidden way into a team as one of their teams", async () => {
		const db = await twoTeams();
		await ensureHiddenManager(db, G14, MANAGER);
		const manager = await loadViewer(db, MANAGER, new Date());
		expect(id((await currentTeam(db, manager, cookies())).team)).toBe(B12);
		expect(id((await currentTeam(db, manager, cookies(G14))).team)).toBe(B12);
		const { db: counted, counter } = countingDb(db);
		expect(id((await currentTeam(counted, manager, cookies(B12, G14))).team)).toBe(G14);
		expect(counter.trips).toBe(0);
		await db.prepare("UPDATE members SET removed_at = '2026-10-28T00:00:00.000Z' WHERE team_id = ? AND email = ?").bind(B12, MANAGER).run();
		expect((await currentTeam(db, await loadViewer(db, MANAGER, new Date()), cookies())).team).toBe("none");
	});
});
