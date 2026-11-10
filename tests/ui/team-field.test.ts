import { describe, expect, it } from "vitest";
import { hasRole, ROLES, type Role } from "../../src/auth/permissions.ts";
import { type ClientOptions, makeClient, MANAGER } from "../helpers/app.ts";
import { B12_1, createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { addTeam, G14_5, type Seeded, seedTeam } from "../helpers/two-teams.ts";

/** Every page a member can open, with the least role that can: the forms that only show in some states are there
 * because the team has one of everything (seedTeam). */
const pages = (s: Seeded): Array<[string, Role]> => [
	["/", "watcher"], ["/upload", "filmer"], ["/live", "filmer"], [`/live?game=${s.gameId}`, "filmer"], ["/games", "watcher"],
	[`/games/${s.gameId}`, "watcher"], [`/games/${s.gameId}?clip=${s.clipId}`, "watcher"], ["/photos", "watcher"], [`/photos/${s.photoId}`, "watcher"],
	["/fixture", "watcher"], ["/manage", "manager"], ["/notifications", "manager"], ["/help", "watcher"], ["/roster", "watcher"],
	[`/roster/week/${s.week}/message`, "manager"],
];

async function crawl(deps: TestDeps, s: Seeded, check: (page: string, where: string) => void) {
	let forms = 0;
	for (const role of ROLES) {
		const client = makeClient(deps, { email: s.emails[role], team: s.team.id });
		for (const [path, least] of pages(s).filter(([, least]) => hasRole(role, least))) {
			const res = await client(path);
			expect(res.status, `${role} ${path} (${least})`).toBe(200);
			const page = await res.text();
			check(page, `${role} ${path}`);
			forms += (page.match(/<form\b[^>]*method="post"/g) ?? []).length;
		}
	}
	return forms;
}

describe("every page says which team it's for", () => {
	for (const [team, tag, short, ask] of [[B12_1, "b", "Saints B12.1", "Sam"], [G14_5, "g", "Saints G14.5", ""]] as const) {
		it(`${short}: each post form carries its team once, and the page names it, for every role`, async () => {
			const deps = createTestDeps();
			if (team !== B12_1) await addTeam(deps.db, team);
			const s = await seedTeam(deps, team, tag);
			const field = `<input type="hidden" name="_team" value="${team.id}">`;
			const forms = await crawl(deps, s, (page, where) => {
				for (const m of page.matchAll(/<form\b[^>]*method="post"[^>]*>/g)) {
					expect(page.slice((m.index ?? 0) + m[0].length).startsWith(field), `${where}: ${m[0]}`).toBe(true);
				}
				expect(page.split('name="_team"').length - 1, where).toBe((page.match(/<form\b[^>]*method="post"/g) ?? []).length);
				expect(page, where).toContain(`<html lang="en-AU" data-site="Courtside" data-team="${team.id}" data-team-name="${short}" data-ask="${ask}">`);
				expect(page, where).toMatch(new RegExp(`<title>[^<]* · ${short.replace(".", "\\.")}</title>`));
				expect(page, where).toContain(`<b>${short}</b>`);
			});
			// The crawl reached the forms: the team manager's alone have dozens.
			expect(forms).toBeGreaterThan(40);
		});
	}

	it("links the team's name at the top to Which team? only when there's another team of theirs to go to: someone in two teams, or an admin visiting one they aren't in; else Home", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db);
		const s = await seedTeam(deps, B12_1, "b");
		const brand = async (who: string | ClientOptions) => /<a class="brand" href="([^"]+)"/.exec(await (await makeClient(deps, who)("/help")).text())?.[1];
		expect(await brand(s.emails.watcher)).toBe("/");
		// An admin in one team: its name is Home, however many teams the site has (Admin, Teams opens the others).
		expect(await brand(MANAGER)).toBe("/");
		// Visiting another team as an admin, it's the way back.
		expect(await brand({ email: MANAGER, adminTeam: G14_5.id })).toBe("/teams");
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, ?, 'watcher')").bind(G14_5.id, s.emails.watcher).run();
		expect(await brand(s.emails.watcher)).toBe("/teams");
	});

	it("says Switch team under the team's name for someone in two or more teams, and nothing new for one team", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db);
		const s = await seedTeam(deps, B12_1, "b");
		const top = async (who: string) => /<a class="brand"[\s\S]*?<\/a>/.exec(await (await makeClient(deps, who)("/help")).text())?.[0] ?? "";
		const one = await top(s.emails.manager);
		expect(one).toContain("<span><b>Saints B12.1</b></span></a>");
		expect(one).not.toContain("Switch team");
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, ?, 'manager')").bind(G14_5.id, s.emails.manager).run();
		const two = await top(s.emails.manager);
		expect(two).toContain('<a class="brand" href="/teams">');
		expect(two).toMatch(/<span><b>Saints B12\.1<\/b><span class="switchteam"><svg class="ico"[^>]*>[\s\S]*?<\/svg>Switch team<\/span><\/span><\/a>/);
	});
});
