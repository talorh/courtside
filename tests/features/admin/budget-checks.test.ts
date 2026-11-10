import { describe, expect, it } from "vitest";
import { budgetLevel, budgetWords, checkBudgets } from "../../../src/features/admin/budget-checks.ts";
import type { TeamCosts } from "../../../src/features/admin/costs-estimate.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

// A running team against its season's budget: over so far is urgent, estimated to go over warns; the alert says the worst.

const costs = (code: string, o: { budget: number | null; soFar: number; estimate: number; status?: "active" | "closed" }): TeamCosts => ({
	team: { id: `${code}-2026`, code, seasonStart: 2026, status: o.status ?? "active", createdAt: "2026-10-01T00:00:00.000Z", closedAt: null, budget: o.budget ?? 200, budgetDefault: o.budget === null, players: 10 },
	months: [], thisMonth: null, soFar: o.soFar, estimate: o.estimate, games: 0,
	perGame: { minutes: 60, clipMinutes: 0.5, watched: 0, gb: 5, own: { length: false, watched: false } },
});

describe("a team's budget", () => {
	it("is over (urgent) once it's cost more so far, on track to go over (a warning) once its estimate is more, else fine", () => {
		expect(budgetLevel(costs("b12.1", { budget: 50, soFar: 51, estimate: 90 }))).toBe("urgent");
		expect(budgetLevel(costs("b12.1", { budget: 50, soFar: 20, estimate: 60 }))).toBe("warn");
		expect(budgetLevel(costs("b12.1", { budget: 50, soFar: 20, estimate: 50 }))).toBe("ok");
		expect(budgetLevel(costs("b12.1", { budget: 5, soFar: 20, estimate: 60, status: "closed" }))).toBe("none");
	});

	it("says which team, and by how much", () => {
		expect(budgetWords(costs("b12.1", { budget: 30, soFar: 40, estimate: 90 }))).toBe("Saints B12.1: $40.00 so far of its $30.00 budget");
		expect(budgetWords(costs("b14.3", { budget: 30, soFar: 10, estimate: 45 }))).toBe("Saints B14.3: on track for $45.00 of its $30.00 budget");
	});

	it("raises one alert for every team, the worst first, and clears it once they're all within budget", async () => {
		const deps = createTestDeps();
		await checkBudgets(deps, [costs("b14.3", { budget: 30, soFar: 10, estimate: 45 }), costs("b12.1", { budget: 30, soFar: 40, estimate: 90 })]);
		const alert = () => deps.db.prepare("SELECT level, detail FROM platform_alerts WHERE kind = 'budget'").first<{ level: string; detail: string }>();
		expect(await alert()).toEqual({ level: "urgent", detail: "Saints B12.1: $40.00 so far of its $30.00 budget; Saints B14.3: on track for $45.00 of its $30.00 budget" });
		await checkBudgets(deps, [costs("b12.1", { budget: 100, soFar: 40, estimate: 90 })]);
		expect(await alert()).toEqual({ level: "ok", detail: "1 team is within budget" });
		expect(await deps.db.prepare("SELECT status FROM support_requests WHERE alert_kind = 'budget'").first("status")).toBe("resolved");
	});
});
