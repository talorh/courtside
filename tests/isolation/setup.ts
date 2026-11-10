import { B12_1, createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { addTeam, G14_5, type Seeded, seedTeam } from "../helpers/two-teams.ts";

/** B12.1 and G14.5 with one of everything each; `a` is the team the requests are made in, `b` the other. */
export async function twoTeams(aFirst: boolean): Promise<{ deps: TestDeps; a: Seeded; b: Seeded }> {
	const deps = createTestDeps();
	await addTeam(deps.db, G14_5);
	const b12 = await seedTeam(deps, B12_1, "bzq");
	const g14 = await seedTeam(deps, G14_5, "gzq");
	return aFirst ? { deps, a: b12, b: g14 } : { deps, a: g14, b: b12 };
}

export const DIRECTIONS = [true, false] as const;

/** The Stream videos, live inputs and images that are `s`'s team's. */
export const mediaOf = (s: Seeded) => s.secrets.filter((x) => /^(stream|clip|img|input)-/.test(x));
