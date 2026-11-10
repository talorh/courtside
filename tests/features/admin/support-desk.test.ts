import { afterEach, describe, expect, it, vi } from "vitest";
import { retryTicketEmails } from "../../../src/features/admin/support-desk-service.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

afterEach(() => vi.restoreAllMocks());

const JANE = "jane@example.com";
const JO = "jo@example.com";
const ASK = { topic: "videos", message: "A parent's upload stops at 80% every time, on an iPhone.", contact: `${JANE}, 0400 000 000` };
const admin = (deps: TestDeps, email = MANAGER) => makeClient(deps, email);
const jane = (deps: TestDeps) => makeClient(deps, { email: JANE, team: G14_5.id });
const ticket = (deps: TestDeps, id = 1) => deps.db.prepare("SELECT status, assigned_to, resolved_by FROM support_requests WHERE id = ?").bind(id).first();
const log = async (deps: TestDeps) => (await deps.db.prepare("SELECT action, detail FROM admin_log ORDER BY id").all()).results;

/** Jane (G14.5's team manager) asks one question; Jo is a second admin. */
async function setup() {
	const deps = createTestDeps();
	await addTeam(deps.db, G14_5);
	await addMember(deps.db, G14_5.id, JANE, "manager", "Jane Citizen");
	await deps.db.prepare("INSERT INTO admins (email, added_by, added_at) VALUES (?, ?, '2026-10-01T00:00:00.000Z')").bind(JO, MANAGER).run();
	await jane(deps)("/support", form(ASK));
	deps.email.sent.length = 0;
	return deps;
}
const site = (deps: TestDeps, title: string, status = "new") => deps.db.prepare(`INSERT INTO support_requests (source, alert_kind, title, topic, message, status, created_at, updated_at)
	VALUES ('site', 'images', ?, 'platform', 'Photos are near the limit.\n\nWhat to do: delete old photos.', ?, '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z')`).bind(title, status).run();

describe("the support desk: a queue of tickets (a proper service desk)", () => {
	it("shows what needs an answer first, with a count for each view, and each ticket's team, who asked, owner and age", async () => {
		const deps = await setup();
		await jane(deps)("/support", form({ ...ASK, topic: "live", message: "How do I go live?" }));
		await jane(deps)("/support", form({ ...ASK, topic: "other", message: "Thanks for that!" }));
		await deps.db.prepare("UPDATE support_requests SET status = 'waiting' WHERE id = 2").run();
		await deps.db.prepare("UPDATE support_requests SET status = 'resolved', resolved_at = updated_at, resolved_by = ? WHERE id = 3").bind(MANAGER).run();
		await site(deps, "Photos are near Images' 100,000");
		const page = await (await admin(deps)("/admin/support")).text();
		for (const [href, label, n, on] of [["/admin/support", "Needs an answer", 2, true], ["/admin/support?view=mine", "Yours", 0, false], ["/admin/support?view=waiting", "Waiting for a reply", 1, false],
			["/admin/support?view=resolved", "Resolved", 1, false], ["/admin/support?view=all", "All", 4, false]] as const) {
			expect(page, label).toContain(`<a class="chip" href="${href}"${on ? ' aria-current="true"' : ""}>${label} <span class="n">${n}</span></a>`);
		}
		const listed = [...page.matchAll(/<tr class="tk[^"]*" data-href="\/admin\/support\/(\d+)">/g)].map((m) => Number(m[1]));
		expect(listed.sort()).toEqual([1, 4]);
		const rowOf = (id: number) => page.slice(page.indexOf(`data-href="/admin/support/${id}"`), page.indexOf("</tr>", page.indexOf(`data-href="/admin/support/${id}"`)));
		for (const part of ["#1", '<span class="tstat s-new">New</span>', '<a href="/admin/support/1"><b>Videos and uploads</b></a>', "A parent&#39;s upload stops at 80%", '<span class="teamtag">Saints G14.5</span>', "Jane Citizen", "Nobody's yet"]) expect(rowOf(1), part).toContain(part);
		expect(rowOf(4)).toContain("<b>Photos are near Images&#39; 100,000</b>");
		expect(rowOf(4)).toContain('<span class="teamtag">The site</span>');
		const rows = async (q: string) => ((await (await admin(deps)(`/admin/support${q}`)).text()).match(/<tr class="tk/g) ?? []).length;
		expect(await rows("?view=waiting")).toBe(1);
		expect(await rows("?view=all")).toBe(4);
		// The queue's figures: two need an answer, both nobody's; one waits on a team manager.
		expect(page).toContain('<div class="lstat warn"><b>2</b><span>need an answer</span><span class="lnote">2 nobody&#39;s yet</span></div>');
		expect(page).toContain('<div class="lstat"><b>1</b><span>waiting on team managers</span></div>');
	});

	it("shows a ticket: the conversation, its notes and events, who asked and how to reach them, and its team", async () => {
		const deps = await setup();
		const page = await (await admin(deps)("/admin/support/1")).text();
		expect(page).toContain("<h1>#1 Videos and uploads</h1>");
		expect(page).toContain('<a class="backlink" href="/admin/support">‹ Support</a>');
		expect(page).toContain(ASK.message.replace("'", "&#39;"));
		for (const part of ["Jane Citizen", "Team manager", JANE, ASK.contact]) expect(page, part).toContain(part);
		expect(page).toContain(`<input type="hidden" name="team" value="${G14_5.id}">`);
		expect(page).toContain('<button class="btn primary" name="then" value="reply">Send reply</button>');
		expect((await admin(deps)("/admin/support/99")).status).toBe(404);
	});

	it("sends a reply to the team manager by email, Reply-To the admin, waits on them, and gives the ticket to whoever answered", async () => {
		const deps = await setup();
		const res = await admin(deps)("/admin/support/1/message", form({ body: "Is it on Wi-Fi?", then: "reply" }));
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/admin/support/1?done=sent"]);
		expect(await ticket(deps)).toEqual({ status: "waiting", assigned_to: MANAGER, resolved_by: null });
		expect(deps.email.sent).toEqual([{
			to: [JANE], subject: "Re: your question about Videos and uploads (#1)", replyTo: MANAGER,
			text: `Is it on Wi-Fi?\n\nFrom ${MANAGER}, the site's admin.\n\nSee the whole conversation, and reply, on the site: https://saints.example/support/1`,
		}]);
		expect(await log(deps)).toEqual([{ action: "support_replied", detail: "#1" }]);
	});

	it("sends and resolves in one go: one email, saying it's resolved", async () => {
		const deps = await setup();
		await admin(deps)("/admin/support/1/message", form({ body: "Fixed: try again.", then: "resolve" }));
		expect(await ticket(deps)).toEqual({ status: "resolved", assigned_to: MANAGER, resolved_by: MANAGER });
		expect(deps.email.sent).toHaveLength(1);
		expect(deps.email.sent[0]?.text).toContain("This one's resolved now: if there's more, reply on the site and it opens again.");
		expect(await log(deps)).toEqual([{ action: "support_replied", detail: "#1" }, { action: "support_status", detail: "#1 resolved" }]);
	});

	it("keeps a private note to the admins: no email, and it opens a new ticket", async () => {
		const deps = await setup();
		await admin(deps)("/admin/support/1/message", form({ body: "Her phone is an iPhone 8.", then: "note" }));
		expect(deps.email.sent).toEqual([]);
		expect(await ticket(deps)).toEqual({ status: "open", assigned_to: null, resolved_by: null });
		expect(await (await admin(deps)("/admin/support/1")).text()).toContain("Her phone is an iPhone 8.");
	});

	it("gives a ticket to another admin by email; taking it yourself emails nobody; only an admin can have one", async () => {
		const deps = await setup();
		await admin(deps)("/admin/support/1/assign", form({ to: JO }));
		expect(await ticket(deps)).toEqual({ status: "open", assigned_to: JO, resolved_by: null });
		expect(deps.email.sent).toEqual([{
			to: [JO], subject: "Support #1 is yours: Videos and uploads",
			text: `${MANAGER} gave you support #1 (Videos and uploads).\n\nThe ticket: https://saints.example/admin/support/1`,
		}]);
		await admin(deps)("/admin/support/1/assign", form({ to: MANAGER }));
		expect(deps.email.sent).toHaveLength(1);
		expect((await admin(deps)("/admin/support/1/assign", form({ to: JANE }))).status).toBe(400);
		const page = await (await admin(deps)("/admin/support/1")).text();
		expect(page).toContain(`${MANAGER} gave it to ${JO}.`);
		expect(page).toContain(`${MANAGER} took it.`);
		expect((await log(deps)).map((l) => l.detail)).toEqual([`#1 to ${JO}`, `#1 to ${MANAGER}`]);
	});

	it("never emails for an admin who's been removed since: their reply stays on the site, and isn't tried again", async () => {
		const deps = await setup();
		vi.spyOn(console, "error").mockImplementation(() => {});
		const logged = vi.spyOn(console, "log").mockImplementation(() => {});
		deps.email.failNext = "E_INTERNAL_SERVER_ERROR";
		await admin(deps, JO)("/admin/support/1/message", form({ body: "Is it on Wi-Fi?", then: "reply" }));
		await admin(deps)("/admin/admins/remove", form({ email: JO, confirm: "yes" }));
		deps.email.sent.length = 0;
		await retryTicketEmails(deps);
		expect(deps.email.sent).toEqual([]);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM support_messages WHERE emailed_at IS NULL AND email_to IS NOT NULL").first("n")).toBe(0);
		expect(logged.mock.calls.map((c) => String(c[0])).some((line) => line.includes("ticket_email_skipped"))).toBe(true);
		expect(await (await jane(deps)("/support/1")).text()).toContain("Is it on Wi-Fi?");
	});

	it("the site's own tickets are open or resolved, never waiting for a reply; an old one can't reopen while a newer one about the same thing is open", async () => {
		const deps = await setup();
		await site(deps, "Photos are near Images' 100,000", "resolved");
		await site(deps, "Photos are nearly at Images' 100,000");
		const page = await (await admin(deps)("/admin/support/3")).text();
		expect(page).not.toContain('<option value="waiting"');
		expect((await admin(deps)("/admin/support/3/status", form({ status: "waiting" }))).status).toBe(400);
		const reopened = await admin(deps)("/admin/support/2/status", form({ status: "open" }));
		expect(reopened.status).toBe(409);
		expect(await reopened.text()).toContain("#3 is open about this already");
		expect(await ticket(deps, 2)).toMatchObject({ status: "resolved" });
		await admin(deps)("/admin/support/3/status", form({ status: "resolved" }));
		expect((await admin(deps)("/admin/support/2/status", form({ status: "open" }))).status).toBe(303);
		expect(await ticket(deps, 2)).toMatchObject({ status: "open", resolved_by: null });
	});

	it("saving the status a ticket has already changes nothing and adds no line", async () => {
		const deps = await setup();
		await admin(deps)("/admin/support/1/status", form({ status: "open" }));
		await admin(deps)("/admin/support/1/status", form({ status: "open" }));
		expect((await log(deps)).map((l) => l.detail)).toEqual(["#1 open"]);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM support_messages WHERE request_id = 1").first("n")).toBe(1);
	});

	it("tells the team manager when it's marked resolved; open and waiting don't email anyone", async () => {
		const deps = await setup();
		await admin(deps)("/admin/support/1/status", form({ status: "waiting" }));
		await admin(deps)("/admin/support/1/status", form({ status: "open" }));
		expect(deps.email.sent).toEqual([]);
		await admin(deps)("/admin/support/1/status", form({ status: "resolved" }));
		expect(await ticket(deps)).toMatchObject({ status: "resolved", resolved_by: MANAGER });
		expect(deps.email.sent).toEqual([{
			to: [JANE], subject: "Resolved: your question about Videos and uploads (#1)", replyTo: MANAGER,
			text: "The site's admin marked your question resolved.\n\nIf there's more, reply on the site and it opens again: https://saints.example/support/1",
		}]);
		expect((await admin(deps)("/admin/support/1/status", form({ status: "done" }))).status).toBe(400);
	});

	it("has no reply box on the site's own tickets (there's nobody to reply to): notes and status only", async () => {
		const deps = await setup();
		await site(deps, "Photos are near Images' 100,000");
		const page = await (await admin(deps)("/admin/support/2")).text();
		expect(page).toContain("<h1>#2 Photos are near Images&#39; 100,000</h1>");
		expect(page).not.toContain('value="reply"');
		expect(page).toContain('value="note"');
		expect((await admin(deps)("/admin/support/2/message", form({ body: "Hi", then: "reply" }))).status).toBe(400);
	});

	it("counts what needs an answer beside Support", async () => {
		const deps = await setup();
		await site(deps, "Photos are near Images' 100,000");
		await site(deps, "Done", "resolved");
		const page = await (await admin(deps)("/admin/log")).text();
		expect(page).toContain('<span class="count" title="2 waiting for an answer" aria-hidden="true">2</span>');
	});
});

describe("the support queue's filters and figures", () => {
	const ids = async (deps: TestDeps, q: string) => [...(await (await admin(deps)(`/admin/support${q}`)).text()).matchAll(/<tr class="tk[^"]*" data-href="\/admin\/support\/(\d+)">/g)].map((m) => Number(m[1])).sort();

	it("narrows a queue to a team, an owner or nobody's, and words (in the ticket, who asked, or its number), together", async () => {
		const deps = await setup();
		await jane(deps)("/support", form({ ...ASK, topic: "live", message: "How do I go live?" }));
		await site(deps, "Photos are near Images' 100,000");
		await admin(deps)("/admin/support/2/assign", form({ to: JO }));
		expect(await ids(deps, "?view=all")).toEqual([1, 2, 3]);
		expect(await ids(deps, `?view=all&team=${G14_5.id}`)).toEqual([1, 2]);
		expect(await ids(deps, "?view=all&owner=none")).toEqual([1, 3]);
		expect(await ids(deps, `?view=all&owner=${encodeURIComponent(JO.toUpperCase())}`)).toEqual([2]);
		expect(await ids(deps, "?view=all&q=GO%20LIVE")).toEqual([2]);
		expect(await ids(deps, "?view=all&q=jane%20citizen")).toEqual([1, 2]);
		expect(await ids(deps, "?view=all&q=%233")).toEqual([3]);
		expect(await ids(deps, `?view=all&team=${G14_5.id}&owner=none`)).toEqual([1]);
		// The chips count what the filters leave, and keep them.
		const page = await (await admin(deps)(`/admin/support?team=${G14_5.id}`)).text();
		expect(page).toContain(`<a class="chip" href="/admin/support?view=all&amp;team=${G14_5.id}">All <span class="n">2</span></a>`);
		expect(page).toContain(`<option value="${G14_5.id}" selected>Saints G14.5 (2026/27)</option>`);
		expect(await (await admin(deps)("/admin/support?q=nothing-like-this")).text()).toContain("<b>No tickets match these filters.</b>");
	});

	it("says how long the oldest has waited, flags one waiting over a day, and gives a typical first reply", async () => {
		const deps = await setup();
		await deps.db.prepare("UPDATE support_requests SET created_at = '2026-10-13T00:00:00.000Z', updated_at = '2026-10-13T00:00:00.000Z' WHERE id = 1").run();
		const page = await (await admin(deps)("/admin/support")).text();
		expect(page).toContain('<div class="lstat warn"><b>2 days</b><span>oldest waiting</span>');
		expect(page).toMatch(/data-href="\/admin\/support\/1">[^]*?<span class="t warn">Over a day<\/span><\/td><\/tr>/);
		expect(page).toContain("<b>None yet</b><span>typical first reply</span>");
		await admin(deps)("/admin/support/1/message", form({ body: "Try Files first.", then: "reply" }));
		const after = await (await admin(deps)("/admin/support")).text();
		expect(after).toContain('<div class="lstat"><b>2 days</b><span>typical first reply</span><span class="lnote">Over 1 asked in the last 30 days</span></div>');
	});
});
