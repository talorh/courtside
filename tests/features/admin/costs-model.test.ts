import { describe, expect, it } from "vitest";
import { teamCosts } from "../../../src/features/admin/costs-estimate.ts";
import { fixedAMonth } from "../../../src/features/admin/costs-prices.ts";
import type { CostTeam, SavedViews, StoredItem } from "../../../src/features/admin/costs-repository.ts";

// What each team costs, in Cloudflare's US dollars: its own use at Cloudflare's rates, and the site's fixed costs shared
// between the teams running that month by the days each ran; then the season's months left, estimated.

const team = (id: string, o: Partial<CostTeam> = {}): CostTeam => ({ id, code: id, seasonStart: 2026, status: "active", createdAt: "2026-10-01T00:00:00.000Z", closedAt: null, budget: 200, budgetDefault: true, players: 10, ...o });
const video = (teamId: string, minutes: number, createdAt = "2026-10-10T00:00:00.000Z", bytes = 0): StoredItem => ({ teamId, kind: "video", minutes, bytes, createdAt, deletedAt: null });
const watched = (teamId: string, month: string, minutes: number): SavedViews => ({ teamId, month, minutes, savedAt: "2026-11-01T00:00:00.000Z" });
const NOW = new Date("2026-11-15T00:00:00.000Z");
const cost = (o: { teams: CostTeam[]; items?: StoredItem[]; views?: SavedViews[]; bought?: number | null }) =>
	teamCosts({ teams: o.teams, items: o.items ?? [], views: o.views ?? [], now: NOW, minutesBoughtNow: o.bought ?? null });
const month = (c: ReturnType<typeof cost>[number], m: string) => c.months.find((x) => x.month === m)!;

describe("a team's month", () => {
	it("splits the site's fixed costs (Workers Paid, the bundle, the domain) equally between teams running all month", () => {
		const [a, b] = cost({ teams: [team("a"), team("b")] });
		expect(month(a!, "2026-10").shared).toBeCloseTo(fixedAMonth() / 2, 6);
		expect(month(b!, "2026-10").total).toBeCloseTo(fixedAMonth() / 2, 6);
		expect(fixedAMonth()).toBeCloseTo(11.18, 2);
	});

	it("shares by the days each team ran: one onboarded on 31 Oct pays a day's worth of October, nothing before", () => {
		const [a, b] = cost({ teams: [team("a"), team("b", { createdAt: "2026-10-31T00:00:00.000Z" })] });
		expect(month(a!, "2026-10").shared).toBeCloseTo((fixedAMonth() * 31) / 32, 6);
		expect(month(b!, "2026-10").shared).toBeCloseTo(fixedAMonth() / 32, 6);
		expect(month(b!, "2026-11").shared).toBeCloseTo(fixedAMonth() / 2, 6);
		const [, c] = cost({ teams: [team("a"), team("c", { createdAt: "2026-11-02T00:00:00.000Z" })] });
		expect(month(c!, "2026-10").total).toBe(0);
	});

	it("charges Stream storage bought past the bundle's 1,000 minutes by the minutes each team stores", () => {
		const [a, b] = cost({ teams: [team("a"), team("b")], items: [video("a", 1500), video("b", 500)] });
		// 2,000 minutes: the bundle's 1,000 and one more $5 block, a team's share by its minutes.
		expect(month(a!, "2026-10").storage).toBeCloseTo(3.75, 6);
		expect(month(b!, "2026-10").storage).toBeCloseTo(1.25, 6);
	});

	it("charges this month's storage as Stream has it bought", () => {
		const [a] = cost({ teams: [team("a")], items: [video("a", 100)], bought: 3000 });
		expect(month(a!, "2026-11").storage).toBeCloseTo(10, 6);
		expect(month(a!, "2026-10").storage).toBe(0);
	});

	it("charges minutes watched at US$1 a thousand, and splits minutes no team has between the running teams", () => {
		const views = [watched("a", "2026-10", 3000), watched("", "2026-10", 1000)];
		const [a, b] = cost({ teams: [team("a"), team("b")], views });
		expect(month(a!, "2026-10").viewing).toBeCloseTo(3, 6);
		expect(month(b!, "2026-10").viewing).toBe(0);
		expect(month(b!, "2026-10").shared).toBeCloseTo(fixedAMonth() / 2 + 0.5, 6);
	});

	it("charges R2 past its free 10 GB by each team's share of the originals, each kept 30 days", () => {
		const gb = 1024 ** 3;
		// Uploaded 1 Oct: in R2 the 30 days to 31 Oct, so 30 of October's 31 days.
		const items = [video("a", 60, "2026-10-01T00:00:00.000Z", 15 * gb), video("b", 60, "2026-10-01T00:00:00.000Z", 15 * gb)];
		const [a] = cost({ teams: [team("a"), team("b")], items });
		const gbMonths = (30 * 30) / 31;
		expect(month(a!, "2026-10").uploads).toBeCloseTo(((gbMonths - 10) * 0.015) / 2, 6);
		expect(month(a!, "2026-11").uploads).toBe(0);
	});
});

describe("a team's season", () => {
	it("adds up its months so far, and estimates the rest from the baseline until it has figures of its own", () => {
		const [a] = cost({ teams: [team("a")] });
		expect(a!.soFar).toBeCloseTo(2 * fixedAMonth(), 6);
		expect(a!.months.map((m) => m.estimate)).toEqual([false, false, ...Array(10).fill(true)]);
		// 30 games over the ten months left: 3 a month of 60 minutes, three 30-second clips each, watched twice by 9 families.
		const dec = month(a!, "2026-12");
		expect(dec.use.stored).toBeCloseTo(3 * 61.5, 6);
		expect(dec.viewing).toBeCloseTo((3 * 60 * 18) / 1000, 6);
		expect(a!.perGame.own).toEqual({ length: false, watched: false });
		expect(a!.estimate).toBeGreaterThan(a!.soFar + 10 * fixedAMonth());
	});

	it("uses the team's own figures once it has three games with a video: its games so far count towards the 30", () => {
		const items = [video("a", 40), video("a", 50), video("a", 60)];
		const [a] = cost({ teams: [team("a")], items, views: [watched("a", "2026-10", 900)] });
		expect(a!.games).toBe(3);
		expect(a!.perGame).toMatchObject({ minutes: 50, watched: 300, own: { length: true, watched: true } });
		expect(month(a!, "2026-12").use.watched).toBeCloseTo(2.7 * 300, 6);
	});

	it("counts only videos still on the site as games: tests and deleted videos aren't", () => {
		const gone = { ...video("a", 5), deletedAt: "2026-10-11T00:00:00.000Z" };
		const [a] = cost({ teams: [team("a")], items: [gone, gone, gone, video("a", 40)] });
		expect(a!.games).toBe(1);
		expect(month(a!, "2026-10").use.stored).toBe(55);
	});

	it("keeps to the baseline with fewer than three games: one short test isn't a season", () => {
		const [a] = cost({ teams: [team("a")], items: [video("a", 3)], views: [watched("a", "2026-10", 5)] });
		expect(a!.games).toBe(1);
		expect(a!.perGame).toMatchObject({ minutes: 60, gb: 5, own: { length: false, watched: false } });
	});

	it("estimates no more games for a closed team, and nothing shared once it's closed", () => {
		const [a] = cost({ teams: [team("a", { status: "closed", closedAt: "2026-10-20T00:00:00.000Z" })], items: [video("a", 60)] });
		expect(month(a!, "2026-12")).toMatchObject({ shared: 0, viewing: 0, use: { stored: 60 } });
	});
});

describe("a team's season, put right by Cloudflare's bill", () => {
	const billed = (o: { months: Record<string, { watching: number; uploads?: number; other?: number; days: number }>; freeMinutes?: number }) => ({
		months: new Map(Object.entries(o.months).map(([k, v]) => [k, { uploads: 0, other: 0, ...v }])), freeMinutes: o.freeMinutes ?? 0,
	});

	it("takes what Cloudflare charged for a month it has billed in place of the model's own, marked billed", () => {
		const [a] = teamCosts({ teams: [team("a")], items: [], views: [watched("a", "2026-10", 2000)], now: NOW, minutesBoughtNow: null, bill: billed({ months: { "2026-10": { watching: 0, days: 31 } } }) });
		expect(month(a!, "2026-10")).toMatchObject({ viewing: 0, billed: 1 });
		expect(month(a!, "2026-12").billed).toBe(0);
	});

	it("counts this month's billed days against the days so far: the 15th, with 14 days billed", () => {
		const [a] = teamCosts({ teams: [team("a")], items: [], views: [watched("a", "2026-11", 1500)], now: NOW, minutesBoughtNow: null, bill: billed({ months: { "2026-11": { watching: 0, days: 14 } } }) });
		expect(month(a!, "2026-11").billed).toBeCloseTo(14 / 15);
		expect(month(a!, "2026-11").viewing).toBeCloseTo(1.5 / 15);
	});

	it("estimates the months to come with the plan's free watching taken off", () => {
		const plain = cost({ teams: [team("a")] })[0]!;
		const [free] = teamCosts({ teams: [team("a")], items: [], views: [], now: NOW, minutesBoughtNow: null, bill: billed({ months: {}, freeMinutes: 500 }) });
		expect(month(free!, "2027-03").viewing).toBeLessThan(month(plain, "2027-03").viewing);
		expect(month(free!, "2027-03").viewing).toBeCloseTo(Math.max(0, month(plain, "2027-03").use.watched - 500) / 1000, 6);
	});
});
