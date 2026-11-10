import { afterEach, describe, expect, it, vi } from "vitest";
import { dayRate } from "../../../src/features/admin/costs-rate.ts";
import { createExchangeRates } from "../../../src/platform/exchange-rates.ts";
import { fakeFetch } from "../../helpers/fake-fetch.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

// The rate Costs shows Australian dollars at: the European Central Bank's, from Frankfurter, saved and read again after
// six hours; the last one saved when Frankfurter doesn't answer (a problem only once it's days old); a set rate before
// any's been read.

afterEach(() => vi.restoreAllMocks());

describe("the day's exchange rate", () => {
	it("reads USD to AUD from Frankfurter", async () => {
		const { calls, fetch } = fakeFetch({ body: { amount: 1, base: "USD", date: "2026-10-30", rates: { AUD: 1.4236 } } });
		expect(await createExchangeRates({ fetch }).usdToLocal()).toEqual({ localPerUsd: 1.4236, date: "2026-10-30" });
		expect(calls.map((c) => c.url)).toEqual(["https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD"]);
	});

	it("takes a broken answer for no rate", async () => {
		const { fetch } = fakeFetch({ body: { rates: { AUD: 142.36 }, date: "2026-10-30" } });
		await expect(createExchangeRates({ fetch }).usdToLocal()).rejects.toThrow("Frankfurter: no USD to AUD rate");
		const { fetch: noDate } = fakeFetch({ body: { rates: { AUD: 1.42 }, date: "yesterday" } });
		await expect(createExchangeRates({ fetch: noDate }).usdToLocal()).rejects.toThrow("Frankfurter: no USD to AUD rate");
	});

	it("is saved and read again only after six hours, kept when Frankfurter's down, and set before any's been read", async () => {
		let now = new Date("2026-11-15T00:00:00.000Z");
		const deps = { ...createTestDeps(), now: () => now };
		vi.spyOn(console, "error").mockImplementation(() => {});
		deps.rates.down = true;
		expect(await dayRate(deps)).toEqual({ localPerUsd: 1.42, date: null, source: "set" });
		deps.rates.down = false;
		expect(await dayRate(deps)).toEqual({ localPerUsd: 1.5, date: "2026-11-13", source: "now" });
		now = new Date("2026-11-15T05:00:00.000Z");
		deps.rates.localPerUsd = 1.6;
		expect(await dayRate(deps)).toEqual({ localPerUsd: 1.5, date: "2026-11-13", source: "saved" });
		now = new Date("2026-11-15T07:00:00.000Z");
		deps.rates.down = true;
		expect(await dayRate(deps)).toEqual({ localPerUsd: 1.5, date: "2026-11-13", source: "saved" });
		// Not asked again on every page while it's down: 15 minutes later.
		deps.rates.down = false;
		now = new Date("2026-11-15T07:10:00.000Z");
		expect((await dayRate(deps)).localPerUsd).toBe(1.5);
		now = new Date("2026-11-15T07:16:00.000Z");
		expect((await dayRate(deps)).localPerUsd).toBe(1.6);
		expect(deps.rates.calls).toBe(4);
	});

	it("a miss is a problem only with no saved rate, or one days old: a fresh one just carries on", async () => {
		let now = new Date("2026-11-15T00:00:00.000Z");
		const deps = { ...createTestDeps(), now: () => now };
		vi.spyOn(console, "error").mockImplementation(() => {});
		const problems = async () => (await deps.db.prepare("SELECT COUNT(*) AS n FROM problems WHERE what LIKE '%exchange rate%'").first<{ n: number }>())!.n;
		deps.rates.down = true;
		await dayRate(deps);
		expect(await problems()).toBe(1);
		deps.rates.down = false;
		await dayRate(deps);
		// Down again a day on, with yesterday's rate saved: kept quietly.
		now = new Date("2026-11-16T00:00:00.000Z");
		deps.rates.down = true;
		expect(await dayRate(deps)).toEqual({ localPerUsd: 1.5, date: "2026-11-13", source: "saved" });
		expect(await problems()).toBe(1);
		// Still down four days on: the saved rate is stale enough to say so.
		now = new Date("2026-11-19T00:00:00.000Z");
		await dayRate(deps);
		expect(await problems()).toBe(2);
	});
});
