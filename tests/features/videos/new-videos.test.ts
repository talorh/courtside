import { describe, expect, it } from "vitest";
import { upsertMembers } from "../../../src/features/members/members-repository.ts";
import { enforceRetention } from "../../../src/features/videos/retention-service.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

const NEW_TAG = '<span class="t new">New</span>';

async function withGran() {
	const deps = createTestDeps();
	await upsertMembers(deps.db, deps.team.id, [{ email: "gran@x.com", name: "Gran", role: "watcher" }]);
	return { deps, gran: makeClient(deps, "gran@x.com") };
}

describe("new games", () => {
	it("marks games you haven't opened as New until you open them", async () => {
		const { deps, gran } = await withGran();
		const game = await seedGame(deps);
		await seedVideo(deps, { gameId: game, streamUid: "a" });
		expect(await (await gran("/games")).text()).toContain(NEW_TAG);
		const home = await (await gran("/")).text();
		expect(home).toContain('<span class="newcount">1 new</span>');
		expect(home).toContain(`Latest game ${NEW_TAG}`);
		await gran(`/games/${game}`);
		expect(await (await gran("/games")).text()).not.toContain(NEW_TAG);
		expect(await (await gran("/")).text()).not.toContain("newcount");
	});

	it("isn't New to the person who uploaded it, nor after 21 days", async () => {
		const { deps, gran } = await withGran();
		await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "a" });
		expect(await (await makeClient(deps)("/games")).text()).not.toContain(NEW_TAG);
		const old = await seedGame(deps, { startsAt: "2026-09-01T10:00", opponent: "Old Game" });
		await seedVideo(deps, { gameId: old, streamUid: "b", createdAt: "2026-09-20T03:00:00.000Z" });
		expect((await (await gran("/games")).text()).match(/class="t new"/g)).toHaveLength(1);
	});

	it("forgets who opened what after 30 days", async () => {
		const { deps, gran } = await withGran();
		const game = await seedGame(deps);
		await seedVideo(deps, { gameId: game, streamUid: "a" });
		await gran(`/games/${game}`);
		const count = () => deps.db.prepare("SELECT COUNT(*) AS n FROM video_views").first<number>("n");
		await enforceRetention(deps);
		expect(await count()).toBe(1);
		await enforceRetention({ ...deps, now: () => new Date("2026-11-20T00:00:00Z") });
		expect(await count()).toBe(0);
	});
});
