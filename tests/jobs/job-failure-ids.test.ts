import { afterEach, describe, expect, it, vi } from "vitest";
import { runSync } from "../../src/jobs/sync-videos.ts";
import { logJobProblems } from "../../src/jobs/job-problems.ts";
import { failureIds, tagFailure } from "../../src/shared/failure-ids.ts";
import { runEach } from "../../src/shared/run-each.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { seedGame, seedVideo } from "../helpers/seed.ts";

afterEach(() => vi.restoreAllMocks());

describe("a job's failure says which record it was for", () => {
	it("runEach keeps each failure as it was, and notes the record it was for", async () => {
		const boom = new Error("boom");
		const { errors } = await runEach([{ id: 7, gameId: 3 }, { id: 8, gameId: 4 }], async (v) => { if (v.id === 7) throw boom; }, (v) => ({ videoId: v.id, gameId: v.gameId }));
		expect(errors).toEqual([boom]);
		expect(failureIds(boom)).toEqual({ videoId: 7, gameId: 3 });
	});

	it("the 5-minute job's failure is a job_failed line in the Worker's logs with its step, video and game, and a problem in the admin Log with its step", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const gameId = await seedGame(deps);
		const videoId = await seedVideo(deps, { gameId, status: "processing", streamUid: "u1" });
		deps.stream.broken.add("u1");
		await expect(runSync(deps)).rejects.toBeInstanceOf(AggregateError);
		const lines = errors.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>).filter((l) => l.event === "job_failed");
		expect(lines).toEqual([expect.objectContaining({ job: "sync", teamId: deps.team.id, step: "processing", videoId, gameId, error: expect.stringContaining("Stream GET u1 failed") })]);
		expect(lines[0]!.stack).toEqual(expect.any(String));
		const problem = await deps.db.prepare("SELECT team_id, detail FROM problems WHERE kind = 'job_failed'").first<{ team_id: string; detail: string }>();
		// The step alone in the Log, so one outage over many records is still one line there; the ids are on the log line.
		expect(problem).toEqual({ team_id: deps.team.id, detail: expect.stringMatching(/^processing: .*Stream GET u1 failed/) });
	});

	it("failures gathered into one (a team that couldn't close) are each logged, with their own team and the step", async () => {
		const deps = createTestDeps();
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const inner = tagFailure(new Error("D1 hiccup"), { teamId: deps.team.id });
		await logJobProblems(deps, "daily", [], [tagFailure(new AggregateError([inner], "closing seasons: 1 team(s) couldn't be closed"), { step: "close_seasons" })]);
		expect(JSON.parse(String(errors.mock.calls[0]?.[0]))).toMatchObject({ event: "job_failed", job: "daily", step: "close_seasons", teamId: deps.team.id, error: "Error: D1 hiccup" });
		expect(await deps.db.prepare("SELECT team_id, detail FROM problems WHERE kind = 'job_failed'").first()).toEqual({ team_id: deps.team.id, detail: "close_seasons: D1 hiccup" });
	});
});
