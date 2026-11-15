import { describe, expect, it } from "vitest";
import { runDaily } from "../../src/jobs/daily.ts";
import { runSync } from "../../src/jobs/sync-videos.ts";
import { makeClient } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { addTeam } from "../helpers/two-teams.ts";

const ADMIN = "sam@saints.example";

/** A new install: the site's first admin (made by the first deploy) and nothing else, no team yet. */
async function newInstall() {
	const deps = createTestDeps();
	for (const table of ["players", "members", "teams"]) await deps.db.prepare(`DELETE FROM ${table}`).run();
	return { deps, admin: makeClient(deps, { email: ADMIN, team: null }) };
}

describe("a new install, before its first team", () => {
	it("sends the admin to the admin area from every page of the site, Which team? too, as there's no team to pick", async () => {
		const { admin } = await newInstall();
		for (const path of ["/", "/games", "/help", "/teams", "/teams?next=%2Fgames"]) {
			const res = await admin(path);
			expect([path, res.status, res.headers.get("Location")]).toEqual([path, 302, "/admin"]);
		}
		// The Home Screen app's spinner still opens first.
		expect((await admin("/?app")).status).toBe(200);
	});

	it("opens every page of the admin area", async () => {
		const { admin } = await newInstall();
		for (const path of ["/admin", "/admin/teams", "/admin/teams/new", "/admin/support", "/admin/platform", "/admin/costs", "/admin/admins", "/admin/log", "/admin/docs", "/admin/changelog"]) {
			expect([path, (await admin(path)).status]).toEqual([path, 200]);
		}
	});

	it("has Insights say how to get started where the site's numbers go, until the first team is onboarded", async () => {
		const { deps, admin } = await newInstall();
		const page = await (await admin("/admin")).text();
		const started = page.slice(page.indexOf("Get started"));
		expect(page.indexOf("Get started")).toBeGreaterThan(page.indexOf("Is the site all right?"));
		expect(started).toContain('href="/admin/teams/new"');
		expect(started).toContain('href="/admin/platform"');
		expect(started).toContain('href="/admin/docs#start"');
		expect(page).not.toContain("The site in numbers");
		await addTeam(deps.db);
		const after = await (await admin("/admin")).text();
		expect(after).toContain("The site in numbers");
		expect(after).not.toContain("Get started");
	});

	it("runs both jobs with nothing to do, and every check stays green", async () => {
		const { deps } = await newInstall();
		await runSync(deps);
		await runDaily(deps);
		const { results } = await deps.db.prepare("SELECT kind, level FROM platform_alerts WHERE level <> 'ok'").all();
		expect(results).toEqual([]);
	});

	it("tells anyone but an admin they aren't on a team's list", async () => {
		const { deps } = await newInstall();
		const res = await makeClient(deps, { email: "jordan@saints.example", team: null })("/");
		expect(res.status).toBe(403);
		expect(await res.text()).toContain("Not on a team&#39;s list yet");
	});
});
