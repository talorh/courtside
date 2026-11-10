import { describe, expect, it } from "vitest";
import { DUTIES, fillWeeks, type Slot, weekOf } from "../../../src/features/roster/roster-plan.ts";

const weeks = (n: number, video = (_i: number) => true) =>
	Array.from({ length: n }, (_, i) => ({ week: new Date(Date.UTC(2026, 9, 26 + 7 * i)).toISOString().slice(0, 10), video: video(i), games: [{ id: 100 + i, video: video(i) }] }));
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

describe("roster plan", () => {
	it("finds the Monday of a game's week", () => {
		expect(weekOf("2026-10-30")).toBe("2026-10-26"); // Friday
		expect(weekOf("2026-10-26")).toBe("2026-10-26"); // Monday
		expect(weekOf("2026-11-01")).toBe("2026-10-26"); // Sunday
	});
	it("shares every duty out evenly over a season, one duty per family per week", () => {
		const families = Array.from({ length: 10 }, (_, i) => i + 1);
		const slots = fillWeeks(weeks(22, (i) => i % 5 !== 3), families, []);
		for (const w of new Set(slots.map((s) => s.week))) {
			const inWeek = slots.filter((s) => s.week === w);
			expect(new Set(inWeek.map((s) => s.familyId)).size).toBe(inWeek.length);
		}
		expect(slots.filter((s) => s.duty === "video")).toHaveLength(18); // 4 weeks without video
		for (const duty of DUTIES) expect(spread(families.map((f) => slots.filter((s) => s.familyId === f && s.duty === duty).length))).toBeLessThanOrEqual(1);
		expect(spread(families.map((f) => slots.filter((s) => s.familyId === f).length))).toBeLessThanOrEqual(1);
	});
	it("keeps totals and every duty within one, for any number of families and season length, in a few milliseconds", () => {
		const started = performance.now();
		for (let n = 4; n <= 16; n++) for (const length of [3, 12, 30]) for (const gap of [0, 4]) {
			const families = Array.from({ length: n }, (_, i) => i + 1);
			const slots = fillWeeks(weeks(length, (i) => !gap || i % gap !== 1), families, []);
			const counts = (duty?: string) => families.map((f) => slots.filter((s) => s.familyId === f && (!duty || s.duty === duty)).length);
			expect(spread(counts())).toBeLessThanOrEqual(1);
			for (const duty of DUTIES) expect(spread(counts(duty))).toBeLessThanOrEqual(1);
		}
		// 78 seasons: about 130 ms on a computer and 600 on the shared build machine. The limit catches a search that
		// blows up (seconds to minutes), not a slow machine, so the deploy's own check can't fail on timing alone.
		expect(performance.now() - started).toBeLessThan(5000);
	});
	it("counts slots already held, and leaves slots empty when there aren't enough families", () => {
		const held: Slot[] = [{ week: "2026-10-26", duty: "video", position: 1, gameId: 100, familyId: 1 }];
		const slots = fillWeeks(weeks(2), [1, 2, 3, 4], held);
		expect(slots.filter((s) => s.week === "2026-10-26").map((s) => s.duty)).toEqual(["scoring", "scoring", "lollies"]);
		expect(slots.find((s) => s.week === "2026-11-02" && s.duty === "video")?.familyId).not.toBe(1);
		expect(fillWeeks(weeks(1), [1, 2, 3], [])).toHaveLength(3);
	});
	it("gives every game of a weekend its own two scorers; with too few families, one scores twice, never at the same game", () => {
		const weekend = { week: "2026-10-26", video: false, extra: false, games: [11, 12, 13].map((id) => ({ id, video: false })) };
		const plenty = fillWeeks([weekend], [1, 2, 3, 4, 5, 6, 7], []);
		expect(plenty.map((s) => `${s.duty}${s.position}g${s.gameId}`).sort()).toEqual(["scoring1g11", "scoring1g12", "scoring1g13", "scoring2g11", "scoring2g12", "scoring2g13"]);
		expect(new Set(plenty.map((s) => s.familyId)).size).toBe(6);
		const few = fillWeeks([weekend], [1, 2, 3, 4], []);
		expect(few).toHaveLength(6);
		for (const g of [11, 12, 13]) expect(new Set(few.filter((s) => s.gameId === g).map((s) => s.familyId)).size).toBe(2);
		const counts = [1, 2, 3, 4].map((f) => few.filter((s) => s.familyId === f).length);
		expect(counts.sort()).toEqual([1, 1, 2, 2]);
		// One family alone: once a game, as a game can't have the same family twice.
		expect(fillWeeks([weekend], [1], []).map((s) => s.gameId).sort()).toEqual([11, 12, 13]);
		// A week with one game: every slot says which game, and the fairness is as before.
		expect(fillWeeks([{ week: "2026-11-02", video: true, games: [{ id: 21, video: true }] }], [1, 2, 3, 4], []).map((s) => `${s.duty}g${s.gameId}`).sort()).toEqual(["lolliesg21", "scoringg21", "scoringg21", "videog21"]);
		// A weekend with every duty: each game its own lollies and video too, and a game that can't be filmed has no video slot.
		const all = fillWeeks([{ week: "2026-10-26", video: true, games: [{ id: 11, video: true }, { id: 12, video: false }] }], [1, 2, 3, 4, 5, 6, 7, 8], []);
		expect(all.map((s) => `${s.duty}g${s.gameId}`).sort()).toEqual(["lolliesg11", "lolliesg12", "scoringg11", "scoringg11", "scoringg12", "scoringg12", "videog11"]);
		expect(new Set(all.map((s) => s.familyId)).size).toBe(7);
	});
	it("never gives a family the same duty two weeks running while another family can as fairly", () => {
		const season = Array.from({ length: 20 }, (_, i) => ({ week: new Date(Date.UTC(2026, 9, 5 + 7 * i)).toISOString().slice(0, 10), video: true, games: [{ id: 200 + i, video: true }] }));
		for (const n of [5, 6, 7, 8]) {
			const slots = fillWeeks(season, Array.from({ length: n }, (_, i) => i + 1), []);
			const again = slots.filter((s, _, all) => all.some((p) => p.familyId === s.familyId && p.duty === s.duty && p.week === season[season.findIndex((w) => w.week === s.week) - 1]?.week));
			expect(again, `${n} families`).toEqual([]);
			const totals = Array.from({ length: n }, (_, i) => slots.filter((s) => s.familyId === i + 1).length);
			expect(Math.max(...totals) - Math.min(...totals), `${n} families`).toBeLessThanOrEqual(1);
		}
	});
	it("a family's second game of a weekend is never straight after its first, and goes to whoever has done that duty least", () => {
		// Seven families, three games scored already (one each but family 6), a fourth game added: 6 takes one spot, and
		// the other goes to a family who's scored least and isn't on the game before it, of those the one whose game is
		// furthest away (7 on the first game, not 4 on the second).
		const s = (week: string, duty: Slot["duty"], position: number, gameId: number, familyId: number): Slot => ({ week, duty, position, gameId, familyId });
		const held = [
			s("2026-10-19", "lollies", 1, 3, 4), s("2026-10-19", "scoring", 1, 3, 2), s("2026-10-19", "scoring", 2, 3, 3), s("2026-10-19", "video", 1, 3, 8),
			s("2026-10-26", "lollies", 1, 12, 7), s("2026-10-26", "scoring", 1, 12, 1), s("2026-10-26", "scoring", 2, 12, 5), s("2026-10-26", "video", 1, 12, 6),
			s("2026-11-02", "scoring", 1, 14, 2), s("2026-11-02", "scoring", 2, 14, 7), s("2026-11-02", "scoring", 1, 15, 3), s("2026-11-02", "scoring", 2, 15, 4),
			s("2026-11-02", "scoring", 1, 16, 5), s("2026-11-02", "scoring", 2, 16, 1),
		];
		const weekend = { week: "2026-11-02", video: false, extra: false, games: [14, 15, 16, 17].map((id) => ({ id, video: false })) };
		const added = fillWeeks([weekend], [1, 2, 3, 4, 5, 6, 7], held);
		expect(added.map((x) => x.familyId).sort()).toEqual([6, 7]);
		// With nobody else free, a family still takes a game straight after its own rather than leaving it empty.
		const two = fillWeeks([{ week: "2026-11-02", video: false, extra: false, games: [21, 22].map((id) => ({ id, video: false })) }], [1, 2], []);
		expect(two).toHaveLength(4);
		// Four families, three games: the two who score twice never do two games in a row.
		const few = fillWeeks([{ week: "2026-10-26", video: false, extra: false, games: [11, 12, 13].map((id) => ({ id, video: false })) }], [1, 2, 3, 4], []);
		for (const f of [1, 2, 3, 4]) {
			const games = few.filter((x) => x.familyId === f).map((x) => x.gameId).sort();
			for (let i = 1; i < games.length; i++) expect(games[i]! - games[i - 1]!, `family ${f}: ${games}`).toBeGreaterThan(1);
		}
	});
});
