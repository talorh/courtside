import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { describeEvent, logsBody, parseLogsArgs } from "../../scripts/logs-steps.mjs";

const NOW = Date.parse("2026-11-20T09:00:00Z");
const args = (argv: string[]) => parseLogsArgs(argv, "courtside");
const filters = (argv: string[]) => logsBody(args(argv), NOW).parameters.filters;
const level = { kind: "group", filterCombination: "or", filters: [
	{ key: "$metadata.level", operation: "eq", type: "string", value: "error" }, { key: "$metadata.level", operation: "eq", type: "string", value: "warn" }] };
const site = { key: "$workers.scriptName", operation: "eq", type: "string", value: "courtside" };
const live = { key: "$workers.preview.slug", operation: "is_null", type: "string" };

describe("npm run logs", () => {
	it("by default: the live site's warnings and errors in the last hour, newest first", () => {
		const body = logsBody(args([]), NOW);
		expect(body).toMatchObject({ view: "events", limit: 100, timeframe: { from: NOW - 3_600_000, to: NOW }, parameters: { datasets: ["cloudflare-workers"] } });
		expect(body.parameters.filters).toEqual([site, live, level]);
	});

	it("narrows to a team, an event, a game, a video, a Ray ID or one request, over a longer time", () => {
		const body = logsBody(args(["--since", "3h", "--team", "u14-2026", "--event", "job_failed", "--game", "38", "--video", "46"]), NOW);
		expect(body.timeframe.from).toBe(NOW - 3 * 3_600_000);
		expect(body.parameters.filters).toEqual([site, live, level,
			{ key: "teamId", operation: "eq", type: "string", value: "u14-2026" }, { key: "event", operation: "eq", type: "string", value: "job_failed" },
			{ key: "gameId", operation: "eq", type: "number", value: 38 }, { key: "videoId", operation: "eq", type: "number", value: 46 }]);
		expect(filters(["--ray", "8f1c2a3b4c5d6e7f"]).at(-1)).toEqual({ key: "ray", operation: "eq", type: "string", value: "8f1c2a3b4c5d6e7f" });
		expect(filters(["--request", "b885219b"]).at(-1)).toEqual({ key: "$metadata.requestId", operation: "eq", type: "string", value: "b885219b" });
	});

	it("every line with --all, the video joiner's with --joiner, and staging's (never in the live site's) with --staging", () => {
		expect(filters(["--all"])).toEqual([site, live]);
		expect(filters(["--joiner", "--all", "--since", "2d"])).toEqual([{ ...site, value: "courtside-join" }, live]);
		expect(filters(["--staging", "--all"])).toEqual([site, { key: "$workers.preview.slug", operation: "eq", type: "string", value: "staging" }]);
	});

	it("refuses what it doesn't know, saying how to use it", () => {
		expect(args(["--since", "soon"]).error).toContain("--since");
		expect(args(["--game", "x"]).error).toContain("--game");
		expect(args(["--colour"]).error).toContain("--colour");
		expect(args(["--team", "--all"]).error).toContain("--team");
	});

	it("shows each line in the club's time zone: its level, event, team, the rest of its fields and its request", () => {
		const line = describeEvent({ timestamp: Date.parse("2026-11-20T09:14:03Z"), $metadata: { level: "error", requestId: "b885219b" },
			source: { event: "job_failed", level: "error", teamId: "u14-2026", step: "processing", videoId: 46 } }, "Australia/Melbourne");
		expect(line).toBe('Fri 20 Nov 8:14:03 pm  error  job_failed  u14-2026  {"step":"processing","videoId":46}  request b885219b');
		expect(describeEvent({ timestamp: Date.parse("2026-11-20T09:14:03Z"), $metadata: {}, source: { event: "sync_team", teamId: "u12-2026" } }, "Australia/Melbourne")).toBe("Fri 20 Nov 8:14:03 pm  log  sync_team  u12-2026");
	});
});
