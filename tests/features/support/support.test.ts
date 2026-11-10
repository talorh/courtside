import { afterEach, describe, expect, it, vi } from "vitest";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

afterEach(() => vi.restoreAllMocks());

const JANE = "jane@example.com";
const ASK = { topic: "videos", message: "A parent's upload stops at 80% every time, on an iPhone.", contact: `${JANE}, 0400 000 000` };

async function setup() {
	const deps = createTestDeps();
	await addTeam(deps.db, G14_5);
	await addMember(deps.db, G14_5.id, JANE, "manager", "Jane Citizen");
	await addMember(deps.db, G14_5.id, "kim@example.com", "manager", "Kim");
	await addMember(deps.db, G14_5.id, "p@x.com", "watcher");
	return deps;
}
const jane = (deps: TestDeps) => makeClient(deps, { email: JANE, team: G14_5.id });
const kim = (deps: TestDeps) => makeClient(deps, { email: "kim@example.com", team: G14_5.id });
const tickets = async (deps: TestDeps) => (await deps.db.prepare("SELECT id, source, team_id, topic, message, contact, status, emailed_at IS NOT NULL AS emailed FROM support_requests ORDER BY id").all()).results;

describe("a team manager asking for help (a ticket)", () => {
	it("is saved as a new ticket, then emailed to the admins with Reply-To the team manager and a link to it", async () => {
		const deps = await setup();
		const res = await jane(deps)("/support", form(ASK));
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/support/1?done=sent"]);
		expect(await tickets(deps)).toEqual([{ id: 1, source: "team", team_id: G14_5.id, topic: "videos", message: ASK.message, contact: ASK.contact, status: "new", emailed: 1 }]);
		expect(deps.email.sent).toEqual([{
			to: [MANAGER], subject: "Support #1: Saints G14.5, Videos and uploads", replyTo: JANE,
			text: `Jane Citizen (team manager, Saints G14.5) asked for help with Videos and uploads:

${ASK.message}

Contact: ${ASK.contact}

Answer on the ticket, so it's kept there: https://saints.example/admin/support/1
Replying to this email goes to ${JANE}.`,
		}]);
		expect(await (await jane(deps)("/support/1?done=sent")).text()).toContain("Sent. The site&#39;s admin will answer here, and by email.");
		// An admin can read it without doing anything to it, so a new one hasn't been "opened": it's waiting to be picked up.
		expect(await (await jane(deps)("/support/1")).text()).toContain('<span class="tstat s-new">Sent</span> Waiting for the site&#39;s admin to pick it up.');
	});

	it("is for team managers only: coaches, Watch and film and Watch only can't open it or ask", async () => {
		const deps = await setup();
		await addMember(deps.db, G14_5.id, "coach@x.com", "coach", "Chris");
		await addMember(deps.db, G14_5.id, "film@x.com", "filmer");
		expect(await (await jane(deps)("/support")).text()).toContain('<div class="eyebrow">Team managers</div>');
		for (const email of ["coach@x.com", "film@x.com", "p@x.com"]) {
			const client = makeClient(deps, { email, team: G14_5.id });
			expect((await client("/support")).status, email).toBe(403);
			expect((await client("/support", form({ ...ASK, contact: email }))).status, email).toBe(403);
		}
	});

	it("lists the team manager's own requests on Support, newest first, each with where it's at; never anyone else's", async () => {
		const deps = await setup();
		await jane(deps)("/support", form(ASK));
		await jane(deps)("/support", form({ ...ASK, topic: "live", message: "How do I go live?" }));
		await kim(deps)("/support", form({ ...ASK, message: "Kim's own question" }));
		await deps.db.prepare("UPDATE support_requests SET status = 'waiting' WHERE id = 1").run();
		const page = await (await jane(deps)("/support")).text();
		const mine = page.slice(page.indexOf("<h2>Your requests</h2>"));
		expect(mine.indexOf('href="/support/2"')).toBeLessThan(mine.indexOf('href="/support/1"'));
		expect(mine).toContain('<span class="tstat s-waiting">Waiting for you</span>');
		expect(mine).toContain('<span class="tstat s-new">Sent</span>');
		expect(mine).not.toContain("Kim&#39;s own question");
		expect((await jane(deps)("/support/3")).status).toBe(404);
		expect((await makeClient(deps, { email: "p@x.com", team: G14_5.id })("/support")).status).toBe(403);
		expect((await makeClient(deps, { email: "p@x.com", team: G14_5.id })("/support", form(ASK))).status).toBe(403);
	});

	it("shows a ticket's conversation, never the admins' private notes, and takes a reply that goes to the admins and opens it again", async () => {
		const deps = await setup();
		await jane(deps)("/support", form(ASK));
		await makeClient(deps)("/admin/support/1/message", form({ body: "Is it on Wi-Fi?", then: "reply" }));
		await makeClient(deps)("/admin/support/1/message", form({ body: "Jane's phone is old", then: "note" }));
		await makeClient(deps)("/admin/support/1/status", form({ status: "resolved" }));
		const page = await (await jane(deps)("/support/1")).text();
		expect(page).toContain(ASK.message.replace("'", "&#39;"));
		expect(page).toContain("Is it on Wi-Fi?");
		expect(page).not.toContain("Jane&#39;s phone is old");
		expect(page).toContain('<span class="tstat s-resolved">Resolved</span> If there&#39;s more, reply below and it opens again.');
		deps.email.sent.length = 0;
		const reply = await jane(deps)("/support/1/reply", form({ body: "Yes, on Wi-Fi. Still stops." }));
		expect([reply.status, reply.headers.get("Location")]).toEqual([303, "/support/1?done=replied"]);
		expect(await deps.db.prepare("SELECT status, resolved_at FROM support_requests WHERE id = 1").first()).toEqual({ status: "open", resolved_at: null });
		expect(deps.email.sent).toEqual([{
			to: [MANAGER], subject: "Support #1: Jane Citizen replied", replyTo: JANE,
			text: "Jane Citizen (Saints G14.5) replied about Videos and uploads:\n\nYes, on Wi-Fi. Still stops.\n\nThe ticket: https://saints.example/admin/support/1",
		}]);
		expect((await kim(deps)("/support/1/reply", form({ body: "Me too" }))).status).toBe(404);
	});

	it("works once the team's season is over (closed)", async () => {
		const deps = await setup();
		await deps.db.prepare("UPDATE teams SET status = 'closed', delete_after = '2027-12-31T13:00:00.000Z' WHERE id = ?").bind(G14_5.id).run();
		expect((await jane(deps)("/support", form(ASK))).status).toBe(303);
		expect((await jane(deps)("/support/1/reply", form({ body: "And another thing" }))).status).toBe(303);
	});

	it("still saves it when the email fails; the 5-minute job sends it, once", async () => {
		const deps = await setup();
		deps.email.failNext = "E_RATE_LIMIT_EXCEEDED";
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect((await jane(deps)("/support", form(ASK))).headers.get("Location")).toBe("/support/1?done=sent");
		expect(await tickets(deps)).toMatchObject([{ emailed: 0 }]);
		vi.spyOn(console, "log").mockImplementation(() => {});
		await runSync(deps);
		expect(deps.email.sent.map((e) => e.subject)).toEqual(["Support #1: Saints G14.5, Videos and uploads"]);
		expect(await tickets(deps)).toMatchObject([{ emailed: 1 }]);
		await runSync(deps);
		expect(deps.email.sent).toHaveLength(1);
	});

	it("refuses a sixth in a day from one person, and a message that's empty or too long", async () => {
		const deps = await setup();
		for (let i = 0; i < 5; i++) expect((await jane(deps)("/support", form(ASK))).status).toBe(303);
		const sixth = await jane(deps)("/support", form(ASK));
		expect(sixth.status).toBe(429);
		expect(await sixth.text()).toContain("That&#39;s a lot for one day. We&#39;ll get back to you about the others first.");
		const deps2 = await setup();
		expect((await jane(deps2)("/support", form({ ...ASK, message: "  " }))).status).toBe(400);
		expect((await jane(deps2)("/support", form({ ...ASK, message: "x".repeat(2001) }))).status).toBe(400);
		expect((await jane(deps2)("/support", form({ ...ASK, topic: "money" }))).status).toBe(400);
		await jane(deps2)("/support", form(ASK));
		expect((await jane(deps2)("/support/1/reply", form({ body: " " }))).status).toBe(400);
	});
});
