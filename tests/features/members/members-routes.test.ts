import { describe, expect, it } from "vitest";
import { findActiveMemberByEmail } from "../../../src/features/members/members-repository.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

describe("members routes", () => {
	it("the page is Manage team (it runs the team, not just its members), with its people under their own heading", async () => {
		const page = await (await makeClient(createTestDeps())("/manage")).text();
		expect(page).toContain("<title>Manage team · ");
		expect(page).toContain('<div class="pagehead"><div class="eyebrow">Team managers only</div><h1>Manage team</h1></div>');
		expect(page).toMatch(/<a href="\/manage" class="" aria-current="page"><svg[^]*?<\/svg>Manage team<\/a>/);
		expect(page).toContain('<div class="stack" id="people"><h2 id="people-h">People</h2>');
		expect(page).not.toMatch(/>Members</);
	});
	it("the old address, /members (bookmarks, emails already sent), goes to Manage team with its query; only for team managers", async () => {
		const deps = createTestDeps();
		const res = await makeClient(deps)("/members?done=added&sort=name");
		expect([res.status, res.headers.get("Location")]).toEqual([302, "/manage?done=added&sort=name"]);
		expect((await makeClient(deps)("/members")).headers.get("Location")).toBe("/manage");
		await addMember(deps.db, deps.team.id, "f@x.com", "filmer");
		expect((await makeClient(deps, "f@x.com")("/members")).status).toBe(403);
	});
	it("adds, edits (name and role) and removes a member", async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		expect((await client("/members", form({ email: "sam@x.com", name: "", role: "filmer" }))).headers.get("Location")).toBe("/manage?done=added#people");
		const sam = await findActiveMemberByEmail(deps.db, deps.team.id, "sam@x.com");
		const page = await (await client("/manage?done=added")).text();
		expect(page).toContain("sam@x.com");
		expect(page).toContain(`<input name="name" type="text" maxlength="80" value="" placeholder="Name" aria-label="Name for sam@x.com" form="member-${sam!.id}">`);
		await client(`/members/${sam!.id}`, form({ name: "Sam Smith", role: "watcher" }));
		expect(await findActiveMemberByEmail(deps.db, deps.team.id, "sam@x.com")).toMatchObject({ name: "Sam Smith", role: "watcher" });
		await client(`/members/${sam!.id}/remove`, form({ confirm: "yes" }));
		expect(await findActiveMemberByEmail(deps.db, deps.team.id, "sam@x.com")).toBeNull();
	});
	it("never changes an existing member's role through Add a person", async () => {
		const deps = createTestDeps();
		const res = await makeClient(deps)("/members", form({ email: "sam@saints.example", name: "", role: "filmer" }));
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("already on the list");
		expect((await findActiveMemberByEmail(deps.db, deps.team.id, "sam@saints.example"))?.role).toBe("manager");
	});
	it("sums up who's using the site below the list: how many people, how recently they opened it, and by role", async () => {
		const deps = createTestDeps();
		await deps.db.prepare(`INSERT INTO members (team_id, email, role, last_seen_at) VALUES (?, 'new@x.com', 'filmer', NULL),
			(?, 'away@x.com', 'watcher', '2026-09-01T00:00:00.000Z')`).bind(deps.team.id, deps.team.id).run();
		// Sam's own Last seen isn't written until after this first page: looking at it counts as using the site.
		const page = await (await makeClient(deps)("/manage")).text();
		expect(page).toContain("<h2 id=\"who-h\">Who's using the site</h2>");
		expect(page).toContain("<p><b>1 of 3 people</b> opened the site in the last 7 days.</p>");
		expect(page).toContain('<div class="stat"><b>1</b><span>Last 7 days</span></div><div class="stat"><b>0</b><span>8 to 30 days ago</span></div>'
			+ '<div class="stat"><b>1</b><span>Over 30 days ago</span></div><div class="stat"><b>1</b><span>Not signed in yet</span></div>');
		expect(page).toContain('<p class="small"><b>Team manager 1 · Watch and film 1 · Watch only 1</b></p>\n<p class="small">3 people are on the list.');
		// The list with Add a person at its foot, Who's using the site, then the end-of-season pack.
		const at = ['id="people-h"', 'id="addperson"', 'id="who-h"', 'id="season-pack"'].map((s) => page.indexOf(s));
		expect(at.every((n, i) => n > 0 && (i === 0 || n > at[i - 1]!))).toBe(true);
		// Who films needs Watch and film, said right by Add a person, where roles are given.
		const people = page.slice(page.indexOf('id="people-h"'), page.indexOf('id="addperson"'));
		expect(people).toContain('<p class="note filmnote">Anyone who\'ll film games needs <b>Watch and film</b> (or Coach or Team manager), so give that role to everyone on the roster\'s video duty. Someone on <b>Watch only</b> can\'t upload a game\'s video or Go live.</p>');
		// A new person is Watch and film unless the team manager picks otherwise.
		const add = page.slice(page.indexOf('id="addperson"'), page.indexOf('id="who-h"'));
		expect(add).toContain('<option value="filmer" selected>');
		expect(add).not.toContain('<option value="watcher" selected>');
	});
	it("sorts the list by role (the usual order), name or Last seen, from the Sort by chips", async () => {
		const deps = createTestDeps();
		await deps.db.prepare(`INSERT INTO members (team_id, email, name, role, last_seen_at) VALUES (?, 'amy@x.com', 'Amy', 'watcher', '2026-10-14T06:00:00.000Z'),
			(?, 'ben@x.com', 'Ben', 'coach', NULL)`).bind(deps.team.id, deps.team.id).run();
		const client = makeClient(deps);
		const page = async (path: string) => (await client(path)).text();
		const emails = (text: string) => [...text.matchAll(/<td class="m-email">([^<]+)<\/td>/g)].map((m) => m[1]);
		// Anything else in ?sort= is ignored. Sam's Last seen is now, from the first page.
		const byRole = await page("/manage");
		expect(emails(byRole)).toEqual(["sam@saints.example", "ben@x.com", "amy@x.com"]);
		expect(emails(await page("/manage?sort=x"))).toEqual(["sam@saints.example", "ben@x.com", "amy@x.com"]);
		expect(emails(await page("/manage?sort=name"))).toEqual(["amy@x.com", "ben@x.com", "sam@saints.example"]);
		const bySeen = await page("/manage?sort=seen");
		expect(emails(bySeen)).toEqual(["sam@saints.example", "amy@x.com", "ben@x.com"]);
		// Each chip comes back to the list itself, not the top of the page.
		const chips = (current: string) => `<nav class="chips sortby" aria-labelledby="sort-h"><span id="sort-h">Sort by</span>${[["/manage?sort=name", "Name"],
			["/manage", "Role"], ["/manage?sort=seen", "Last seen"]].map(([href, label]) => `<a class="chip" href="${href}#people" aria-current="${label === current}">${label}</a>`).join("")}</nav>`;
		expect(byRole).toContain(`</h2>\n<p class="small">Only these emails can use the site. Add a person in the row at the bottom: they can sign in straight away, with a code sent to that email.</p><p class="note filmnote">Anyone who'll film games needs <b>Watch and film</b> (or Coach or Team manager), so give that role to everyone on the roster's video duty. Someone on <b>Watch only</b> can't upload a game's video or Go live.</p>${chips("Role")}\n<div class="tablewrap cards">`);
		expect(bySeen).toContain(chips("Last seen"));
	});
	it("keeps the chosen order through Save, Remove and Add a person", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'amy@x.com', 'Amy', 'watcher')").bind(deps.team.id).run();
		const amy = (await findActiveMemberByEmail(deps.db, deps.team.id, "amy@x.com"))!.id;
		const client = makeClient(deps);
		const bySeen = await (await client("/manage?sort=seen")).text();
		expect(bySeen).toContain('<form method="post" action="/members?sort=seen" class="playerform add personadd" id="addperson">');
		expect(bySeen).toContain(`<form method="post" action="/members/${amy}?sort=seen" id="member-${amy}"`);
		expect(bySeen).toContain(`<form method="post" action="/members/${amy}/remove?sort=seen" class="confirmpanel">`);
		// The usual order needs nothing added.
		const byRole = await (await client("/manage")).text();
		expect(byRole).toContain('<form method="post" action="/members" class="playerform add personadd" id="addperson">');
		expect(byRole).toContain(`<form method="post" action="/members/${amy}" id="member-${amy}"`);
		expect(byRole).toContain(`<form method="post" action="/members/${amy}/remove" class="confirmpanel">`);
		const location = async (path: string, init: RequestInit) => (await client(path, init)).headers.get("Location");
		expect(await location(`/members/${amy}?sort=seen`, form({ name: "Amy B", role: "watcher" }))).toBe("/manage?done=saved&sort=seen");
		expect(await location("/members?sort=name", form({ email: "cal@x.com", name: "", role: "watcher" }))).toBe("/manage?done=added&sort=name#people");
		expect(await location(`/members/${amy}/remove?sort=x`, form({ confirm: "yes" }))).toBe("/manage?done=removed");
	});
	it("Add a person takes one person: their email, name and role; a name with no email, or a role that isn't one, is refused", async () => {
		const deps = createTestDeps();
		const client = makeClient(deps);
		expect((await client("/members", form({ email: " Sam@X.com ", name: " Sam ", role: "filmer" }))).headers.get("Location")).toBe("/manage?done=added#people");
		expect(await findActiveMemberByEmail(deps.db, deps.team.id, "sam@x.com")).toMatchObject({ name: "Sam", role: "filmer" });
		const bad = await client("/members", form({ email: "", name: "Kim", role: "watcher" }));
		expect([bad.status, (await bad.text()).includes("Enter an email address for Kim.")]).toEqual([400, true]);
		const blank = await client("/members", form({ email: "", name: "", role: "watcher" }));
		expect([blank.status, (await blank.text()).includes("Enter an email address.")]).toEqual([400, true]);
		expect((await client("/members", form({ email: "kim@x.com", name: "Kim", role: "admin" }))).status).toBe(400);
		expect((await client("/members", form({ email: "kim at x", name: "Kim", role: "watcher" }))).status).toBe(400);
		expect(await findActiveMemberByEmail(deps.db, deps.team.id, "kim@x.com")).toBeNull();
	});
	it("Add a person is one row at the foot of the People list, like Add a player: no Add people box, no rows script", async () => {
		const deps = createTestDeps();
		const page = await (await makeClient(deps)("/manage")).text();
		expect(page).not.toMatch(/Add people|data-rows|addrows|Add to the team|\+ Add another/);
		expect(page).not.toContain('src="/rows.js"');
		expect(page.match(/id="addperson"/g)).toHaveLength(1);
		const add = page.slice(page.indexOf('id="addperson"'), page.indexOf('id="who-h"'));
		expect(add).toContain('<label class="pemail">Email<input name="email" type="email" inputmode="email" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="254" required></label>');
		expect(add).toContain('<label class="pname">Name<input name="name" type="text" maxlength="80"></label>');
		expect(add).toContain('<label class="prole">Role<select name="role">');
		expect(add).toContain('<button class="btn primary">Add a person</button>');
		expect(page.indexOf('</table></div>')).toBeLessThan(page.indexOf('id="addperson"'));
		// A closed season adds nobody.
		await deps.db.prepare("UPDATE teams SET status = 'closed', closed_at = '2026-10-14T00:00:00.000Z' WHERE id = ?").bind(deps.team.id).run();
		expect(await (await makeClient(deps)("/manage")).text()).not.toContain('id="addperson"');
	});
	it("rejects an invalid role and keeps the last team manager", async () => {
		const client = makeClient(createTestDeps());
		expect((await client("/members/1", form({ name: "Sam", role: "admin" }))).status).toBe(400);
		expect((await client("/members/1", form({ name: "Sam", role: "filmer" }))).status).toBe(409);
	});
	it("leaves an admin's hidden way into the team alone: Save and Remove on its id answer not found", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db);
		await addMember(deps.db, G14_5.id, "jane@x.com", "manager", "Jane");
		// Sam (a site admin, not in G14.5) opens it: a hidden team manager membership is made.
		expect((await makeClient(deps, { adminTeam: G14_5.id })("/")).status).toBe(200);
		const row = () => deps.db.prepare("SELECT id, name, role, hidden, removed_at FROM members WHERE team_id = ? AND email = ?").bind(G14_5.id, MANAGER).first<{ id: number }>();
		const before = await row();
		const jane = makeClient(deps, { email: "jane@x.com", team: G14_5.id });
		expect((await jane(`/members/${before!.id}`, form({ name: "Not an admin", role: "manager" }))).status).toBe(404);
		expect((await jane(`/members/${before!.id}/remove`, form({ confirm: "yes" }))).status).toBe(404);
		expect(await row()).toEqual(before);
		expect(before).toMatchObject({ name: "Site admin", role: "manager", hidden: 1, removed_at: null });
	});
});
