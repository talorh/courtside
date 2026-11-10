import { describe, expect, it } from "vitest";
import { assertWritable, teamContext } from "../../src/app/team-context.ts";
import { loadViewer } from "../../src/auth/viewer.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../helpers/two-teams.ts";

describe("the membership a team request runs as", () => {
	it("is the person's own, with deps for that team", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db);
		const id = await addMember(deps.db, G14_5.id, "p@x.com", "watcher");
		const ctx = await teamContext(deps, await loadViewer(deps.db, "p@x.com", new Date()), G14_5);
		expect(ctx).toMatchObject({ team: G14_5, member: { id, role: "watcher", hidden: false }, viewAs: null });
		expect(ctx?.deps.team).toBe(G14_5);
	});

	it("is nothing for someone who isn't in the team and isn't an admin, and makes no membership for them", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db);
		await addMember(deps.db, deps.team.id, "p@x.com", "watcher");
		expect(await teamContext(deps, await loadViewer(deps.db, "p@x.com", new Date()), G14_5)).toBeNull();
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM members WHERE team_id = ?").bind(G14_5.id).first("n")).toBe(0);
	});
});

describe("a closed team", () => {
	const closed = { ...G14_5, status: "closed" as const };
	it("refuses writes not marked for closed teams, with the team's name", () => {
		expect(() => assertWritable(closed, "POST", false)).toThrow("Saints G14.5's season is over, so its site is read-only.");
		for (const ok of [() => assertWritable(closed, "GET", false), () => assertWritable(closed, "HEAD", false), () => assertWritable(closed, "POST", true), () => assertWritable(G14_5, "POST", false)]) {
			expect(ok).not.toThrow();
		}
	});
});
