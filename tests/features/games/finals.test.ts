import { describe, expect, it } from "vitest";
import { isFinalsGame } from "../../../src/features/games/game-format.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// A finals game (its round says so, as PlayHQ names them) is picked out with a gold border wherever the game is listed.
describe("finals games", () => {
	it("knows a final from its round's name, however it's written; an ordinary round isn't one", () => {
		for (const round of ["Semi Final", "Grand Final", "Preliminary Final", "Elimination Final", "Finals Round 1", "semi-final", "Quarterfinal", "QUARTER FINALS", "Final"]) {
			expect(isFinalsGame({ roundLabel: round }), round).toBe(true);
		}
		for (const round of ["9", "Round 4", "", "Pool A Game 2", "Practice match", "Finalists' lunch", "Semi"]) {
			expect(isFinalsGame({ roundLabel: round }), round).toBe(false);
		}
	});
	it("Watch games: a final's card has the gold border, whatever state it's in; other games' cards don't", async () => {
		const deps = createTestDeps();
		const semi = await seedGame(deps, { startsAt: "2026-10-04T10:20", roundLabel: "Semi Final", opponent: "Eltham 1" });
		const grand = await seedGame(deps, { startsAt: "2027-03-20T10:20", roundLabel: "Grand Final", opponent: "Casey 2" });
		const round = await seedGame(deps);
		await seedVideo(deps, { gameId: semi, streamUid: "a" });
		await seedVideo(deps, { gameId: round, streamUid: "b" });
		const page = await (await makeClient(deps)("/games")).text();
		expect(page).toContain(`<a class="game s-ready final" href="/games/${semi}">`);
		expect(page).toContain(`<a class="game s-upcoming final" href="/games/${grand}">`);
		expect(page).toContain(`<a class="game s-ready" href="/games/${round}">`);
	});
	it("the Fixture: a final's row has it, for families and for the team manager", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'p@x.com', 'watcher')").bind(deps.team.id).run();
		const semi = await seedGame(deps, { roundLabel: "Semi Final", opponent: "Eltham 1" });
		const round = await seedGame(deps, { startsAt: "2026-10-04T10:20" });
		for (const email of ["p@x.com", "sam@saints.example"]) {
			const page = await (await makeClient(deps, email)("/fixture")).text();
			expect(page, email).toMatch(new RegExp(`<tr class="final"><td class="f-date">[^<]*</td><td class="f-game"><a href="/games/${semi}">`));
			expect(page, email).toMatch(new RegExp(`<tr><td class="f-date">[^<]*</td><td class="f-game"><a href="/games/${round}">`));
		}
	});
	it("Home: the latest game's card and Coming up have it when that game is a final", async () => {
		const deps = createTestDeps();
		const semi = await seedGame(deps, { startsAt: "2026-10-04T10:20", roundLabel: "Semi Final", opponent: "Eltham 1" });
		await seedVideo(deps, { gameId: semi, streamUid: "a" });
		await seedGame(deps, { startsAt: "2027-03-20T10:20", roundLabel: "Grand Final", opponent: "Casey 2" });
		const page = await (await makeClient(deps)("/")).text();
		expect(page).toContain(`<a class="panel latest final" href="/games/${semi}">`);
		expect(page).toContain('<a class="panel next deskonly final" href="/fixture">');
	});
});
