import { describe, expect, it, vi } from "vitest";
import { teamCosts } from "../../../src/features/admin/costs-estimate.ts";
import { loadCosts } from "../../../src/features/admin/costs-load.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { peakStored } from "../../../src/features/admin/costs-model.ts";
import type { CostTeam, StoredItem } from "../../../src/features/admin/costs-repository.ts";

// Stream's storage bought, a block of 1,000 minutes at a time: a month that's over is priced by the most it held at
// once (what had to be bought), not by every minute that passed through it; the months ahead build on what's kept now.

const team = (id: string): CostTeam => ({ id, code: id, seasonStart: 2026, status: "active", createdAt: "2026-10-01T00:00:00.000Z", closedAt: null, budget: 200, budgetDefault: true, players: 10 });
const video = (minutes: number, createdAt: string, deletedAt: string | null = null): StoredItem => ({ teamId: "a", kind: "video", minutes, bytes: 0, createdAt, deletedAt });
// 1,700 kept, and three 200-minute test videos that come and go in November, never more than 1,900 at once.
const ITEMS = [video(1700, "2026-10-05T00:00:00.000Z"), video(200, "2026-11-02T00:00:00.000Z", "2026-11-03T00:00:00.000Z"),
	video(200, "2026-11-10T00:00:00.000Z", "2026-11-11T00:00:00.000Z"), video(200, "2026-11-20T00:00:00.000Z", "2026-11-21T00:00:00.000Z")];

describe("Stream's storage blocks", () => {
	it("finds the most a month held at once: what was there at its start, then each video in and out", () => {
		expect(peakStored("2026-11", ITEMS)).toBe(1900);
		expect(peakStored("2026-10", ITEMS)).toBe(1700);
		// One going as another comes, at the same moment, isn't both at once.
		expect(peakStored("2026-12", [video(600, "2026-12-01T00:00:00.000Z", "2026-12-05T00:00:00.000Z"), video(600, "2026-12-05T00:00:00.000Z")])).toBe(600);
		expect(peakStored("2027-01", [video(600, "2026-12-01T00:00:00.000Z", "2026-12-05T00:00:00.000Z")])).toBe(0);
	});

	it("prices a month that's over by its most at once, so test videos that came and went buy no block", () => {
		const [a] = teamCosts({ teams: [team("a")], items: ITEMS, views: [], now: new Date("2026-12-01T00:00:00.000Z"), minutesBoughtNow: 2000 });
		// 1,900 at most: the bundle's 1,000 and one $5 block, not the 2,300 that passed through.
		expect(a!.months.find((m) => m.month === "2026-11")!.storage).toBeCloseTo(5, 6);
	});

	it("prices a month that's over by the storage bought in it, as the site saw it, where it has a record", () => {
		const kept = [video(900, "2026-10-05T00:00:00.000Z")];
		const at = (bought: Map<string, number>) => teamCosts({ teams: [team("a")], items: kept, views: [], now: new Date("2026-12-02T00:00:00.000Z"), minutesBoughtNow: 2000, bought })[0]!
			.months.find((m) => m.month === "2026-11")!.storage;
		// 2,000 bought in November: its $5 block was billed, however little was stored.
		expect(at(new Map([["2026-11", 2000]]))).toBeCloseTo(5, 6);
		// No record of November: the most it held at once.
		expect(at(new Map())).toBe(0);
	});

	it("notes what Stream has bought as this month's, keeping the most it saw", async () => {
		const deps = createTestDeps(new Date("2026-11-19T00:00:00.000Z"));
		await loadCosts(deps);
		await deps.db.prepare("UPDATE stream_bought SET minutes = 5000").run();
		await loadCosts(deps);
		expect((await deps.db.prepare("SELECT month, minutes FROM stream_bought").all()).results).toEqual([{ month: "2026-11", minutes: 5000 }]);
	});

	it("shows Costs even when noting what's bought fails, and logs it", async () => {
		const deps = createTestDeps(new Date("2026-11-19T00:00:00.000Z"));
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		await deps.db.prepare("DROP TABLE stream_bought").run();
		await deps.db.prepare("CREATE TABLE stream_bought (month TEXT PRIMARY KEY, minutes INTEGER NOT NULL CHECK (minutes < 0), seen_at TEXT NOT NULL)").run();
		await expect(loadCosts(deps)).resolves.toMatchObject({ minutesBought: expect.any(Number) });
		expect(errors.mock.calls.some(([line]) => String(line).includes("stream_bought_failed"))).toBe(true);
	});

	it("builds the months ahead on what's kept now, not on what passed through this month", () => {
		const [a] = teamCosts({ teams: [team("a")], items: ITEMS, views: [], now: new Date("2026-11-25T00:00:00.000Z"), minutesBoughtNow: null });
		// December: 1,700 kept now and the games to come; the season's first months still under two blocks' worth.
		const dec = a!.months.find((m) => m.month === "2026-12")!;
		expect(dec.use.stored).toBeLessThan(2300 + 1);
		const [b] = teamCosts({ teams: [team("a")], items: [ITEMS[0]!], views: [], now: new Date("2026-11-25T00:00:00.000Z"), minutesBoughtNow: null });
		expect(dec.use.stored).toBe(b!.months.find((m) => m.month === "2026-12")!.use.stored);
	});
});
