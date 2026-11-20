import { afterEach, describe, expect, it, vi } from "vitest";
import { mailAdmin, mailAdmins } from "../../../src/features/admin/admin-mail.ts";
import { lockPerson } from "../../../src/features/admin/users-service.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

// A locked person is no site admin and hears nothing from the site: no admins' email, no ticket given to them, no
// reply to a ticket they asked as a team manager, and no team's welcome.

afterEach(() => vi.restoreAllMocks());

const JANE = "jane@example.com";
const JO = "jo@example.com";
const STEPH = "steph@example.com";
const ASK = { topic: "videos", message: "A parent's upload stops at 80% every time.", contact: JANE };
const lockByHand = (deps: TestDeps, email: string) => deps.db.prepare("INSERT INTO locked_people (email, locked_by, locked_at) VALUES (?, ?, 'x')").bind(email, MANAGER).run();

/** G14.5 with Jane its team manager and Steph a parent; Jo a second admin. */
async function setup() {
	const deps = createTestDeps();
	await addTeam(deps.db, G14_5);
	await addMember(deps.db, G14_5.id, JANE, "manager", "Jane Citizen");
	await addMember(deps.db, G14_5.id, STEPH, "watcher", "Steph's mum");
	await deps.db.prepare("INSERT INTO admins (email, added_by, added_at) VALUES (?, ?, '2026-10-01T00:00:00.000Z')").bind(JO, MANAGER).run();
	return deps;
}

describe("a locked person and the site's admins", () => {
	it("can't be made a site admin: refused, saying why, and nobody is emailed", async () => {
		const deps = await setup();
		await lockPerson(deps, MANAGER, STEPH);
		const res = await makeClient(deps)("/admin/admins", form({ email: STEPH, again: STEPH }));
		expect(res.status).toBe(409);
		expect(await res.text()).toContain(`${STEPH} is locked: unlock them on Users first, then add them.`);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM admins WHERE email = ?").bind(STEPH).first("n")).toBe(0);
		expect(deps.email.sent).toEqual([]);
	});

	it("gets none of the admins' emails while locked, and no ticket given to them", async () => {
		const deps = await setup();
		await lockByHand(deps, JO.toUpperCase());
		expect(await mailAdmins(deps, { subject: "S", text: "T" })).toEqual({ sent: 1 });
		expect(deps.email.sent.map((e) => e.to)).toEqual([[MANAGER]]);
		expect(await mailAdmin(deps, JO, { subject: "S", text: "T" })).toBe("gone");
		await makeClient(deps, { email: JANE, team: G14_5.id })("/support", form(ASK));
		expect(deps.email.sent.at(-1)?.to).toEqual([MANAGER]);
		const given = await makeClient(deps)("/admin/support/1/assign", form({ to: JO }));
		expect(given.status).toBe(400);
		expect(await deps.db.prepare("SELECT assigned_to FROM support_requests WHERE id = 1").first("assigned_to")).toBeNull();
		const ticket = await (await makeClient(deps)("/admin/support/1")).text();
		expect(ticket).toContain(`<option value="${MANAGER}"`);
		expect(ticket).not.toContain(`<option value="${JO}"`);
	});

	it("a ticket a locked admin already owns keeps them as its owner, and Save with them still there changes nothing", async () => {
		const deps = await setup();
		await makeClient(deps, { email: JANE, team: G14_5.id })("/support", form(ASK));
		await makeClient(deps)("/admin/support/1/assign", form({ to: JO }));
		await lockByHand(deps, JO);
		const ticket = await (await makeClient(deps)("/admin/support/1")).text();
		expect(ticket).toMatch(new RegExp(`<option value="${JO}"[^>]*selected`));
		expect((await makeClient(deps)("/admin/support/1/assign", form({ to: JO }))).status).toBe(303);
		expect(await deps.db.prepare("SELECT assigned_to FROM support_requests WHERE id = 1").first("assigned_to")).toBe(JO);
		const queue = await (await makeClient(deps)("/admin/support")).text();
		expect(queue).toContain(`<option value="${JO}"`);
	});
});

describe("a locked team manager", () => {
	it("gets no email of an admin's reply to their ticket, and it isn't tried again", async () => {
		const deps = await setup();
		await makeClient(deps, { email: JANE, team: G14_5.id })("/support", form(ASK));
		await lockPerson(deps, MANAGER, JANE);
		deps.email.sent.length = 0;
		vi.spyOn(console, "log").mockImplementation(() => {});
		const res = await makeClient(deps)("/admin/support/1/message", form({ body: "Is it on Wi-Fi?", then: "reply" }));
		expect(res.headers.get("Location")).toBe("/admin/support/1?done=sent");
		expect(deps.email.sent).toEqual([]);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM support_messages WHERE emailed_at IS NULL AND email_to IS NOT NULL").first("n")).toBe(0);
	});

	it("gets no team's welcome: it says it didn't go", async () => {
		const deps = await setup();
		await lockPerson(deps, MANAGER, JANE);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await makeClient(deps)(`/admin/teams/${G14_5.id}/welcome`, form({}));
		expect(res.headers.get("Location")).toBe(`/admin/teams/${G14_5.id}/welcome?emailed=failed`);
		expect(deps.email.sent).toEqual([]);
	});
});
