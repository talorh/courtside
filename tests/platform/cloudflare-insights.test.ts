import { describe, expect, it } from "vitest";
import { createCloudflareInsights } from "../../src/platform/cloudflare-insights.ts";
import { fakeFetch } from "../helpers/fake-fetch.ts";

const UNTIL = new Date("2026-10-28T00:00:00.000Z");
const SINCE = new Date("2026-09-28T00:00:00.000Z");
const options = { accountId: "acct", zoneId: "zone", databaseId: "db-1", bucket: "courtside-originals", scriptName: "courtside", token: "tok" };

const ANALYTICS = { data: { viewer: {
	accounts: [{
		workers: [{ sum: { requests: 987, errors: 6, subrequests: 482 }, quantiles: { cpuTimeP50: 11772, cpuTimeP99: 37194 } }],
		d1: [{ sum: { readQueries: 39, writeQueries: 12, rowsRead: 5273, rowsWritten: 120 } }],
		d1size: [{ max: { databaseSizeBytes: 368640 } }],
		r2: [{ max: { payloadSize: 2868048566, objectCount: 6 } }],
		stream: [{ sum: { minutesViewed: 764 } }],
		ai: [{ sum: { totalNeurons: 67.6 } }],
	}],
	zones: [{ http: [{ sum: { requests: 6000, threats: 30 } }, { sum: { requests: 533, threats: 8 } }] }],
} } };
describe("Cloudflare's own figures for Insights", () => {
	it("reads the last 30 days in one GraphQL query with the read-only token", async () => {
		const { calls, fetch } = fakeFetch({ body: ANALYTICS });
		const figures = await createCloudflareInsights({ ...options, fetch }).figures(SINCE, UNTIL);
		expect(figures).toEqual({
			workers: { requests: 987, errors: 6, subrequests: 482, cpuP50Ms: 11.772, cpuP99Ms: 37.194 },
			d1: { rowsRead: 5273, rowsWritten: 120, queries: 51, sizeBytes: 368640 },
			r2: { bytes: 2868048566, objects: 6 }, streamMinutesWatched: 764, aiNeurons: 67.6, zone: { requests: 6533, threats: 38 },
		});
		expect(calls.map((c) => c.url)).toEqual(["https://api.cloudflare.com/client/v4/graphql"]);
		for (const c of calls) expect(new Headers(c.init.headers).get("Authorization")).toBe("Bearer tok");
		const { variables, query } = JSON.parse(String(calls[0]!.init.body)) as { variables: Record<string, string>; query: string };
		expect(variables).toEqual({ a: "acct", z: "zone", since: SINCE.toISOString(), until: UNTIL.toISOString(), sinceDate: "2026-09-28", untilDate: "2026-10-28", script: "courtside", db: "db-1", bucket: "courtside-originals" });
		expect(query).toContain("workersInvocationsAdaptive");
	});

	it("counts nothing as nothing when a dataset has no rows yet", async () => {
		const empty = { data: { viewer: { accounts: [{ workers: [], d1: [], d1size: [], r2: [], stream: [], ai: [] }], zones: [{ http: [] }] } } };
		const { fetch } = fakeFetch({ body: empty });
		expect(await createCloudflareInsights({ ...options, fetch }).figures(SINCE, UNTIL)).toEqual({
			workers: { requests: 0, errors: 0, subrequests: 0, cpuP50Ms: 0, cpuP99Ms: 0 }, d1: { rowsRead: 0, rowsWritten: 0, queries: 0, sizeBytes: null },
			r2: { bytes: 0, objects: 0 }, streamMinutesWatched: 0, aiNeurons: 0, zone: { requests: 0, threats: 0 },
		});
	});

	it("says what went wrong when Cloudflare refuses (the page then says the figures couldn't be read)", async () => {
		const { fetch } = fakeFetch({ body: { data: null, errors: [{ message: "not authorized for that account" }] } });
		await expect(createCloudflareInsights({ ...options, fetch }).figures(SINCE, UNTIL)).rejects.toThrow("Cloudflare's analytics: not authorized for that account");
	});
});

describe("Stream's minutes watched by video, for Costs", () => {
	it("reads each video's minutes a day between two dates", async () => {
		const body = { data: { viewer: { accounts: [{ stream: [
			{ sum: { minutesViewed: 120.5 }, dimensions: { uid: "v1", date: "2026-10-30" } },
			{ sum: { minutesViewed: null }, dimensions: { uid: "v2", date: "2026-10-31" } },
		] }] } } };
		const { calls, fetch } = fakeFetch({ body });
		expect(await createCloudflareInsights({ ...options, fetch }).minutesByVideo("2026-10-01", "2026-11-01")).toEqual([
			{ uid: "v1", date: "2026-10-30", minutes: 120.5 }, { uid: "v2", date: "2026-10-31", minutes: 0 },
		]);
		const sent = JSON.parse(String(calls[0]!.init.body)) as { query: string; variables: Record<string, string> };
		expect(sent.query).toContain("dimensions { uid date }");
		expect(sent.variables).toEqual({ a: "acct", s: "2026-10-01", u: "2026-11-01" });
	});
});
