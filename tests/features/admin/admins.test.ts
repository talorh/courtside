import { describe, expect, it } from "vitest";
import { removeAdmin } from "../../../src/features/admin/admins-service.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

const JANE = "jane@example.com";
const add = (deps: TestDeps, email: string, again = email, who = MANAGER) => makeClient(deps, who)("/admin/admins", form({ email, again }));
const remove = (deps: TestDeps, email: string, who = MANAGER) => makeClient(deps, who)("/admin/admins/remove", form({ email, confirm: "yes" }));
const admins = async (deps: TestDeps) => (await deps.db.prepare("SELECT email, added_by, removed_at IS NOT NULL AS removed FROM admins ORDER BY email").all()).results;
const log = async (deps: TestDeps) => (await deps.db.prepare("SELECT admin_email, action, detail FROM admin_log ORDER BY id").all()).results;

describe("the Admins page", () => {
	it("lists the admins, who added them and when, and says the maintenance page keeps its own list", async () => {
		const deps = createTestDeps();
		await add(deps, JANE);
		const page = await (await makeClient(deps)("/admin/admins")).text();
		expect(page).toMatch(new RegExp(`${MANAGER.replace(".", "\\.")} \\(you\\)`));
		expect(page).toContain(`${JANE}</b><span class="small">Added by ${MANAGER}, Thu 15 Oct 2026`);
		expect(page).toContain("Also add them to the maintenance page's list (<code>npm run maintenance -- deploy</code>), so they can get through during maintenance.");
		expect(page).toContain(`<input type="hidden" name="email" value="${JANE}">`);
		expect(page).not.toContain(`<input type="hidden" name="email" value="${MANAGER}">`);
	});

	it("adds an admin with the email typed twice, logged; they can open the admin area on their next request", async () => {
		const deps = createTestDeps();
		expect((await makeClient(deps, JANE)("/admin")).status).toBe(404);
		const res = await add(deps, " Jane@Example.com ", "jane@example.com");
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/admin/admins?done=added"]);
		expect(await admins(deps)).toContainEqual({ email: JANE, added_by: MANAGER, removed: 0 });
		expect(await log(deps)).toEqual([{ admin_email: MANAGER, action: "admin_added", detail: JANE }]);
		expect((await makeClient(deps, JANE)("/admin")).status).toBe(200);
	});

	it.each([
		[JANE, "jane@example.co", 400, "The two emails don&#39;t match."],
		["jane@", "jane@", 400, "&quot;jane@&quot; isn&#39;t an email address."],
		[MANAGER, MANAGER, 409, `${MANAGER} is an admin already.`],
	])("refuses %s / %s, keeping what was typed", async (email, again, status, message) => {
		const deps = createTestDeps();
		const res = await add(deps, email, again);
		expect(res.status).toBe(status);
		const page = await res.text();
		expect(page).toContain(message);
		expect(page).toContain(`name="email" type="email" required maxlength="254" autocomplete="off" value="${email}"`);
		expect((await log(deps)).length).toBe(0);
	});

	it("brings back someone removed before", async () => {
		const deps = createTestDeps();
		await add(deps, JANE);
		await remove(deps, JANE);
		expect((await add(deps, JANE)).status).toBe(303);
		expect(await admins(deps)).toContainEqual({ email: JANE, added_by: MANAGER, removed: 0 });
	});
});

describe("removing an admin", () => {
	it("asks first, logs it, and takes away their admin area and hidden ways into teams, not their real teams", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		await add(deps, JANE);
		await addMember(deps.db, deps.team.id, JANE, "watcher", "Jane");
		await makeClient(deps, { email: JANE, adminTeam: G14_5.id })("/");
		expect(await deps.db.prepare("SELECT hidden FROM members WHERE team_id = ? AND email = ? AND removed_at IS NULL").bind(G14_5.id, JANE).first("hidden")).toBe(1);
		expect((await makeClient(deps)("/admin/admins/remove", form({ email: JANE }))).status).toBe(400);
		const res = await remove(deps, JANE);
		expect(res.headers.get("Location")).toBe("/admin/admins?done=removed");
		expect((await makeClient(deps, JANE)("/admin")).status).toBe(404);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM members WHERE team_id = ? AND email = ? AND removed_at IS NULL").bind(G14_5.id, JANE).first("n")).toBe(0);
		expect(await deps.db.prepare("SELECT role FROM members WHERE team_id = ? AND email = ? AND removed_at IS NULL").bind(deps.team.id, JANE).first("role")).toBe("watcher");
		expect((await log(deps)).map((l) => [l.action, l.detail])).toEqual([["admin_added", JANE], ["team_opened", ""], ["admin_removed", JANE]]);
	});

	it("never removes yourself", async () => {
		const deps = createTestDeps();
		await add(deps, JANE);
		const self = await remove(deps, MANAGER);
		expect(self.status).toBe(409);
		expect(await self.text()).toContain("You can&#39;t remove yourself: another admin can.");
		expect((await admins(deps)).filter((r) => r.removed === 0)).toHaveLength(2);
	});

	it("never leaves no admin, even when two admins remove each other at the same moment", async () => {
		const deps = createTestDeps();
		await add(deps, JANE);
		await removeAdmin(deps, MANAGER, JANE);
		// Jane's own request, begun while she was still an admin, arrives a moment later.
		await expect(removeAdmin(deps, JANE, MANAGER)).rejects.toThrow("There must always be an admin: add another first.");
		expect((await admins(deps)).filter((r) => r.removed === 0).map((r) => r.email)).toEqual([MANAGER]);
	});
});
