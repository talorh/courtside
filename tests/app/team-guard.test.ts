import { describe, expect, it } from "vitest";
import { Router } from "../../src/app/router.ts";
import { writeTeam } from "../../src/app/team-guard.ts";
import { handleRequest } from "../../src/app/handle-request.ts";
import { buildAdminRouter } from "../../src/features/admin/admin-routes.ts";
import { ORIGIN, MANAGER } from "../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../helpers/two-teams.ts";

const B12 = "b12.1-2026";

function testRouter() {
	const router = new Router();
	// Echoes the team it ran as and a field of the form, so a test sees the handler still gets the whole body.
	router.post("/notes", "watcher", async ({ req, team }) => new Response(`${team.id}: ${(await req.formData()).get("body")}`));
	router.post("/api/save", "watcher", async ({ req, team }) => Response.json({ team: team.id, got: await req.text() }));
	return router;
}

/** A browser on `cookie`'s team posting `init` as both@x.com (in B12.1 and G14.5) unless `email` says otherwise. */
const post = (deps: TestDeps, path: string, init: RequestInit & { cookie?: string; email?: string }) =>
	handleRequest(new Request(`${ORIGIN}${path}`, { method: "POST", ...init, headers: { Origin: ORIGIN, Cookie: `team=${init.cookie ?? B12}`, ...init.headers } }),
		deps, async () => init.email ?? "both@x.com", testRouter(), buildAdminRouter());

async function twoTeams() {
	const deps = createTestDeps();
	await addTeam(deps.db);
	await addMember(deps.db, B12, "both@x.com", "filmer");
	await addMember(deps.db, G14_5.id, "both@x.com", "watcher");
	return deps;
}

const snapshot = async (deps: TestDeps) => JSON.stringify(await deps.db.prepare("SELECT * FROM members ORDER BY id").all());

describe("what a write says its team is", () => {
	it("is the page script's X-Courtside-Team, without reading the body", async () => {
		const req = new Request(`${ORIGIN}/api/x`, { method: "POST", headers: { "X-Courtside-Team": G14_5.id, "Content-Type": "multipart/form-data; boundary=x" }, body: "not a form" });
		expect(await writeTeam(req)).toEqual({ teamId: G14_5.id, from: "page-script" });
		expect(await req.text()).toBe("not a form");
	});
	it("is a form's _team field, read from a copy so the handler still gets the form", async () => {
		const req = new Request(`${ORIGIN}/notes`, { method: "POST", body: new URLSearchParams({ _team: B12, body: "Box out" }) });
		expect(await writeTeam(req)).toEqual({ teamId: B12, from: "form" });
		expect((await req.formData()).get("body")).toBe("Box out");
	});
	it("is nothing for a page from before the switchover, and a 400 for a body that isn't a readable form", async () => {
		expect(await writeTeam(new Request(`${ORIGIN}/notes`, { method: "POST", body: new URLSearchParams({ body: "x" }) }))).toBeNull();
		expect(await writeTeam(new Request(`${ORIGIN}/api/x`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }))).toBeNull();
		const broken = new Request(`${ORIGIN}/notes`, { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=x" }, body: "not a form" });
		await expect(writeTeam(broken)).rejects.toMatchObject({ status: 400 });
	});
});

describe("the guard on every write", () => {
	it("lets a form for the current team through, and the handler still reads the form", async () => {
		const deps = await twoTeams();
		const res = await post(deps, "/notes", { body: new URLSearchParams({ _team: B12, body: "Box out" }) });
		expect(await res.text()).toBe(`${B12}: Box out`);
	});

	it("refuses a form from a page of another team, naming the team you're on now, and changes nothing", async () => {
		const deps = await twoTeams();
		const before = await snapshot(deps);
		const res = await post(deps, "/notes", { cookie: G14_5.id, body: new URLSearchParams({ _team: B12, body: "Box out" }) });
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("You switched to Saints G14.5 in another window. Reload this page to carry on.");
		expect(await snapshot(deps)).toBe(before);
	});

	it("refuses a write that names no team (a page from before the switchover): JSON under /api/, the error page otherwise", async () => {
		const deps = await twoTeams();
		const api = await post(deps, "/api/save", { body: "{}", headers: { "Content-Type": "application/json" } });
		expect(api.status).toBe(409);
		expect(await api.json()).toEqual({ ok: false, error: { code: "site_updated", message: "The site has been updated. Reload the page to carry on." } });
		const page = await post(deps, "/notes", { body: new URLSearchParams({ body: "x" }) });
		expect(page.status).toBe(409);
		expect(await page.text()).toContain("The site has been updated. Reload the page to carry on.");
	});

	it("runs a page script's write as its page's team when you've switched since, so an upload or a live stream carries on", async () => {
		const deps = await twoTeams();
		const res = await post(deps, "/api/save", { cookie: G14_5.id, body: "part 7", headers: { "X-Courtside-Team": B12 } });
		expect(await res.json()).toEqual({ team: B12, got: "part 7" });
		expect(res.headers.get("Set-Cookie")).toBeNull();
	});

	it("refuses a page script's write for a team you can't open (any more), whatever it says", async () => {
		const deps = await twoTeams();
		await addMember(deps.db, B12, "p@x.com", "watcher");
		const res = await post(deps, "/api/save", { email: "p@x.com", body: "x", headers: { "X-Courtside-Team": G14_5.id } });
		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({ error: { code: "team_changed", message: "You switched to Saints B12.1 in another window. Reload this page to carry on." } });
		await deps.db.prepare("UPDATE members SET removed_at = '2026-10-28T00:00:00.000Z' WHERE team_id = ? AND email = 'both@x.com'").bind(G14_5.id).run();
		expect((await post(deps, "/api/save", { body: "x", headers: { "X-Courtside-Team": G14_5.id } })).status).toBe(409);
	});

	it("lets an admin's page script write to a team they were looking at, through their hidden way in", async () => {
		const deps = await twoTeams();
		const res = await post(deps, "/api/save", { email: MANAGER, body: "x", headers: { "X-Courtside-Team": G14_5.id } });
		expect(await res.json()).toEqual({ team: G14_5.id, got: "x" });
	});

	it("still refuses a cross-site post before reading anything", async () => {
		const deps = await twoTeams();
		const res = await post(deps, "/notes", { body: new URLSearchParams({ _team: B12, body: "x" }), headers: { Origin: "https://evil.test" } });
		expect(res.status).toBe(403);
	});
});
