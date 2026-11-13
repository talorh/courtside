import { describe, expect, it } from "vitest";
import { createTestDeps } from "../../helpers/fakes.ts";

// The example club plays in the VJBL; another club's league is whatever club.ts says, so the schema names none.
describe("a club whose league isn't the example club's", () => {
	it("can add a game and a PlayHQ fixture in its league: the schema doesn't name one", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO games (team_id, starts_at, competition, created_by) VALUES (?, '2026-10-16T18:40', 'NBL1', 1)").bind(deps.team.id).run();
		await deps.db.prepare("INSERT INTO playhq_fixtures (team_id, competition, playhq_team_id, url, name, created_at) VALUES (?, 'NBL1', 'abcd1234', 'https://www.playhq.com/x', 'X', '2026-10-01T00:00:00.000Z')").bind(deps.team.id).run();
		const games = await deps.db.prepare("SELECT competition FROM games WHERE team_id = ?").bind(deps.team.id).all();
		const fixtures = await deps.db.prepare("SELECT competition FROM playhq_fixtures WHERE team_id = ?").bind(deps.team.id).all();
		expect([games.results, fixtures.results]).toEqual([[{ competition: "NBL1" }], [{ competition: "NBL1" }]]);
	});
	it("keeps the games' other rules: a video still needs its game, and a game's phase is one of the season's", async () => {
		const deps = createTestDeps();
		await expect(deps.db.prepare("INSERT INTO videos (team_id, game_id, status, delete_after) VALUES (?, 999, 'ready', 'x')").bind(deps.team.id).run()).rejects.toThrow(/FOREIGN KEY/);
		await expect(deps.db.prepare("INSERT INTO games (team_id, starts_at, competition, phase) VALUES (?, '2026-10-16T18:40', 'NBL1', 'finals')").bind(deps.team.id).run()).rejects.toThrow(/CHECK/);
	});
	it("keeps the Costs rate for whatever currency the club counts in", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO exchange_rates (pair, rate, rate_date, fetched_at) VALUES ('USD/NZD', 1.7, '2026-10-15', '2026-10-15T00:00:00.000Z')").run();
		expect((await deps.db.prepare("SELECT pair FROM exchange_rates").all()).results).toEqual([{ pair: "USD/NZD" }]);
	});
});
