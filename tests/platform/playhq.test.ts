import { describe, expect, it } from "vitest";
import { createPlayhqClient } from "../../src/platform/playhq.ts";
import { fakeFetch } from "../helpers/fake-fetch.ts";

const fake = (status: number, body: unknown) => {
	const { calls, fetch } = fakeFetch({ status, body });
	return { calls, fetchImpl: fetch };
};

const court = (venue: string, name: string) => ({ name, venue: { name: venue } });

describe("PlayHQ client", () => {
	it("reads a game's result: its status, each side's team and score (the feed's own answer)", async () => {
		const { calls, fetchImpl } = fake(200, { data: { discoverGame: {
			status: { value: "FINAL" }, result: { home: { score: 66 }, away: { score: 29 } }, home: { id: "8fab8b8c" }, away: { id: "22e3b51f" },
		} } });
		expect(await createPlayhqClient({ fetch: fetchImpl }).gameResult("example-association", "494181a2")).toEqual({
			status: "FINAL", home: { teamId: "8fab8b8c", score: 66 }, away: { teamId: "22e3b51f", score: 29 },
		});
		expect(JSON.parse(String(calls[0]!.init.body)).variables).toEqual({ gameID: "494181a2" });
	});
	it("a game not played yet has no score; a game PlayHQ doesn't have is null; a failed read throws", async () => {
		const upcoming = fake(200, { data: { discoverGame: { status: { value: "UPCOMING" }, result: null, home: { id: "8fab8b8c" }, away: {} } } });
		expect(await createPlayhqClient({ fetch: upcoming.fetchImpl }).gameResult("example-association", "g")).toEqual({
			status: "UPCOMING", home: { teamId: "8fab8b8c", score: null }, away: { teamId: null, score: null },
		});
		const missing = fake(200, { data: { discoverGame: null } });
		expect(await createPlayhqClient({ fetch: missing.fetchImpl }).gameResult("example-association", "x")).toBeNull();
		const broken = fake(400, { errors: [{ message: "Cannot query field" }] });
		await expect(createPlayhqClient({ fetch: broken.fetchImpl }).gameResult("example-association", "x")).rejects.toThrow("PlayHQ result failed (400): Cannot query field");
	});
	it("reads a team's games: opponent, round, date, time and venue", async () => {
		const { calls, fetchImpl } = fake(200, { data: {
			discoverTeam: { id: "8fab8b8c", name: "Saints U12 Boys 1", season: { name: "2025/26" }, grade: { name: "U12 Boys - VJL1 (P1)" } },
			discoverTeamFixture: [
				{ name: "Round 1", grade: { name: "12 Boys Grading 1 - Pool 2C" }, fixture: { games: [{ id: "494181a2", date: "2026-03-06", grade: { name: "12 Boys Grading 1 - Pool 2C" }, allocation: { time: "18:40:00", dateTimeList: null, court: court("Saints Stadium", "Court 1") },
					home: { id: "8fab8b8c", name: "Saints U12 Boys 1" }, away: { id: "22e3b51f", name: "Hillcrest U12 Boys 3" } }] } },
				{ name: "Finals Round 1", grade: { name: "U12 Boys - VJL1 (P1)" }, fixture: { games: [{ id: "f1", date: null, allocation: { time: null, dateTimeList: [{ date: "2026-08-21", time: "19:40:00" }], court: null },
					home: { name: "1st Pool A" }, away: { id: "8fab8b8c", name: "Saints U12 Boys 1" } }] } },
				{ name: "Round 2", fixture: { games: [{ id: "nodate", date: null, allocation: null, home: null, away: null },
					{ id: "baddate", date: "TBC", allocation: null, home: null, away: null }, { id: "g2", date: "2026-03-13", allocation: null, home: null, away: null }] } },
				{ name: "Round 1 again", fixture: { games: [{ id: "494181a2", date: "2026-03-06", allocation: null, home: null, away: null }] } },
				{ name: "Round 3", fixture: null },
			],
		} });
		const team = await createPlayhqClient({ fetch: fetchImpl }).teamFixture("example-association", "8fab8b8c");
		expect(team).toEqual({ name: "Saints U12 Boys 1 · U12 Boys - VJL1 (P1) · 2025/26", games: [
			{ id: "494181a2", round: "Round 1", date: "2026-03-06", time: "18:40", opponent: "Hillcrest U12 Boys 3", venue: "Saints Stadium, Court 1", grade: "12 Boys Grading 1 - Pool 2C" },
			{ id: "f1", round: "Finals Round 1", date: "2026-08-21", time: "19:40", opponent: "1st Pool A", venue: "", grade: "U12 Boys - VJL1 (P1)" },
			{ id: "g2", round: "Round 2", date: "2026-03-13", time: null, opponent: null, venue: "", grade: "U12 Boys - VJL1 (P1)" },
		] });
		// The grade is asked for on each game (a game without one takes its round's, then the team's).
		expect(JSON.parse(String(calls[0]!.init.body)).query).toMatch(/games \{[^}]*grade \{ name \}/);
		expect(calls[0]!.url).toBe("https://api.playhq.com/graphql");
		const headers = calls[0]!.init.headers as Record<string, string>;
		expect(headers.tenant).toBe("example-association");
		expect(headers.Origin).toBe("https://www.playhq.com");
		expect(JSON.parse(String(calls[0]!.init.body)).variables).toEqual({ teamID: "8fab8b8c" });
	});
	it("returns null for a team PlayHQ doesn't have, and fails when PlayHQ can't be read", async () => {
		const missing = fake(200, { data: { discoverTeam: null, discoverTeamFixture: null } });
		expect(await createPlayhqClient({ fetch: missing.fetchImpl }).teamFixture("example-association", "x")).toBeNull();
		const partial = fake(200, { data: { discoverTeam: { id: "x", name: "X" }, discoverTeamFixture: null }, errors: [{ message: "fixture unavailable" }] });
		await expect(createPlayhqClient({ fetch: partial.fetchImpl }).teamFixture("example-association", "x")).rejects.toThrow("fixture unavailable");
		const blocked = fake(403, {});
		await expect(createPlayhqClient({ fetch: blocked.fetchImpl }).teamFixture("example-association", "x")).rejects.toThrow("PlayHQ fixture failed (403)");
	});
});
