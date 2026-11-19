import { describe, expect, it } from "vitest";
import { requestCode } from "../../../src/auth/sign-in-service.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

// The admin area's Users page: the dashboard, everyone on every team with filters and sorting, and locking, unlocking,
// taking someone off a team and adding someone, for site admins only.

async function setup() {
	const deps = createTestDeps(new Date("2026-11-19T00:00:00Z"));
	await addTeam(deps.db);
	const steph = await addMember(deps.db, deps.team.id, "steph@example.com", "watcher", "Steph's mum");
	await addMember(deps.db, G14_5.id, "steph@example.com", "filmer", "Steph's mum");
	await addMember(deps.db, G14_5.id, "boss@example.com", "manager", "Boss");
	await deps.db.prepare("UPDATE members SET last_seen_at = '2026-11-18T00:00:00Z' WHERE email = 'steph@example.com'").run();
	return { deps, steph };
}
const get = async (deps: TestDeps, path = "/admin/users") => (await makeClient(deps)(path)).text();
const post = (deps: TestDeps, path: string, data: Record<string, string>) => makeClient(deps)(path, form(data));

describe("the Users page", () => {
	it("is in the admin area's menu beside Teams, and only for site admins", async () => {
		const { deps } = await setup();
		const page = await get(deps);
		expect(page).toMatch(/href="\/admin\/teams"[^]*?href="\/admin\/users" aria-current="page"[^]*?<span>Users<\/span>/);
		expect((await makeClient(deps, "boss@example.com")("/admin/users")).status).toBe(404);
	});

	it("shows the dashboard: people counted once, who's used it, who hasn't signed in, and each team", async () => {
		const { deps } = await setup();
		const page = await get(deps);
		const tiles = page.slice(page.indexOf('<div class="units">'), page.indexOf("</div>", page.indexOf('<div class="units">'))).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
		// Steph's mum, Boss, and the site's first admin (B12.1's team manager); Steph's mum on two teams, there yesterday.
		expect(tiles).toContain("3 People on teams 1 of them site admin 1 Used it this week 33% of them 1 Used it this month 33% of them 2 Not signed in yet");
		expect(tiles).toContain("1 On more than one team");
		expect(page).toContain('<table class="userteams">');
		expect(page).toContain('href="/admin/users?team=g14.5-2026"');
	});

	it("lists a row for each team someone's on, filtered and sorted from the address", async () => {
		const { deps } = await setup();
		const rows = (html: string) => [...html.matchAll(/<td class="u-email">([^<]+)<\/td>\s*<td class="u-team">([^<]+)<\/td>/g)].map((m) => `${m[1]} ${m[2]}`);
		const all = rows(await get(deps));
		expect(all.filter((r) => r.startsWith("steph@"))).toHaveLength(2);
		expect(rows(await get(deps, "/admin/users?team=g14.5-2026&role=manager"))).toEqual(["boss@example.com Saints G14.5"]);
		expect(rows(await get(deps, "/admin/users?status=active"))).toEqual(rows(await get(deps, "/admin/users?q=steph")));
		const page = await get(deps, "/admin/users?sort=email&dir=desc");
		expect(page).toContain('aria-sort="descending"><a href="/admin/users?sort=email">Email<span aria-hidden="true"> ▼</span></a>');
		// Last seen newest first is descending, and its arrow says so; a phone sorts from the filters.
		expect(await get(deps, "/admin/users?sort=seen")).toContain('aria-sort="descending"><a href="/admin/users?sort=seen&amp;dir=desc">Last seen<span aria-hidden="true"> ▼</span></a>');
		expect(page).toMatch(/<label>Sort by<select name="sort">[^]*?<option value="email" selected>Email<\/option>/);
		expect(page).toMatch(/<label>Order<select name="dir"><option value="asc">Usual<\/option><option value="desc" selected>Reversed<\/option><\/select><\/label>/);
		// Each row says whether that team's been opened.
		await deps.db.prepare("UPDATE members SET last_seen_at = NULL WHERE email = 'steph@example.com' AND team_id = ?").bind(G14_5.id).run();
		expect(await get(deps, "/admin/users?q=steph")).toMatch(/Saints G14\.5<\/td><td class="u-role">Watch and film<\/td><td class="u-seen">Hasn&#39;t opened this team yet/);
	});

	it("locks someone: signed out, refused a sign-in code, marked Locked; then unlocks them", async () => {
		const { deps } = await setup();
		const res = await post(deps, "/admin/users/lock", { email: "steph@example.com", confirm: "yes" });
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/admin/users?done=locked"]);
		expect(await requestCode(deps, "steph@example.com", "1.2.3.4")).toBe("unknown");
		expect(await get(deps, "/admin/users?done=locked")).toMatch(/Locked\. They&#39;re signed out everywhere[^]*?class="locked"[^]*?<span class="t warn">Locked<\/span>/);
		await post(deps, "/admin/users/unlock", { email: "steph@example.com", confirm: "yes" });
		expect(await requestCode(deps, "steph@example.com", "1.2.3.4")).toBe("sent");
	});

	it("needs the confirm step to lock, unlock or take someone off a team", async () => {
		const { deps, steph } = await setup();
		expect((await post(deps, "/admin/users/lock", { email: "steph@example.com" })).status).toBe(400);
		expect((await post(deps, "/admin/users/remove", { team: deps.team.id, member: String(steph) })).status).toBe(400);
	});

	it("takes someone off one team; a refusal shows the page again with why", async () => {
		const { deps, steph } = await setup();
		const off = await post(deps, "/admin/users/remove", { team: deps.team.id, member: String(steph), confirm: "yes" });
		expect(off.headers.get("Location")).toBe("/admin/users?done=removed");
		const boss = await deps.db.prepare("SELECT id FROM members WHERE email = 'boss@example.com'").first<number>("id");
		const refused = await post(deps, "/admin/users/remove", { team: G14_5.id, member: String(boss), confirm: "yes" });
		expect(refused.status).toBe(409);
		expect(await refused.text()).toContain("Boss (boss@example.com) is the team&#39;s last team manager");
		expect((await post(deps, "/admin/users/lock", { email: MANAGER, confirm: "yes" })).status).toBe(409);
	});

	it("adds someone to a running team; a refusal keeps what was typed", async () => {
		const { deps } = await setup();
		const res = await post(deps, "/admin/users", { email: "magic@example.com", name: "Magic", team: G14_5.id, role: "coach" });
		expect(res.headers.get("Location")).toBe("/admin/users?done=added");
		const again = await post(deps, "/admin/users", { email: "magic@example.com", name: "Magic", team: G14_5.id, role: "coach" });
		expect(again.status).toBe(409);
		expect(await again.text()).toMatch(/<div class="note warn" role="alert">They&#39;re already on the list[^]*?value="magic@example.com"/);
	});
});
