import { afterEach, describe, expect, it, vi } from "vitest";
import { teamCosts } from "../../../src/features/admin/costs-estimate.ts";
import { loadCosts } from "../../../src/features/admin/costs-load.ts";
import type { MonthCost } from "../../../src/features/admin/costs-model.ts";
import { fixedAMonth } from "../../../src/features/admin/costs-prices.ts";
import { type CostTeam, saveMonths } from "../../../src/features/admin/costs-repository.ts";
import { saveSpentMonths } from "../../../src/features/admin/costs-saved.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { addTeam, G14_5 } from "../../helpers/two-teams.ts";

// Costs' spent months, saved once they've been over a week and read from then on as they were: a video or a team
// deleted later changes nothing in the months already spent.

afterEach(() => vi.restoreAllMocks());

const cloudflare = (minutesByVideo: () => Promise<[]> = async () => []) => ({ figures: async () => { throw new Error("not this"); }, minutesByVideo });

async function twoTeams(now: string) {
	const deps = { ...createTestDeps(new Date(now)), cloudflare: cloudflare() };
	await addTeam(deps.db);
	await deps.db.prepare("UPDATE teams SET created_at = '2026-10-01T00:00:00.000Z'").run();
	const video = await seedVideo(deps, { gameId: await seedGame(deps, { startsAt: "2026-10-10T10:00" }), streamUid: "uid-b12", createdAt: "2026-10-10T03:00:00.000Z" });
	return { deps, video };
}

const monthOf = async (deps: Parameters<typeof loadCosts>[0], team: string, month: string) =>
	(await loadCosts(deps)).costs.find((c) => c.team.id === team)?.months.find((m) => m.month === month);

describe("Costs' spent months, saved", () => {
	it("saves a month with a credit on the bill as billed, below zero", async () => {
		const deps = createTestDeps();
		const credit = { month: "2026-10", teamId: deps.team.id, storage: 1, viewing: -0.5, uploads: 0, shared: 2, billed: 1, billedDays: 31, stored: 40, gbMonths: 0, watched: 12 };
		await saveMonths(deps.db, [credit], "2026-11-08T00:00:00.000Z");
		expect(await deps.db.prepare("SELECT viewing FROM cost_months WHERE month = '2026-10'").first("viewing")).toBe(-0.5);
	});
	it("keeps a month as it was once it's been over a week: a video hard-deleted or a team deleted since changes nothing in it", async () => {
		const { deps, video } = await twoTeams("2026-12-08T16:00:00.000Z");
		expect(await saveSpentMonths(deps, await loadCosts(deps))).toBe(4);
		const saved = await deps.db.prepare("SELECT month, team_id AS teamId FROM cost_months ORDER BY month, team_id").all();
		expect(saved.results).toEqual([
			{ month: "2026-10", teamId: deps.team.id }, { month: "2026-10", teamId: G14_5.id }, { month: "2026-11", teamId: deps.team.id }, { month: "2026-11", teamId: G14_5.id },
		]);
		const october = await monthOf(deps, deps.team.id, "2026-10");
		expect(october).toMatchObject({ estimate: false, use: { stored: 2830 / 60 } });
		expect(october!.shared).toBeCloseTo(fixedAMonth() / 2, 6);
		await deps.db.prepare("DELETE FROM videos WHERE id = ?").bind(video).run();
		await deps.db.prepare("UPDATE teams SET status = 'deleted' WHERE id = ?").bind(G14_5.id).run();
		expect(await monthOf(deps, deps.team.id, "2026-10")).toEqual(october);
		// This month isn't over: it's worked out from what's there now, so B12.1 carries the fixed costs alone.
		expect((await monthOf(deps, deps.team.id, "2026-12"))!.shared).toBeCloseTo(fixedAMonth(), 6);
		// Saved once: a second night adds nothing.
		expect(await saveSpentMonths(deps, await loadCosts(deps))).toBe(0);
	});

	it("waits a week after a month ends, for Cloudflare's late figures, and never saves from a read that failed", async () => {
		const { deps } = await twoTeams("2026-12-07T16:00:00.000Z");
		expect(await saveSpentMonths(deps, await loadCosts(deps))).toBe(2);
		expect(await deps.db.prepare("SELECT DISTINCT month FROM cost_months").all()).toMatchObject({ results: [{ month: "2026-10" }] });
		vi.spyOn(console, "error").mockImplementation(() => {});
		const down = { ...deps, now: () => new Date("2026-12-09T16:00:00.000Z"), cloudflare: cloudflare(async () => { throw new Error("down"); }) };
		expect(await saveSpentMonths(down, await loadCosts(down))).toBe(0);
		const off = { ...deps, now: () => new Date("2026-12-09T16:00:00.000Z"), cloudflare: null };
		expect(await saveSpentMonths(off, await loadCosts(off))).toBe(0);
	});

	it("gives a team onboarded after a saved month nothing in it, even with a deleted team's id", () => {
		const team = (id: string, createdAt: string): CostTeam => ({ id, code: id, seasonStart: 2026, status: "active", createdAt, closedAt: null, budget: 200, budgetDefault: true, players: 10 });
		const row = (o: Partial<MonthCost>): MonthCost => ({ month: "2026-10", estimate: false, storage: 3, viewing: 1, uploads: 0, shared: 4, total: 8, billed: 1, billedDays: 31, use: { stored: 1500, gbMonths: 0, watched: 1000 }, ...o });
		const saved = new Map([["2026-10", new Map([["a", row({})], ["b", row({ shared: 2, total: 6 })]])]]);
		const [a, b] = teamCosts({ teams: [team("a", "2026-10-01T00:00:00.000Z"), team("b", "2026-11-02T00:00:00.000Z")], items: [], views: [], now: new Date("2026-11-15T00:00:00.000Z"), minutesBoughtNow: null, saved });
		expect(a!.months[0]).toEqual(row({}));
		expect(b!.months[0]).toMatchObject({ month: "2026-10", total: 0, use: { stored: 0 } });
		// November isn't saved: worked out, b sharing from the day it was onboarded.
		expect(a!.months[1]!.shared).toBeCloseTo(fixedAMonth() / (1 + 29 / 30), 6);
	});
});
