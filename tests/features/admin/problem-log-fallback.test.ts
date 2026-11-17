import { afterEach, describe, expect, it, vi } from "vitest";
import { logProblem } from "../../../src/features/admin/problem-log.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

afterEach(() => vi.restoreAllMocks());

describe("a problem that can't be written to the admin Log", () => {
	it("is a line in the Worker's logs with what it was about, so it isn't lost with the database", async () => {
		const deps = createTestDeps();
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const db = { ...deps.db, prepare: deps.db.prepare.bind(deps.db), batch: async () => { throw new Error("D1 is down"); } } as unknown as D1Database;
		await logProblem({ ...deps, db }, { kind: "stream_problem", teamId: deps.team.id, what: "A streamed game's parts couldn't be joined", detail: "ffmpeg: moov atom not found" });
		expect(JSON.parse(String(errors.mock.calls[0]?.[0]))).toMatchObject({
			event: "problem_log_failed", teamId: deps.team.id, kind: "stream_problem", what: "A streamed game's parts couldn't be joined", detail: "ffmpeg: moov atom not found", error: "Error: D1 is down",
		});
	});
});
