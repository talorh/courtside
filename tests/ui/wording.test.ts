// Pages name their own team and its team manager: a team with no ask name never sees "Sam", "B12.1" or "U12 Boys".
// Help's own copy has its own tests.
import { describe, expect, it } from "vitest";
import { ROLES } from "../../src/auth/permissions.ts";
import { buildRouter } from "../../src/app/routes.ts";
import { makeClient } from "../helpers/app.ts";
import { opens, ROUTES } from "../isolation/route-table.ts";
import { twoTeams } from "../isolation/setup.ts";

const minRole = new Map(buildRouter().list().map((r) => [`${r.method} ${r.path}`, r.minRole]));
// Help's own copy has its own tests; the Changelog is the site's own history, in the admin area.
const NOT_HELP = (route: string) => !/^GET \/(help|faq|changelog)$/.test(route);
const B12 = /Sam|B12\.1|U12 Boys|12-1/;

describe("a team with no ask name, Saints G14.5", () => {
	it("every page, for every role, names it and its team manager, never Sam or B12.1", async () => {
		const { deps, b: g } = await twoTeams(true);
		for (const role of ROLES) {
			const client = makeClient(deps, { email: g.emails[role], team: g.team.id });
			for (const route of ROUTES.filter((r) => r.route.startsWith("GET ") && NOT_HELP(r.route) && opens(role, r, minRole.get(r.route)!))) {
				const res = await client(route.req(g, g).path);
				const type = res.headers.get("Content-Type") ?? "";
				const body = /text|json/.test(type) ? await res.text() : "";
				expect(body.match(B12)?.[0], `${role} ${route.route}`).toBeUndefined();
				if (type.startsWith("text/html")) expect(body, `${role} ${route.route}`).toContain("Saints G14.5");
			}
		}
	});

	// Two teams afresh for every write the site has: a while, with the whole suite running alongside.
	it("every write's answer, success or refusal, says the same", async () => {
		for (const route of ROUTES.filter((r) => r.route.startsWith("POST "))) {
			const { deps, b: g } = await twoTeams(true);
			const client = makeClient(deps, { email: g.emails[route.as ?? "manager"], team: g.team.id });
			const { path, init } = route.req(g, g);
			const res = await client(path, init);
			const body = /text|json/.test(res.headers.get("Content-Type") ?? "") ? await res.text() : "";
			expect(body.match(B12)?.[0], route.route).toBeUndefined();
		}
	}, 30_000);
});

describe("B12.1, whose team manager is Sam", () => {
	it("still says Sam where it did", async () => {
		const { deps, a } = await twoTeams(true);
		const page = await (await makeClient(deps, { email: a.emails.watcher, team: a.team.id })(`/games/${a.gameId}`)).text();
		expect(page).toContain("Sam (team manager) will see your request.");
	});
});
