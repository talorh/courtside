import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { buildsListArgs, parseCfJson } from "../../scripts/release-push.mjs";

// The release follows Workers Builds through the cf CLI, so it must read what cf prints as cf prints it.

describe("reading cf's answers", () => {
	it("reads the JSON after a summary line cf prints first, not the summary", () => {
		const printed = 'result_info: {"next_page":true,"page":1,"per_page":10}\n[\n  {"build_uuid": "b1", "status": "running"}\n]\n';
		expect(parseCfJson(printed)).toEqual([{ build_uuid: "b1", status: "running" }]);
		expect(parseCfJson('{"id": "t1"}\n')).toEqual({ id: "t1" });
		expect(parseCfJson('  [{"id": 1}]')).toEqual([{ id: 1 }]);
	});

	it("asks for the Worker's builds the way cf names it (--worker, its tag)", () => {
		expect(buildsListArgs("abc123")).toEqual(["builds", "list", "--worker", "abc123", "--per-page", "10"]);
	});
});
