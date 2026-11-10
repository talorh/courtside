import { describe, expect, it } from "vitest";
import { escapeHtml } from "../../../src/shared/html.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

const JANE = { code: "g14.5", season: "2026", managerName: "Jane Citizen", managerEmail: "jane@example.com", askName: "" };
const onboard = (deps: TestDeps, fields: Partial<typeof JANE> = {}) => makeClient(deps)("/admin/teams", form({ ...JANE, ...fields }));
const rows = async (deps: TestDeps, sql: string) => (await deps.db.prepare(sql).all()).results;

// Practical instructions for using the site: setting up, game day, the season; consent and the
// team's WhatsApp group are taken as done. Easy to read on a phone (no big slabs of text):
// headings, one point a paragraph, and the one video rule first on game day.
const WELCOME = `Hi Jane,

Saints G14.5's private site is ready: https://saints.example


SIGNING IN

• Sign in with jane@example.com: a code is emailed to you, no password. On Hotmail or Outlook it can land in Junk: mark it Not junk and add alerts@saints.example to your contacts, and the next ones come to your inbox.


GETTING SET UP

1. Players: on Manage team, add your squad under Players, by number and name.

2. People: on Manage team, under People, add each person's email, name and role with Add a person.

3. Games: on Fixture, tap Add fixture and paste your team's public PlayHQ link, or tap Add game for each one.

4. Roster: on Roster, add your families' surnames, set your game day duties, then tap Generate roster.

5. Tell the families: post saints.example in the team chat, and that on Hotmail or Outlook their code may be in Junk (they mark it Not junk).


QUESTIONS?

Tap Help at the top right. Virtual Team Manager answers most things, and there's a form at the bottom to contact support.


Go Saints!`;

describe("onboarding a team", () => {
	it("sets the team up with its team manager, logs it, and gives the message to send them", async () => {
		const deps = createTestDeps();
		const res = await onboard(deps, { code: " G14.5 " });
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/admin/teams/g14.5-2026/welcome?emailed=sent"]);
		expect(await rows(deps, "SELECT id, name, code, season_start, ask_name, status FROM teams WHERE id = 'g14.5-2026'"))
			.toEqual([{ id: "g14.5-2026", name: "Saints U14 Girls 14.5", code: "g14.5", season_start: 2026, ask_name: null, status: "active" }]);
		expect(await rows(deps, "SELECT email, name, role, hidden, removed_at FROM members WHERE team_id = 'g14.5-2026'"))
			.toEqual([{ email: "jane@example.com", name: "Jane Citizen", role: "manager", hidden: 0, removed_at: null }]);
		expect(await rows(deps, "SELECT admin_email, team_id, action, detail, created_at FROM admin_log"))
			.toEqual([{ admin_email: MANAGER, team_id: "g14.5-2026", action: "team_onboarded", detail: "g14.5", created_at: "2026-10-15T00:00:00.000Z" }]);
		const page = await (await makeClient(deps)("/admin/teams/g14.5-2026/welcome")).text();
		expect(page).toContain("<h1>Saints G14.5 is ready</h1>");
		expect(page).toContain(`<textarea id="welcome" class="msg" rows="20" readonly>${escapeHtml(WELCOME)}</textarea>`);
		expect(page).toContain('<button class="btn" type="button" data-copy="welcome">Copy</button>');
		expect(page).toContain('<script type="module" src="/copy.js"></script>');
		expect(page).toContain("The welcome Jane gets by email, from alerts@saints.example. Copy it to send another way too, a text, say.");
	});

	it("keeps the name to ask when one is given, and takes next season", async () => {
		const deps = createTestDeps();
		expect((await onboard(deps, { askName: " Jane ", season: "2027" })).status).toBe(303);
		expect(await rows(deps, "SELECT id, season_start, ask_name FROM teams WHERE code = 'g14.5'")).toEqual([{ id: "g14.5-2027", season_start: 2027, ask_name: "Jane" }]);
	});

	it.each([
		[{ code: "g14" }, 400, `"g14" isn't a team code. It's b or g, the age group, a dot and the team's number: b12.1, g14.5.`],
		[{ code: "b12.1" }, 409, "Saints B12.1 is still open: close it first."],
		[{ season: "2025" }, 400, "Pick this season or next season."],
		[{ managerName: "  " }, 400, "Enter the team manager's name."],
		[{ managerEmail: "jane@" }, 400, `"jane@" isn't an email address.`],
	])("refuses %o, keeping what was typed, and changes nothing", async (fields, status, message) => {
		const deps = createTestDeps();
		const res = await onboard(deps, { ...fields, askName: "Janey" });
		expect(res.status).toBe(status);
		const page = await res.text();
		expect(page).toContain(escapeHtml(message));
		const typed = { ...JANE, ...fields, askName: "Janey" };
		for (const [name, value] of Object.entries(typed).filter(([key]) => key !== "season")) {
			expect(page, name).toMatch(new RegExp(`name="${name}"[^>]*value="${escapeHtml(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
		}
		expect(await rows(deps, "SELECT id FROM teams")).toEqual([{ id: "b12.1-2026" }]);
		expect(await rows(deps, "SELECT id FROM admin_log")).toEqual([]);
	});

	it("takes a code whose team is closed (next season's B12.1), but not the same season's closed team again", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("UPDATE teams SET status = 'closed' WHERE id = 'b12.1-2026'").run();
		expect((await onboard(deps, { code: "b12.1", season: "2027" })).status).toBe(303);
		await addTeam(deps.db, { ...G14_5, status: "closed" });
		const again = await onboard(deps);
		expect(again.status).toBe(409);
		expect(await again.text()).toContain("Saints G14.5 (2026/27) is here already, closed: reopen it from the list instead.");
	});

	it("sets up a deleted team's code and season again under a new id", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, { ...G14_5, status: "deleted" });
		expect((await onboard(deps)).headers.get("Location")).toBe("/admin/teams/g14.5-2026-2/welcome?emailed=sent");
	});

	it("is refused, not an error, when someone else onboards the same code at the same moment", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		// The check before the insert sees no open G14.5 (the other onboarding hadn't finished); the database still refuses.
		const prepare = (sql: string) => deps.db.prepare(sql.includes("status = 'active' AND code = ?") ? sql.replace("code = ?", "code = ? AND 0") : sql);
		const db = { prepare, batch: deps.db.batch.bind(deps.db) } as unknown as D1Database;
		const res = await makeClient({ ...deps, db })("/admin/teams", form({ ...JANE, season: "2027" }));
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("Saints G14.5 was set up a moment ago: check the list.");
	});

	it("has its own page, with this season picked", async () => {
		const deps = createTestDeps();
		const page = await (await makeClient(deps)("/admin/teams/new")).text();
		expect(page).toContain('<form class="panel stack" method="post" action="/admin/teams">');
		expect(page).toContain('<option value="2026" selected>2026/27 (this season)</option><option value="2027">2027/28</option>');
	});

	it("tells an admin when a team has no team manager to send the message to", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		const page = await (await makeClient(deps)("/admin/teams/g14.5-2026/welcome")).text();
		expect(page).toContain("Saints G14.5 has no team manager yet. Open it and add one on Manage team.");
		expect(page).not.toContain("<textarea");
		expect((await makeClient(deps)("/admin/teams/nope/welcome")).status).toBe(404);
	});
});

describe("the Teams page", () => {
	/** B12.1 (Sam and two more), G14.5 (Jane, a Watch only person and an admin's hidden way in), B14.2 closed, and one deleted. */
	async function teams() {
		const deps = createTestDeps();
		const at = (iso: string, email: string) => deps.db.prepare("UPDATE members SET last_seen_at = ? WHERE email = ?").bind(iso, email).run();
		await addMember(deps.db, deps.team.id, "coach@x.com", "coach", "Coach Bruce");
		await addMember(deps.db, deps.team.id, "both@x.com", "watcher");
		await at("2026-10-15T00:00:00.000Z", MANAGER);
		await addTeam(deps.db, G14_5);
		await addMember(deps.db, G14_5.id, "jane@example.com", "manager", "Jane Citizen");
		await addMember(deps.db, G14_5.id, "both@x.com", "watcher");
		await deps.db.prepare("INSERT INTO members (team_id, email, role, hidden, last_seen_at) VALUES (?, 'other-admin@x.com', 'manager', 1, '2026-10-15T00:00:00.000Z')").bind(G14_5.id).run();
		await at("2026-10-14T00:00:00.000Z", "jane@example.com");
		await addTeam(deps.db, { ...G14_5, id: "b14.2-2026", code: "b14.2", name: "Saints U14 Boys 14.2", status: "closed", closedAt: "2026-10-01T00:00:00.000Z", deleteAfter: "2027-12-31T13:00:00.000Z" });
		await addMember(deps.db, "b14.2-2026", "sam@x.com", "manager", "Sam Example");
		await at("2026-10-01T00:00:00.000Z", "sam@x.com");
		await addTeam(deps.db, { ...G14_5, id: "b10.1-2026", code: "b10.1", name: "Saints U10 Boys 10.1", status: "deleted" });
		const support = "INSERT INTO support_requests (team_id, member_id, topic, message, contact, status, created_at) VALUES (?, (SELECT id FROM members WHERE team_id = ? AND role = 'manager' LIMIT 1), 'videos', 'Help', 'x', ?, '2026-10-14T00:00:00.000Z')";
		await deps.db.prepare(support).bind(G14_5.id, G14_5.id, "new").run();
		await deps.db.prepare(support).bind(deps.team.id, deps.team.id, "resolved").run();
		return deps;
	}

	it("says how many are running and how many seasons are over, and the people on them (each email once, hidden ways in left out)", async () => {
		const page = await (await makeClient(await teams())("/admin/teams")).text();
		expect(page).toContain('<p class="lede">2 running, 1 past season. 5 people are on a team.</p>');
	});

	it("lists current teams, then closed ones, each with its numbers and a way to open it; deleted teams aren't there", async () => {
		const page = await (await makeClient(await teams())("/admin/teams")).text();
		const table = page.slice(page.indexOf("<table"));
		const order = ["Saints B12.1", "Saints G14.5", "Past seasons", "Saints B14.2"].map((s) => table.indexOf(`>${s}<`));
		expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]!))).toBe(true);
		expect(order[0]).toBeGreaterThan(0);
		expect(page).not.toContain("B10.1");
		const row = (label: string) => page.slice(page.indexOf(`<b>${label}</b>`), page.indexOf("</tr>", page.indexOf(`<b>${label}</b>`)));
		expect(row("Saints B12.1")).toMatch(/2026\/27.*Active.*3.*Sam Rivers.*Today.*None/s);
		expect(row("Saints G14.5")).toMatch(/2026\/27.*Active.*2.*Jane Citizen.*Yesterday.*<a href="\/admin\/support">1 open<\/a>/s);
		expect(row("Saints B14.2")).toMatch(/2026\/27.*Season over.*1.*Sam Example.*Thu 1 Oct 2026.*None/s);
		expect(row("Saints G14.5")).toContain(`<form method="post" action="/teams/switch" class="inline"><input type="hidden" name="team" value="${G14_5.id}"><input type="hidden" name="next" value="/"><button class="btn primary" aria-label="Open Saints G14.5">Open</button></form>`);
		expect(page).toContain('<a class="btn primary" href="/admin/teams/new">');
	});
});

describe("the team manager's welcome email (onboarding emails them, to get them started)", () => {
	// The email says replies reach the site's admin; the message on the page (sent another way) doesn't.
	const EMAIL = {
		subject: "Saints G14.5's private site is ready", text: WELCOME.replace("to contact support.", "to contact support, or just reply to this email."),
		html: expect.stringContaining("<h2"),
	};

	it("emails the new team manager their welcome, Reply-To the admin who onboarded the team, and the page says so", async () => {
		const deps = createTestDeps();
		await onboard(deps);
		expect(deps.email.sent).toEqual([{ to: ["jane@example.com"], ...EMAIL, replyTo: MANAGER }]);
		const page = await (await makeClient(deps)("/admin/teams/g14.5-2026/welcome?emailed=sent")).text();
		expect(page).toContain('<div class="note" role="status">Emailed to Jane at jane@example.com. Replies come to you.</div>');
		expect(page).toContain('<form method="post" action="/admin/teams/g14.5-2026/welcome"><button class="btn">Email it again</button></form>');
		// No address from the page's own address: only fixed words.
		expect(await (await makeClient(deps)("/admin/teams/g14.5-2026/welcome?emailed=hacked")).text()).not.toContain("hacked");
	});

	it("still onboards the team when the email doesn't go, says so, and can email it again", async () => {
		const deps = createTestDeps();
		deps.email.failNext = "E_RATE_LIMITED";
		const res = await onboard(deps);
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/admin/teams/g14.5-2026/welcome?emailed=failed"]);
		expect(await rows(deps, "SELECT id FROM teams WHERE id = 'g14.5-2026'")).toEqual([{ id: "g14.5-2026" }]);
		const page = await (await makeClient(deps)("/admin/teams/g14.5-2026/welcome?emailed=failed")).text();
		expect(page).toContain('<div class="note warn" role="status">The email to Jane didn&#39;t go. Send the message below another way, or email it again.</div>');
		expect(page).toContain(`<textarea id="welcome" class="msg" rows="20" readonly>${escapeHtml(WELCOME)}</textarea>`);
		const again = await makeClient(deps)("/admin/teams/g14.5-2026/welcome", form({}));
		expect([again.status, again.headers.get("Location")]).toEqual([303, "/admin/teams/g14.5-2026/welcome?emailed=sent"]);
		expect(deps.email.sent).toEqual([{ to: ["jane@example.com"], ...EMAIL, replyTo: MANAGER }]);
	});

	it("goes only to the team's own team manager, never an admin's hidden way in or a removed one", async () => {
		const deps = createTestDeps();
		await onboard(deps);
		await deps.db.prepare("UPDATE members SET removed_at = '2026-10-15T00:00:00.000Z' WHERE team_id = 'g14.5-2026'").run();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role, hidden) VALUES ('g14.5-2026', ?, 'Sam', 'manager', 1)").bind(MANAGER).run();
		const again = await makeClient(deps)("/admin/teams/g14.5-2026/welcome", form({}));
		expect(again.headers.get("Location")).toBe("/admin/teams/g14.5-2026/welcome?emailed=failed");
		expect(deps.email.sent).toHaveLength(1);
		expect((await makeClient(deps)("/admin/teams/nope/welcome", form({}))).status).toBe(404);
	});

	it("on staging, goes to the admin instead, as staging only lets Sam's addresses in", async () => {
		const deps = createTestDeps();
		const staging = { ...deps, config: { ...deps.config, staging: true } };
		await makeClient(staging)("/admin/teams", form(JANE));
		expect(deps.email.sent).toEqual([{ to: [MANAGER], subject: `[Staging] ${EMAIL.subject}`, text: EMAIL.text, html: EMAIL.html, replyTo: MANAGER }]);
		const page = await (await makeClient(staging)("/admin/teams/g14.5-2026/welcome?emailed=sent")).text();
		expect(page).toContain("Emailed to you: on staging it never goes to Jane.");
	});

	it("is short and in the site's style: Courtside in its top bar, headings, bold labels, a button to the site", async () => {
		const deps = createTestDeps();
		await onboard(deps, { managerName: "<i>Jo</i> Citizen" });
		const sent = deps.email.sent[0]?.html ?? "";
		// No image: a short email carrying one looks like spam to Outlook and Hotmail.
		expect(sent).not.toContain("<img");
		expect(sent).toContain('<div style="font-size:21px;font-weight:800;line-height:1.15">Courtside</div>');
		expect(sent).toContain("<p style=\"margin:0 0 14px\">Hi &lt;i&gt;Jo&lt;/i&gt;,</p>");
		expect(sent).toMatch(/<a href="https:\/\/saints\.example" style="[^"]*background:#2F6FDB[^"]*">Open Saints G14\.5's site<\/a>/);
		const headings = [...sent.matchAll(/<h2 style="[^"]+">([^<]+)<\/h2>/g)].map((m) => m[1]);
		expect(headings).toEqual(["Signing in", "Getting set up", "Questions?"]);
		expect(sent).toMatch(/<ol style="[^"]+"><li style="[^"]+"><b>Players:<\/b> on <b>Manage team<\/b>/);
		expect(sent).not.toContain("WhatsApp");
		expect(sent).toContain("or just reply to this email.");
		expect(sent).not.toContain("<i>Jo</i>");
	});
});
