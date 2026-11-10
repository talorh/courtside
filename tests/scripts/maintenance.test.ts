import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { deleteRoute, listRoutes, maintenanceRoutes, parseArgs, planCommands, PATTERN, WORKER, ZONE } from "../../scripts/maintenance-steps.mjs";

const route = (id: string, pattern: string, script: string) => ({ id, pattern, script });

describe("npm run maintenance", () => {
	it("knows its four commands, and takes no time (the page always says back soon)", () => {
		expect(parseArgs(["on"])).toEqual({ command: "on" });
		expect(parseArgs(["off"])).toEqual({ command: "off" });
		expect(parseArgs(["status"])).toEqual({ command: "status" });
		expect(parseArgs(["deploy"])).toEqual({ command: "deploy" });
		expect(parseArgs(["on", "--back", "11:30am"]).error).toMatch(/no longer takes a time/);
		expect(parseArgs(["restart"]).error).toMatch(/on, off, status or deploy/);
		expect(parseArgs([]).error).toMatch(/on, off, status or deploy/);
	});

	it("switches on by deploying the Worker with its route, a dry run first", () => {
		expect(planCommands("on", { on: false })).toEqual([
			{ args: ["deploy", "--dry-run"], env: { MAINTENANCE: "on" } },
			{ args: ["deploy"], env: { MAINTENANCE: "on" } },
		]);
	});

	it("switches off by deploying the Worker with no route, a dry run first", () => {
		expect(planCommands("off", { on: true })).toEqual([
			{ args: ["deploy", "--dry-run"], env: { MAINTENANCE: "" } },
			{ args: ["deploy"], env: { MAINTENANCE: "" } },
		]);
	});

	it("deploys a new version without changing whether maintenance is on", () => {
		expect(planCommands("deploy", { on: false })[1]).toEqual({ args: ["deploy"], env: { MAINTENANCE: "" } });
		expect(planCommands("deploy", { on: true })[1]).toEqual({ args: ["deploy"], env: { MAINTENANCE: "on" } });
		expect(planCommands("status", { on: true })).toEqual([]);
	});

	it("counts only its own route on the zone (deploy.config.ts), on the club's domain (src/club.ts)", async () => {
		expect(ZONE).toBe("REPLACE_WITH_ZONE_ID"); // the install fills it in
		expect(PATTERN).toBe("saints.example/*");
		expect(WORKER).toBe("courtside-maintenance");
		const routes = [route("a", PATTERN, WORKER), route("b", "saints.example/*", "someone-else"), route("c", "saints.example/api/*", WORKER)];
		expect(maintenanceRoutes(routes)).toEqual([routes[0]]);
		const calls: Array<[string, RequestInit]> = [];
		const fetch = async (url: string, init: RequestInit) => {
			calls.push([url, init]);
			return new Response(JSON.stringify({ success: true, result: init.method === "DELETE" ? { id: "a" } : routes }), { status: 200 });
		};
		expect(await listRoutes({ token: "t", fetch })).toEqual(routes);
		expect(calls[0]?.[0]).toBe(`https://api.cloudflare.com/client/v4/zones/${ZONE}/workers/routes`);
		expect((calls[0]?.[1].headers as Record<string, string>).Authorization).toBe("Bearer t");
		await deleteRoute("a", { token: "t", fetch });
		expect(calls[1]).toEqual([`https://api.cloudflare.com/client/v4/zones/${ZONE}/workers/routes/a`, { method: "DELETE", headers: { Authorization: "Bearer t" } }]);
	});

	it("stops on an API refusal rather than guessing", async () => {
		const fetch = async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 403 });
		await expect(listRoutes({ token: "t", fetch })).rejects.toThrow(/403.*Authentication error/);
	});
});
