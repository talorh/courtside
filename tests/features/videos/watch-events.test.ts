import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { addTeam, G14_5 } from "../../helpers/two-teams.ts";

afterEach(() => vi.restoreAllMocks());
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);

describe("a family's player trouble", () => {
	it("is a watch_events line in the Worker's logs: the game, who, their device and what went wrong, and nothing in the database", async () => {
		const deps = createTestDeps();
		const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
		const gameId = await seedGame(deps);
		const events = [{ s: 5, what: "live player: HTTP 502" }, { s: 25, what: "picture back after 20s" }];
		const res = await makeClient(deps)("/api/watch-events", { ...jsonBody({ gameId, kind: "live", events }), headers: { "Content-Type": "application/json", "User-Agent": IPHONE } });
		expect(res.status).toBe(200);
		expect(lines(warned)).toEqual([{ event: "watch_events", teamId: deps.team.id, gameId, memberId: expect.any(Number), device: expect.stringContaining("iPhone"), kind: "live", events }]);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM problems").first()).toEqual({ n: 0 });
	});

	it("only for this team's games, and only what it expects", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		await addTeam(deps.db);
		const theirs = await seedGame({ ...deps, team: G14_5 } as typeof deps);
		const client = makeClient(deps);
		expect((await client("/api/watch-events", jsonBody({ gameId: theirs, kind: "live", events: [{ s: 1, what: "x" }] }))).status).toBe(404);
		const gameId = await seedGame(deps);
		expect((await client("/api/watch-events", jsonBody({ gameId, kind: "tv", events: [{ s: 1, what: "x" }] }))).status).toBe(400);
		expect((await client("/api/watch-events", jsonBody({ gameId, kind: "live", events: [] }))).status).toBe(400);
	});
});

describe("a phone's own problem report (an upload or photos that stopped)", () => {
	it("is a line in the Worker's logs too, with how far an upload got but not its words, beside the admin Log's problem", async () => {
		const deps = createTestDeps();
		const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
		const gameId = await seedGame(deps);
		await makeClient(deps)("/api/problems", jsonBody({ what: "upload", gameId, message: "At 42% of 1,234 MB, 12 min in: no connection", status: 0, progress: { pct: 42, mb: 1234, minutes: 12 } }));
		// The words stay in the admin Log alone: a refusal can name the team's manager, a photo's file name a child.
		expect(lines(warned)).toEqual([{ event: "phone_problem", teamId: deps.team.id, gameId, memberId: expect.any(Number), device: expect.any(String), what: "upload", status: 0, progress: { pct: 42, mb: 1234, minutes: 12 } }]);
	});
});

describe("a video slow in Stream's processing", () => {
	it("is one line in the Worker's logs an hour after its processing began, with Stream's state", async () => {
		const deps = createTestDeps();
		const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		const gameId = await seedGame(deps);
		const videoId = await seedVideo(deps, { gameId, status: "processing", streamUid: "slow1" });
		deps.stream.videos.set("slow1", { readyToStream: false, state: "queued", errorReason: "", durationSeconds: -1 });
		const began = new Date(deps.now().getTime() - 62 * 60_000).toISOString();
		await deps.db.prepare("UPDATE videos SET processing_at = ? WHERE team_id = ? AND id = ?").bind(began, deps.team.id, videoId).run();
		await runSync(deps);
		const slow = lines(warned).filter((l) => l.event === "video_slow");
		expect(slow).toEqual([{ event: "video_slow", teamId: deps.team.id, videoId, gameId, streamUid: "slow1", state: "queued", minutes: 62 }]);
	});
});
