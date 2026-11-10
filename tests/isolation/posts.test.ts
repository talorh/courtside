// Isolation, writing: with two teams, no write made in one, with the other's ids or with
// none, changes anything of the other's: its rows, its videos, clips, live inputs or photos.
import { describe, expect, it } from "vitest";
import { buildRouter } from "../../src/app/routes.ts";
import { makeClient } from "../helpers/app.ts";
import { teamSnapshot } from "../helpers/two-teams.ts";
import { ROUTES } from "./route-table.ts";
import { DIRECTIONS, mediaOf, twoTeams } from "./setup.ts";

const POSTS = ROUTES.filter((r) => r.route.startsWith("POST "));

it("the table has every route the site has, and nothing else", () => {
	const routes = buildRouter().list().map((r) => `${r.method} ${r.path}`);
	expect([...new Set(ROUTES.map((r) => r.route))].sort()).toEqual([...new Set(routes)].sort());
});

describe.each(DIRECTIONS)("writing, with B12.1 first: %s", (aFirst) => {
	it.each(POSTS.map((r, i) => [`${r.route} (${i})`, r] as const))("%s changes nothing of the other team's", async (_name, route) => {
		const { deps, a, b } = await twoTeams(aFirst);
		const before = await teamSnapshot(deps.db, b.team.id);
		const client = makeClient(deps, { email: a.emails[route.as ?? "manager"], team: a.team.id });
		const { path, init } = route.ownOnly ? route.req(a, a) : route.req(b, a);
		const res = await client(path, init);
		if (!route.ownOnly) expect(res.status, route.route).toBe(route.foreign ?? 404);
		expect(await teamSnapshot(deps.db, b.team.id), route.route).toBe(before);
		const gone = [...deps.stream.deleted, ...deps.live.deletedInputs, ...deps.images.deleted];
		for (const media of mediaOf(b)) expect(gone, route.route).not.toContain(media);
	});
});
