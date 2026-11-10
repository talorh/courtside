import { describe, expect, it } from "vitest";
import { makeClient } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { seedGame, seedVideo } from "../helpers/seed.ts";

describe("home", () => {
	it("is a landing page with the court, and Upload only for those who can upload", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Sam Parent', 'watcher')").bind(deps.team.id).run();
		const admin = await makeClient(deps)("/");
		expect(admin.status).toBe(200);
		const page = await admin.text();
		expect(page).toContain('src="/court.webp"');
		expect(page).toContain('href="/upload"');
		expect(page).not.toContain("No games to watch yet");
		// A site for the whole team now, not just video: the top bar is just the team name.
		expect(page).toContain("<span><b>Saints B12.1</b></span></a>");
		expect(page).not.toContain("Gameday Footage");
		for (const href of ["/fixture", "/manage", "/notifications"]) expect(page).toContain(`<a class="btn" href="${href}">`);
		const watcher = await (await makeClient(deps, "p@x.com")("/")).text();
		expect(watcher).not.toContain("Welcome");
		// Parents get the Roster, the Fixture (to view), Photos and Help under the main buttons, in that order.
		const more = /<div class="homemore">(.*?)<\/div>/.exec(watcher)![1]!;
		expect([...more.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/roster", "/fixture", "/photos", "/help"]);
		expect(page).toContain('<a class="btn" href="/photos">');
		expect(watcher).not.toContain('class="btn primary bigpick" href="/upload"');
		expect(watcher).toContain('class="btn bigpick watchbtn" href="/games"');
	});
	it("ends with the squad as singlets, one under another in number order; removed players drop off", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("UPDATE players SET removed_at = '2026-10-20' WHERE name = 'Kevin'").run();
		const page = await (await makeClient(deps)("/")).text();
		expect(page).toContain("Saints U12 Boys 12.1");
		expect(page).toContain('<section class="squad"><h2>The squad</h2>');
		// The club singlet with their number on the left, then "Chris #3".
		expect(page).toMatch(/<li><svg class="jersey"[^>]*aria-label="Saints singlet, number 5">[\s\S]*?<\/svg><span class="pname">Robinson #5<\/span><\/li>/);
		expect(page).not.toContain("EASTLAND");
		expect(page).toMatch(/<text class="kit-name"[^>]*>SAINTS<\/text>/);
		expect(page.indexOf(">Robinson #5<")).toBeLessThan(page.indexOf(">Ewing #6<"));
		expect(page.indexOf(">Ewing #6<")).toBeLessThan(page.indexOf(">Magic #15<"));
		expect(page.indexOf("homemore")).toBeLessThan(page.indexOf("The squad"));
		expect(page).not.toContain(">Kevin #35<");
		expect(page).not.toContain("players, in number order");
	});
	it("coaches get Fixture but not Notifications or Manage team", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'c@x.com', 'Coach', 'coach')").bind(deps.team.id).run();
		const page = await (await makeClient(deps, "c@x.com")("/")).text();
		expect(page).toContain('<a class="btn" href="/fixture">');
		expect(page).not.toContain('<a class="btn" href="/notifications">');
		expect(page).not.toContain('<a class="btn" href="/manage">');
	});
	it("names the soonest game still to come, for the computer's Coming up card, and nothing when there's none", async () => {
		const deps = createTestDeps();
		const none = await (await makeClient(deps)("/")).text();
		expect(none).not.toContain('class="panel next deskonly"');
		await seedGame(deps, { startsAt: "2026-12-05T10:00", opponent: "Later Lions" });
		const soon = await seedGame(deps, { startsAt: "2026-11-20T18:40", opponent: "Sooner Suns", venue: "Saints Stadium" });
		await seedGame(deps, { startsAt: "2026-10-01T10:00", opponent: "Played Pumas" });
		const page = await (await makeClient(deps)("/")).text();
		expect(page).toContain('<a class="panel next deskonly" href="/fixture"><span class="eyebrow">Coming up</span><b>');
		expect(page).toMatch(/<a class="panel next deskonly" href="\/fixture">[^]*?vs Sooner Suns<\/b><span class="small">Fri 20 Nov 2026, 6:40pm · Saints Stadium<\/span><span class="go">Fixture ▶<\/span><\/a>/);
		expect(page).not.toMatch(/panel next deskonly[^]*?Later Lions/);
		// The main column holds the buttons, the latest game and what's coming; the links beside it (a phone reorders by CSS).
		expect(page.indexOf('<div class="homemain"><div class="homeactions">')).toBeLessThan(page.indexOf('<div class="homeside">'));
		expect(soon).toBeGreaterThan(0);
	});
	it("links the newest watchable game", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { opponent: "Lakeside Rockets" });
		await seedVideo(deps, { gameId, streamUid: "u" });
		const page = await (await makeClient(deps)("/")).text();
		expect(page).toContain(`<a class="panel latest" href="/games/${gameId}">`);
		expect(page).toContain("vs Lakeside Rockets");
	});
	it("says when the season's videos and photos go, from 60 days before, so families can download what they want", async () => {
		const note = "<p class=\"note warn\" role=\"status\">This season's videos and photos go after <b>Fri 31 Dec 2027</b>. Download any you'd like to keep before then. <a href=\"/manage#season-pack\">The end-of-season pack</a> on Manage team has them all.</p>";
		const at = async (iso: string) => (await makeClient(createTestDeps(new Date(iso)))("/")).text();
		expect(await at("2027-10-31T00:00:00.000Z")).not.toContain("videos and photos go after");
		expect(await at("2027-11-02T00:00:00.000Z")).toContain(note);
		expect(await at("2027-12-31T12:00:00.000Z")).toContain("videos and photos go after");
	});
});
