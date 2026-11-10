import { describe, expect, it } from "vitest";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// Spoilers on or off. Each member can hide scores (on Watch games and the game page);
// hidden means no score and no result word anywhere. Scores show unless the member hides them.
const PAT = "p@x.com";
async function scored() {
	const deps = createTestDeps();
	const gameId = await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "Lakeside" });
	await seedVideo(deps, { gameId, streamUid: "u-lakeside" });
	await makeClient(deps)(`/games/${gameId}/score`, form({ ours: "34", opponent: "28" }));
	await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, 'Pat', 'watcher')").bind(deps.team.id, PAT).run();
	return { deps, gameId };
}
const pages = (gameId: number) => ["/games", `/games/${gameId}`, "/fixture", "/"];
const hideFor = (deps: TestDeps, email: string, hide: "1" | "0", back = "/games") => makeClient(deps, email)("/me/scores", form({ hide, back }));

describe("spoilers: hide scores", () => {
	it("scores show until a member hides them; the switch is on Watch games and the game page and goes back there", async () => {
		const { deps, gameId } = await scored();
		const pat = makeClient(deps, PAT);
		for (const path of pages(gameId)) expect(await (await pat(path)).text()).toContain("Won 34 to 28");
		expect(await (await pat("/games")).text()).toContain('action="/me/scores"');
		expect(await (await pat(`/games/${gameId}`)).text()).toContain('action="/me/scores"');
		const res = await hideFor(deps, PAT, "1", `/games/${gameId}`);
		expect(res.status).toBe(303);
		expect(res.headers.get("Location")).toBe(`/games/${gameId}`);
		expect((await hideFor(deps, PAT, "1", "/games?c=VJBL")).headers.get("Location")).toBe("/games?c=VJBL");
	});

	it("hidden: no score or result anywhere (Watch games, the game page, the Fixture, Home), and Show scores brings them back", async () => {
		const { deps, gameId } = await scored();
		await hideFor(deps, PAT, "1");
		const pat = makeClient(deps, PAT);
		for (const path of pages(gameId)) {
			const page = await (await pat(path)).text();
			expect(page, path).not.toContain("34 to 28");
			expect(page, path).not.toMatch(/\b(Won|Lost|Drew) \d/);
		}
		expect(await (await pat(`/games/${gameId}`)).text()).toContain("<dt>Result</dt><dd>Hidden</dd>");
		expect(await (await pat("/games")).text()).toContain("Show scores");
		await hideFor(deps, PAT, "0");
		expect(await (await pat("/games")).text()).toContain("Won 34 to 28");
	});

	it("one member's choice is only theirs; a team manager who hides scores gets an empty score form", async () => {
		const { deps, gameId } = await scored();
		await hideFor(deps, PAT, "1");
		const manager = makeClient(deps);
		expect(await (await manager("/games")).text()).toContain("Won 34 to 28");
		await hideFor(deps, "sam@saints.example", "1");
		const page = await (await manager(`/games/${gameId}`)).text();
		expect(page).not.toContain('value="34"');
		expect(page).toContain("You hide scores");
	});

	it("only goes back to Watch games or a game page", async () => {
		const { deps } = await scored();
		for (const back of ["https://evil.example/games", "//evil.example", "/games/../members", "/members", "/games?c=x&next=//evil"]) {
			expect((await hideFor(deps, PAT, "1", back)).status, back).toBe(400);
		}
	});
});
