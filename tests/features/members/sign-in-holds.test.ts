import { describe, expect, it } from "vitest";
import { heldEmails, holdEmail } from "../../../src/auth/sign-in-codes-repository.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

// Someone who asked for too many sign-in codes, or typed too many wrong ones, waits; their team manager can let them in
// sooner from Manage team.

const NOW = new Date("2026-10-15T00:00:00Z");
const IN_10_MIN = "2026-10-15T00:10:00.000Z";

describe("Waiting to sign in, on Manage team", () => {
	it("isn't there when nobody on the team is waiting, even if someone on another team is", async () => {
		const deps = createTestDeps(NOW);
		await addTeam(deps.db, G14_5);
		await addMember(deps.db, G14_5.id, "other@x.com", "watcher");
		await holdEmail(deps.db, "other@x.com", IN_10_MIN);
		const page = await (await makeClient(deps)("/manage")).text();
		expect(page).not.toContain("Waiting to sign in");
		expect(page).not.toContain("other@x.com");
	});
	it("lists a held person with when they can ask again, and Let them sign in ends the wait", async () => {
		const deps = createTestDeps(NOW);
		const id = await addMember(deps.db, deps.team.id, "Mum@X.com", "watcher", "Sam's mum");
		await holdEmail(deps.db, "mum@x.com", IN_10_MIN);
		const client = makeClient(deps);
		const page = await (await client("/manage")).text();
		expect(page).toContain('<section class="panel stack" id="held" aria-labelledby="held-h"><h2 id="held-h">Waiting to sign in</h2>');
		expect(page).toContain("<b>Sam&#39;s mum</b> <span class=\"small\">Mum@X.com, can ask again at 11:10am</span>");
		expect(page).toContain(`<form method="post" action="/members/${id}/sign-in"`);
		expect(page.indexOf("Waiting to sign in")).toBeLessThan(page.indexOf("Who's using the site"));
		const res = await client(`/members/${id}/sign-in`, form({}));
		expect([res.status, res.headers.get("Location")]).toEqual([303, "/manage?done=signin"]);
		expect(await heldEmails(deps.db, NOW.toISOString())).toEqual([]);
		const after = await (await client("/manage?done=signin")).text();
		expect(after).toContain("Done. They can ask for a new code now.");
		expect(after).not.toContain("Waiting to sign in");
	});
	it("is for team managers, and only for their own team's people", async () => {
		const deps = createTestDeps(NOW);
		await addTeam(deps.db, G14_5);
		const other = await addMember(deps.db, G14_5.id, "other@x.com", "watcher");
		await holdEmail(deps.db, "other@x.com", IN_10_MIN);
		expect((await makeClient(deps)(`/members/${other}/sign-in`, form({}))).status).toBe(404);
		const fam = await addMember(deps.db, deps.team.id, "fam@x.com", "watcher");
		await addMember(deps.db, deps.team.id, "film@x.com", "filmer");
		await holdEmail(deps.db, "fam@x.com", IN_10_MIN);
		expect((await makeClient(deps, "film@x.com")(`/members/${fam}/sign-in`, form({}))).status).toBe(403);
		expect((await heldEmails(deps.db, NOW.toISOString())).map((h) => h.email)).toEqual(["fam@x.com", "other@x.com"]);
	});
});
