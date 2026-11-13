import { describe, expect, it } from "vitest";
import { adoptByHand } from "../../../src/features/games/playhq-adopt.ts";
import type { PlayhqGame } from "../../../src/platform/playhq.ts";

const game = (id: string, date: string, time: string | null): PlayhqGame => ({ id, round: "Round 1", date, time, opponent: null, venue: "" });

describe("PlayHQ games taking over games added by hand", () => {
	it("pairs by time first, then by day, each hand-added game once, oldest first", () => {
		const byHand = [{ id: 1, date: "2026-11-21", time: "14:30" }, { id: 2, date: "2026-11-21", time: "12:00" }, { id: 3, date: "2026-11-22", time: "09:00" }];
		const taken = adoptByHand([game("a", "2026-11-21", "12:00"), game("b", "2026-11-21", "14:30"), game("c", "2026-11-22", "10:00")], byHand);
		expect([...taken]).toEqual([["a", 2], ["b", 1], ["c", 3]]);
	});
	it("a game PlayHQ gives no time yet takes the day's game left after the timed ones", () => {
		const byHand = [{ id: 1, date: "2026-11-21", time: "12:00" }, { id: 2, date: "2026-11-21", time: "14:30" }];
		const taken = adoptByHand([game("a", "2026-11-21", null), game("b", "2026-11-21", "14:30")], byHand);
		expect([...taken]).toEqual([["b", 2], ["a", 1]]);
	});
	it("takes nothing for a day with no hand-added game", () => {
		expect(adoptByHand([game("a", "2026-11-21", "12:00")], [{ id: 1, date: "2026-11-28", time: "12:00" }]).size).toBe(0);
	});
});
