import { describe, expect, it } from "vitest";
import { films } from "../../src/auth/permissions.ts";
import { navFor } from "../../src/ui/layout.ts";
import { makeClient } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { addMember } from "../helpers/two-teams.ts";

describe("who films (goes live or uploads game footage)", () => {
	it("films: everyone but Watch only", () => {
		expect((["watcher", "filmer", "coach", "manager"] as const).filter(films)).toEqual(["filmer", "coach", "manager"]);
		const keys = (role: Parameters<typeof navFor>[0]) => navFor(role).map((i) => i.key);
		expect(keys("watcher")).not.toContain("upload");
		expect(keys("watcher")).not.toContain("live");
		for (const role of ["filmer", "coach", "manager"] as const) expect(keys(role)).toEqual(expect.arrayContaining(["upload", "live"]));
		expect(keys("coach")).toEqual(expect.arrayContaining(["games", "roster", "fixture", "photos", "help"]));
	});

	it("gives a coach Upload video and Go live on the top bar and Home, as it does someone set to Watch and film; Watch only gets neither", async () => {
		const deps = createTestDeps();
		await addMember(deps.db, deps.team.id, "c@x.com", "coach", "Coach Bruce");
		await addMember(deps.db, deps.team.id, "w@x.com", "watcher", "Gran");
		const coach = makeClient(deps, "c@x.com");
		const home = await (await coach("/")).text();
		for (const href of ['href="/upload"', 'href="/live"']) expect(home, href).toContain(href);
		expect(await (await coach("/photos")).text()).toContain("Choose photos");
		expect(await (await coach("/roster")).text()).toContain('href="/roster/export.xlsx"');
		const watcher = await (await makeClient(deps, "w@x.com")("/")).text();
		for (const href of ['href="/upload"', 'href="/live"']) expect(watcher, href).not.toContain(href);
		expect((await makeClient(deps, "w@x.com")("/upload")).status).toBe(403);
	});
});
