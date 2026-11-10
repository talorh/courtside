import { describe, expect, it } from "vitest";
import { holdEmail } from "../../../src/auth/sign-in-codes-repository.ts";
import { escapeHtml } from "../../../src/shared/html.ts";
import { makeClient, MANAGER } from "../../helpers/app.ts";
import { B12_1, createTestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5, type Seeded, seedTeam } from "../../helpers/two-teams.ts";

/** A spreadsheet of one game: what Read spreadsheet shows before Add ticked games. */
function oneGameSheet(): RequestInit {
	const body = new FormData();
	body.set("file", new File(["Date,Time,Opponent\n20/11/2026,6:40pm,Lakeside\n"], "fixture.csv", { type: "text/csv" }));
	body.set("competition", "VJBL");
	return { method: "POST", body };
}

/** Each bold name in a team manager's questions that's something to tap, and a page of B12.1's it's on (seeded with one
 * of everything). */
const BUTTONS: Record<string, (s: Seeded, today: number) => string | [string, RequestInit]> = {
	"Add a person": () => "/manage", Save: () => "/manage", Remove: () => "/manage", "Yes, remove them": () => "/manage", "Add a player": () => "/manage",
	"Yes, take them off": () => "/manage", "Delete clip": () => "/manage", "Delete photo": () => "/manage", "Delete video": () => "/manage",
	"Keep video": () => "/manage", "Keep clip": () => "/manage", "Keep photo": () => "/manage", "Manage team": () => "/manage", Notifications: () => "/manage",
	"Game lines": () => "/manage", "Edit game lines": () => "/manage", "Save game lines": () => "/manage/game-lines",
	"Get every HD copy ready": () => "/manage",
	"Waiting to sign in": () => "/manage", "Let them sign in": () => "/manage", "+ Add another": () => "/roster",
	"Add game": () => "/fixture", "Save game": () => "/fixture", "Add fixture": () => "/fixture", "Read fixture": () => "/fixture", "Add from a spreadsheet": () => "/fixture",
	"Read spreadsheet": () => "/fixture", "Add ticked games": () => ["/fixture/sheet", oneGameSheet()], Edit: () => "/fixture", Delete: () => "/fixture", "Yes, delete it": () => "/fixture", "Delete game and video": () => "/fixture",
	"Check now": () => "/fixture", "Live stream": () => "/fixture", "Record and upload after": () => "/fixture", "No video": () => "/fixture", Fixture: () => "/fixture",
	Roster: () => "/roster", "Take off": () => "/roster", "Add families": () => "/roster", "Save duties": () => "/roster", "Generate roster": () => "/roster", Change: () => "/roster", "Save week": () => "/roster",
	"WhatsApp message": () => "/roster", "Copy message": (s) => `/roster/week/${s.week}/message`, "Open WhatsApp": (s) => `/roster/week/${s.week}/message`,
	"Update message": (s) => `/roster/week/${s.week}/message`,
	"Move video": (s) => `/games/${s.gameId}`, "Save score": (s) => `/games/${s.gameId}`, "Team manager": (s) => `/games/${s.gameId}`, "Hide scores": () => "/games",
	"Go live": () => "/live", "End game": (_s, today) => `/live?game=${today}`, "Yes, end game": (_s, today) => `/live?game=${today}`,
	"Save what was recorded": (_s, today) => `/live?game=${today}`, "Carry on streaming": (_s, today) => `/live?game=${today}`, Help: () => "/help",
	"Keep the first part": (s) => `/games/${s.gameId}`,
	"Switch to mobile view": () => "/manage", "Switch to desktop view": () => "/manage",
};

/** Bold words in them that aren't buttons: emphasis, examples, and the team's own words (its date, its helper). */
const EMPHASIS = new Set(["end-of-season pack", "Lots of people at once?", "template", "CSV", "Carry on", 
	"Players:", "People:", "Games:", "Roster:", "Tell the families:", "saints.example", "Not junk", "Watch only:", "Watch and film:", "Coach:", "Team manager:", "Watch only", "Watch and film",
	"25", "plus trick", "parent@saints.example", "parent+grandma@saints.example", "New number or name:", "Leaving the team:", "Live stream:", "Record and upload after:", "No video:",
	"Video", "Players", "People", "Duties", "Families on the roster", "31 December 2027", "Virtual Sam", "Virtual Team Manager",
	"public", "/org/", "/teams/", "My teams", "/account/my-teams/", // PlayHQ's public team page, not its private My teams one
	"Too many codes?", "email", "name", "role",
	"{opponent}", "at {venue}", "{ours}", "{them}", // what a game line is written with, on Game lines
	"Waiting for video", // a played game's status on the Fixture, not a button (fixture tests check it)
	// On a tournament weekend's Change only (this team has none): roster-routes.test.ts checks they're there.
	"All duties this week", "Scorers only this week",
]);

async function b12() {
	const deps = createTestDeps();
	const s = await seedTeam(deps, B12_1, "b");
	// A game tonight with no video yet: Go live has it, and a video can be moved to it.
	await deps.db.prepare("INSERT INTO roster_families (team_id, surname) VALUES (?, 'Curry')").bind(B12_1.id).run();
	const today = (await deps.db.prepare("INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, '2026-10-15T18:40', 'VJBL', '10', 'Lakeside')").bind(B12_1.id).run()).meta.last_row_id;
	return { deps, s, today };
}

const group = (title: string, id = "") => `<h2 class="faqgroup"${id ? ` id="${id}"` : ""}>${title}</h2>`;
/** The team manager's own questions: after Getting started, and removal requests after everyone's. */
const managersPart = (page: string) => page.slice(page.indexOf('<div class="helppart" data-part="Running your team">'), page.indexOf('id="ask-admin"'));
const bolds = (page: string) => [...managersPart(page).matchAll(/<b>(.*?)<\/b>/g)].map((m) => m[1]!);

describe("Help for team managers (no separate guide, one Help page with each role's topics)", () => {
	it("puts a team manager's own questions first, for team managers and admins in a team only, and the support form for them alone", async () => {
		const { deps } = await b12();
		for (const [email, role] of [["c@x.com", "coach"], ["f@x.com", "filmer"], ["p@x.com", "watcher"]] as const) {
			await addMember(deps.db, B12_1.id, email, role);
			const page = await (await makeClient(deps, email)("/help")).text();
			expect(page, role).not.toContain("Your first week: a checklist");
			expect(page, role).not.toContain('id="ask-admin"');
			expect(page, role).toContain("Still stuck? Ask Sam.");
		}
		const page = await (await makeClient(deps)("/help")).text();
		expect(page.indexOf("Your first week: a checklist")).toBeLessThan(page.indexOf("On video duty this week? Start here"));
		// What the site is for is the last question (the answers first).
		expect(page.indexOf("On video duty this week? Start here")).toBeLessThan(page.indexOf("What is the aim here?"));
		await addTeam(deps.db, G14_5);
		expect(await (await makeClient(deps, { adminTeam: G14_5.id })("/help")).text()).toContain("Your first week: a checklist");
		// An admin viewing the team as Watch only sees Watch only's Help.
		expect(await (await makeClient(deps, { adminTeam: G14_5.id, viewAs: `${G14_5.id}:watcher` })("/help")).text()).not.toContain("Your first week: a checklist");
	});

	it("has no separate guide: no Manager guide link, no link to one, and its old address answers not found", async () => {
		const { deps } = await b12();
		const page = await (await makeClient(deps)("/help")).text();
		expect(page).not.toMatch(/Manager guide|Team manager guide|\/help\/managers/);
		expect((await makeClient(deps)("/help/managers")).status).toBe(404);
		expect(await (await makeClient(deps)("/manage")).text()).not.toContain("Manager guide");
	});

	it("has two parts: running the team (their own sections, then the support form) and what everyone on the team does", async () => {
		const { deps } = await b12();
		const page = await (await makeClient(deps)("/help")).text();
		const part = (name: string) => page.indexOf(`<div class="helppart" data-part="${name}"><h2 class="partname">${name}</h2>`);
		const at = (title: string) => page.search(new RegExp(`<h2 class="faqgroup( gtitle)?">${title}</h2>`));
		const order = [part("Running your team"), ...["Getting your team going", "People", "Players", "Fixture and games", "Video duty and the roster", "Videos",
			"Live streaming", "Notifications and scores", "End of the season", "Removal requests"].map(at), page.indexOf(group("Contact support", "ask-admin")),
		part("For everyone on the team"), ...["Getting started", "Filming a game", "Watching", "Photos", "The roster", "About this site", "Child safety"].map(at)];
		expect(order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1]!)), String(order)).toBe(true);
		expect(page).not.toMatch(/<details[^>]* open/);
		expect(page).toContain(`name="contact" type="text" required maxlength="200" value="${MANAGER}"`);
		expect(page).toContain("For anything Help doesn't answer, or an idea for the site (choose Feature request).");
		// A team manager asks the site's admin, not themselves.
		expect(page).not.toContain("Still stuck? Ask Sam.");
	});

	it("makes it plain that whoever films needs Watch and film: adding people, the roles, and video duty", async () => {
		const { deps } = await b12();
		const page = await (await makeClient(deps)("/help")).text();
		const item = (id: string) => page.slice(page.indexOf(`id="${id}"`), page.indexOf("</details>", page.indexOf(`id="${id}"`)));
		expect(item("g-add")).toContain("<li>Type their <b>email</b>, <b>name</b> and <b>role</b>. Anyone who'll film games needs <b>Watch and film</b>, the role it starts on.</li>");
		expect(item("g-roles")).toContain("<p>Anyone who'll film games, on the roster's video duty or not, needs <b>Watch and film</b> (or Coach or Team manager).\nSomeone on <b>Watch only</b> can't upload a game's video or Go live, so they couldn't film their turn.</p>");
		expect(item("g-families")).toContain("<p>Each family on video duty needs someone set to <b>Watch and film</b> on <b>Manage team</b>, or they can't film their\nturn.</p>");
	});

	it("carries the computer's layout around the page's own (help-desk.js), which Virtual Sam never reads", async () => {
		const { deps } = await b12();
		const page = await (await makeClient(deps)("/help")).text();
		expect(page).toContain('<div class="helppage"><nav class="helptoc" aria-label="Help contents">');
		expect(page).toContain('<ol id="helptoc-list"></ol></nav><div class="helpmain">');
		expect(page).toContain('<nav class="help-pn" aria-label="Neighbouring sections"></nav></div><aside class="helpoutline" aria-label="On this page">');
		expect(page).toContain('<script type="module" src="/help-desk.js"></script>');
		deps.ai.reply = "ok";
		await makeClient(deps)("/api/ask", { method: "POST", body: JSON.stringify({ question: "How do I add a game?" }), headers: { "Content-Type": "application/json" } });
		expect(deps.ai.asked[0]!.system).not.toContain("On this page");
	});

	it("takes it that the team chat and the families' emails are there already", async () => {
		const { deps } = await b12();
		const page = await (await makeClient(deps)("/help")).text();
		const first = page.slice(page.indexOf('id="g-first"'), page.indexOf('id="g-add"'));
		expect(first).toContain("<li><b>People:</b> on <b>Manage team</b>, under <b>People</b>, add each person (email, name and role) with <b>Add a person</b>.</li>");
		// Consent is taken as done too: the checklist is how to use the site.
		expect(first).not.toMatch(/consent/i);
		expect(first).toContain("<li><b>Tell the families:</b> post <b>saints.example</b> in the team chat");
		expect(page).toContain("paste it into\nthe team chat");
	});

	it("names only buttons that are on the page it names, so it can't drift from the site", async () => {
		const { deps, s, today } = await b12();
		await deps.db.prepare("INSERT INTO roster_families (team_id, surname) VALUES (?, 'Bruce')").bind(B12_1.id).run();
		// B12.1 has its 10 players: one leaves, so Add a player shows.
		await deps.db.prepare("UPDATE players SET removed_at = '2026-10-14T00:00:00.000Z' WHERE team_id = ? AND name IN ('Playerb', 'Magic')").bind(B12_1.id).run();
		// Someone asked for too many codes, so Waiting to sign in shows.
		await holdEmail(deps.db, MANAGER, "2026-10-15T00:10:00.000Z");
		// The game's video is a carried-on stream whose join gave up, so Keep the first part shows.
		await deps.db.prepare("UPDATE videos SET join_failed_at = '2026-10-15T00:00:00.000Z' WHERE team_id = ? AND id = ?").bind(B12_1.id, s.videoId).run();
		const help = await (await makeClient(deps)("/help")).text();
		const names = [...new Set(bolds(help))];
		expect(names.length).toBeGreaterThan(40);
		expect(names.filter((n) => !BUTTONS[n] && !EMPHASIS.has(n)), "bold words to classify").toEqual([]);
		const pages = new Map<string, string>();
		for (const name of names.filter((n) => BUTTONS[n])) {
			const where = BUTTONS[name]!(s, today);
			const [path, init] = typeof where === "string" ? [where, undefined] : where;
			if (!pages.has(path)) pages.set(path, await (await makeClient(deps)(path, init)).text());
			expect(pages.get(path)!.includes(`>${escapeHtml(name)}<`), `${name} on ${path}`).toBe(true);
		}
	});

	it("says what each way of adding a fixture does: a PlayHQ link's games come straight in; a page or a spreadsheet is checked first", async () => {
		const { deps } = await b12();
		const help = await (await makeClient(deps)("/help")).text();
		const playhq = help.slice(help.indexOf('id="g-playhq"'), help.indexOf('id="g-video"'));
		const steps = playhq.slice(playhq.indexOf("<ol"), playhq.indexOf("</ol>"));
		expect(steps).toContain("Its games come straight in.");
		// The public team page, never the private My teams link.
		expect(steps).toContain("On PlayHQ, open your team's <b>public</b> page and copy its link: find the team on playhq.com without signing in. Its address has <b>/org/</b> and <b>/teams/</b> in it.");
		expect(playhq).toContain("The link from <b>My teams</b>, when you're signed in to PlayHQ, is private (it has <b>/account/my-teams/</b> in it), and the site can't read it.");
		expect(help).toContain("paste your team's public PlayHQ link");
		expect(steps).not.toContain("Add ticked games");
		expect(playhq).toContain("Check the games, then tap <b>Add ticked games</b>");
		// Saving a recording works from any phone the filmer's signed in on, as the families' questions say.
		expect(help).toContain("On the same phone, open <b>Go live</b> again and tap <b>Carry on streaming</b>");
		expect(help).toContain("<b>Keep the first part</b> keeps what was filmed before the page closed");
		// A carried-on stream is joined into one video first: later than usual, and the site keeps trying for an hour before it asks.
		expect(help).toContain("A stream that was carried on after a closed page takes about ten minutes longer");
		expect(help).toContain("The site tries for about an hour before it says so.");
		// The steps for whoever films are on the same page now.
		expect(help).toContain('<a href="#live-game">Live streaming a game</a>, further down this page, has the steps for whoever films.');
	});

	it("never says Sam for a team with no name to ask", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		await addMember(deps.db, G14_5.id, "jane@x.com", "manager", "Jane");
		const page = await (await makeClient(deps, { email: "jane@x.com", team: G14_5.id })("/help")).text();
		expect(page).not.toMatch(/\bSam\b/);
		expect(page).toContain('<h2 id="ask-h">Ask Virtual Team Manager</h2>');
	});
});
