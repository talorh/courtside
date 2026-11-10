import { describe, expect, it } from "vitest";
import { createFetchBudget, FetchBudgetSpent } from "../../src/platform/fetch-budget.ts";

describe("fetch budget", () => {
	it("lets the first calls through and refuses the rest without calling out", async () => {
		let calls = 0;
		const budget = createFetchBudget(2, (async () => { calls++; return new Response("ok"); }) as unknown as typeof fetch);
		await budget.fetch("https://a.test");
		await budget.fetch("https://a.test");
		await expect(budget.fetch("https://a.test")).rejects.toBeInstanceOf(FetchBudgetSpent);
		expect([calls, budget.used()]).toEqual([2, 2]);
	});
});
