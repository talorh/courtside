// Isolation, reading: with two teams, every page a member of one can open shows nothing
// of the other's, and the other team's ids are "not found".
import { describe, expect, it } from "vitest";
import { hasRole, ROLES } from "../../src/auth/permissions.ts";
import { buildRouter } from "../../src/app/routes.ts";
import { makeClient } from "../helpers/app.ts";
import { opens, ROUTES } from "./route-table.ts";
import { DIRECTIONS, twoTeams } from "./setup.ts";

const minRole = new Map(buildRouter().list().map((r) => [`${r.method} ${r.path}`, r.minRole]));
const GETS = ROUTES.filter((r) => r.route.startsWith("GET "));
const textOf = async (res: Response) => (/text|json/.test(res.headers.get("Content-Type") ?? "") ? res.text() : "");

describe.each(DIRECTIONS)("reading, with B12.1 first: %s", (aFirst) => {
	it("every page each role can open answers, and shows nothing of the other team's", async () => {
		const { deps, a, b } = await twoTeams(aFirst);
		for (const role of ROLES) {
			const client = makeClient(deps, { email: a.emails[role], team: a.team.id });
			for (const route of GETS.filter((r) => opens(role, r, minRole.get(r.route)!))) {
				const res = await client(route.req(a, a).path);
				expect(res.status, `${role} ${route.route}`).toBeLessThan(400);
				const body = await textOf(res);
				for (const secret of b.secrets) expect(body, `${role} ${route.route} shows ${secret}`).not.toContain(secret);
			}
		}
	});

	it("the other team's ids are not found, and say nothing of it, to someone only in this team", async () => {
		const { deps, a, b } = await twoTeams(aFirst);
		for (const role of ["watcher", "coach"] as const) {
			const client = makeClient(deps, { email: a.emails[role], team: a.team.id });
			for (const route of GETS.filter((r) => r.req(a, a).path !== r.req(b, a).path && hasRole(role, minRole.get(r.route)!))) {
				const res = await client(route.req(b, a).path);
				expect(res.status, `${role} ${route.route}`).toBe(route.foreign ?? 404);
				const body = await textOf(res);
				for (const secret of b.secrets) expect(body, `${role} ${route.route} shows ${secret}`).not.toContain(secret);
			}
		}
	});
});
