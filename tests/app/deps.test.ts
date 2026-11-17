import { describe, expect, it } from "vitest";
import { buildDeps } from "../../src/app/deps.ts";
import { TEST_CONFIG } from "../helpers/fakes.ts";

describe("buildDeps", () => {
	it("asks Cloudflare's analytics for the figures of the Worker the config names (staging's own on staging)", async () => {
		const scripts: string[] = [];
		const fetch = (async (_url: string, init: RequestInit) => {
			scripts.push(JSON.parse(String(init.body)).variables.script);
			return Response.json({ data: { viewer: { accounts: [], zones: [] } } });
		}) as typeof globalThis.fetch;
		const config = { ...TEST_CONFIG, staging: true, workerName: "staging-courtside", cloudflareInsights: { token: "tok", zoneId: "z", d1Id: "d" } };
		const deps = buildDeps({} as Env, config, { fetch });
		await deps.cloudflare?.figures(new Date("2026-11-16T00:00:00Z"), new Date("2026-11-17T00:00:00Z"));
		expect(scripts).toEqual(["staging-courtside"]);
	});
});
