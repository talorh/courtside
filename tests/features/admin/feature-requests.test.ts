import { describe, expect, it } from "vitest";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

// Feature requests: a ticket type of their own, asked for from the same form as a support question, in their own
// queue on the desk, with their own stages (considering, planned, shipped, not planned) that the team manager sees.

const JANE = "jane@example.com";
const IDEA = { topic: "feature", message: "Could the fixture show the opposition's colours?\nIt'd help the kids.", contact: JANE };
const QUESTION = { topic: "videos", message: "An upload stops at 80%.", contact: JANE };
const jane = (deps: TestDeps) => makeClient(deps, { email: JANE, team: G14_5.id });
const admin = (deps: TestDeps) => makeClient(deps);
const row = (deps: TestDeps, id: number) => deps.db.prepare("SELECT kind, topic, stage, status FROM support_requests WHERE id = ?").bind(id).first();

async function setup() {
	const deps = createTestDeps();
	await addTeam(deps.db, G14_5);
	await addMember(deps.db, G14_5.id, JANE, "manager", "Jane Citizen");
	await jane(deps)("/support", form(QUESTION));
	await jane(deps)("/support", form(IDEA));
	return deps;
}

describe("feature requests", () => {
	it("are a choice on the team manager's form, saved as their own type", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		await addMember(deps.db, G14_5.id, JANE, "manager", "Jane Citizen");
		const page = await (await jane(deps)("/support")).text();
		expect(page).toContain('<option value="feature">Feature request: an idea for the site</option>');
		expect(page).toContain("Your question or idea");
		const res = await jane(deps)("/support", form(IDEA));
		expect(res.status).toBe(303);
		expect(await row(deps, 1)).toEqual({ kind: "feature", topic: "other", stage: null, status: "new" });
	});

	it("email the admins as a feature request, named by its first line", async () => {
		const deps = await setup();
		const mail = deps.email.sent.find((m) => m.subject.startsWith("Feature request #2"));
		expect(mail?.subject).toBe("Feature request #2: Saints G14.5, Could the fixture show the opposition's colours?");
		expect(mail?.text).toContain("Jane Citizen (team manager, Saints G14.5) has an idea for the site:");
	});

	it("show in their own queue, apart from support questions, each with how many need an answer", async () => {
		const deps = await setup();
		const support = await (await admin(deps)("/admin/support")).text();
		expect(support).toContain('<a class="tab" href="/admin/support" aria-current="page">Support questions <span class="n">1</span></a>');
		expect(support).toContain('<a class="tab" href="/admin/support?type=feature">Feature requests <span class="n">1</span></a>');
		expect([...support.matchAll(/<tr class="tk[^"]*" data-href="\/admin\/support\/(\d+)">/g)].map((m) => m[1])).toEqual(["1"]);
		const features = await (await admin(deps)("/admin/support?type=feature")).text();
		expect([...features.matchAll(/<tr class="tk[^"]*" data-href="\/admin\/support\/(\d+)">/g)].map((m) => m[1])).toEqual(["2"]);
		expect(features).toContain("<b>Could the fixture show the opposition&#39;s colours?</b>");
		expect(features).toContain('<span class="stage s-new">New</span>');
		for (const label of ["Needs an answer", "Under consideration", "Planned", "Shipped", "Not planned", "All"]) expect(features).toContain(`>${label} <span class="n">`);
	});

	it("move through their own stages, each told to the team manager, who sees where theirs stands", async () => {
		const deps = await setup();
		deps.email.sent.length = 0;
		await admin(deps)("/admin/support/2/stage", form({ stage: "planned" }));
		expect(await row(deps, 2)).toMatchObject({ stage: "planned", status: "waiting" });
		expect(deps.email.sent.map((m) => m.subject)).toEqual(["Planned: your feature request (#2)"]);
		const mine = await (await jane(deps)("/support")).text();
		expect(mine).toContain('<span class="tstat s-planned">Planned</span>');
		expect(mine).toContain("<b>Feature request</b>");
		const one = await (await jane(deps)("/support/2")).text();
		expect(one).toContain("It&#39;s planned. The site&#39;s admin will say here when it&#39;s on the site.");
		// Jane replies: it needs an answer again, still planned.
		await jane(deps)("/support/2/reply", form({ body: "Great, thanks!" }));
		expect(await row(deps, 2)).toMatchObject({ stage: "planned", status: "open" });
		await admin(deps)("/admin/support/2/stage", form({ stage: "shipped" }));
		expect(await row(deps, 2)).toMatchObject({ stage: "shipped", status: "resolved" });
		expect((await (await jane(deps)("/support")).text())).toContain('<span class="tstat s-shipped">Shipped</span>');
		const log = (await deps.db.prepare("SELECT detail FROM admin_log WHERE action = 'support_status' ORDER BY id").all()).results;
		expect(log).toEqual([{ detail: "#2 planned" }, { detail: "#2 shipped" }]);
	});

	it("a reply on a feature request keeps its stage; one that's shipped or not planned stays closed", async () => {
		const deps = await setup();
		await admin(deps)("/admin/support/2/stage", form({ stage: "declined" }));
		await admin(deps)("/admin/support/2/message", form({ body: "We can't get the colours, sorry.", then: "reply" }));
		expect(await row(deps, 2)).toMatchObject({ stage: "declined", status: "resolved" });
		const page = await (await admin(deps)("/admin/support/2")).text();
		expect(page).not.toContain('value="resolve"');
		expect(page).toContain('<select name="stage">');
		expect(page).not.toContain('<select name="status">');
	});

	it("a stage is only for a feature request, and must be one of the four", async () => {
		const deps = await setup();
		expect((await admin(deps)("/admin/support/1/stage", form({ stage: "planned" }))).status).toBe(400);
		expect((await admin(deps)("/admin/support/2/stage", form({ stage: "someday" }))).status).toBe(400);
		expect(await row(deps, 1)).toMatchObject({ stage: null });
	});

	it("an admin can move a ticket to the other type: a question that's really an idea, or the other way", async () => {
		const deps = await setup();
		await admin(deps)("/admin/support/1/type", form({ kind: "feature" }));
		expect(await row(deps, 1)).toMatchObject({ kind: "feature", stage: null });
		await admin(deps)("/admin/support/2/stage", form({ stage: "considering" }));
		await admin(deps)("/admin/support/2/type", form({ kind: "support" }));
		expect(await row(deps, 2)).toMatchObject({ kind: "support", stage: null });
		const events = (await deps.db.prepare("SELECT body FROM support_messages WHERE kind = 'event' ORDER BY id").all()).results;
		expect(events).toContainEqual({ body: `${MANAGER} moved it to feature requests.` });
		expect(events).toContainEqual({ body: `${MANAGER} moved it to support questions.` });
		// The site's own tickets are always support.
		await deps.db.prepare(`INSERT INTO support_requests (source, alert_kind, title, topic, message, created_at, updated_at)
			VALUES ('site', 'images', 'Photos', 'platform', 'x', '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z')`).run();
		expect((await admin(deps)("/admin/support/3/type", form({ kind: "feature" }))).status).toBe(400);
	});
});
