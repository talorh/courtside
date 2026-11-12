import { describe, expect, it } from "vitest";
import { createGame } from "../../../src/features/games/games-repository.ts";
import { deleteGame, pickerGames, requireGame, toGameInput } from "../../../src/features/games/games-service.ts";
import { createTestDb } from "../../helpers/d1-sqlite.ts";
import { B12_1 } from "../../helpers/fakes.ts";

const TEAM = "b12.1-2026";
const base = { startsAt: "2026-10-18T09:00", competition: "VJBL" as const, roundLabel: "9", opponent: "Bayside Comets", venue: "Northside" };

describe("games service", () => {
	it("maps form fields (12-hour time), defaulting the opponent to TBC", () => {
		const form = { date: "2026-10-25", hour: 10, minute: 20, period: "am" as const, competition: "VJBL" as const, roundLabel: "10", phase: "" as const, opponent: "", venue: "Saints", video: "live" as const };
		expect(toGameInput(form)).toEqual({ startsAt: "2026-10-25T10:20", competition: "VJBL", roundLabel: "10", phase: null, opponent: "TBC", venue: "Saints" });
		expect(toGameInput({ ...form, hour: 6, minute: 40, period: "pm" }).startsAt).toBe("2026-10-25T18:40");
		expect(toGameInput({ ...form, hour: 12, minute: 5, period: "am" }).startsAt).toBe("2026-10-25T00:05");
		expect(toGameInput({ ...form, hour: 12, minute: 0, period: "pm" }).startsAt).toBe("2026-10-25T12:00");
	});
	it("throws 404 for a missing game", async () => {
		await expect(requireGame(createTestDb(), TEAM, 5)).rejects.toMatchObject({ status: 404 });
	});
	it("refuses to delete a game with video", async () => {
		const db = createTestDb();
		const id = await createGame(db, TEAM, base, 1);
		await db.prepare("INSERT INTO videos (team_id, game_id, status, delete_after) VALUES (?, ?, 'ready', 'x')").bind(TEAM, id).run();
		await expect(deleteGame(db, TEAM, id, new Date())).rejects.toMatchObject({ status: 409 });
	});
	it("offers every game dated in its team's season's two years, newest first, until the team's videos are due", async () => {
		const db = createTestDb();
		await createGame(db, TEAM, { ...base, startsAt: "2025-09-01T09:00" }, 1);
		const june = await createGame(db, TEAM, { ...base, startsAt: "2026-06-12T10:00" }, 1);
		const soon = await createGame(db, TEAM, base, 1);
		const next = await createGame(db, TEAM, { ...base, startsAt: "2027-02-01T18:40" }, 1);
		await createGame(db, TEAM, { ...base, startsAt: "2028-01-05T09:00" }, 1);
		// B12.1 is 2026/27's squad: its games in 2026 and 2027, whatever today's date.
		for (const now of ["2026-10-15T00:00:00Z", "2027-10-15T00:00:00Z"]) {
			expect((await pickerGames(db, B12_1, new Date(now))).map((r) => r.game.id)).toEqual([next, soon, june]);
		}
		// Once its videos are due (the end of 31 Dec 2027), none.
		expect(await pickerGames(db, B12_1, new Date("2027-12-31T13:00:00Z"))).toEqual([]);
	});
});
