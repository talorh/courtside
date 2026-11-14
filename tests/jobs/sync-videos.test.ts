import { describe, expect, it } from "vitest";
import { getActiveMember } from "../../src/features/members/members-repository.ts";
import { addPhoto } from "../../src/features/photos/photos-service.ts";
import { getActiveVideoForGame, getVideo } from "../../src/features/videos/videos-repository.ts";
import { runSync } from "../../src/jobs/sync-videos.ts";
import { FetchBudgetSpent } from "../../src/platform/fetch-budget.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { testJpeg } from "../helpers/jpeg.ts";
import { seedGame, seedVideo } from "../helpers/seed.ts";

describe("runSync", () => {
	it("checks a live game once it's 8 hours from tip-off (the game check)", async () => {
		const deps = createTestDeps(new Date("2026-11-13T00:00:00Z")); // 11am Friday, the club's time zone
		await seedGame(deps, { startsAt: "2026-11-13T18:40" });
		await runSync(deps);
		const checked = await deps.db.prepare("SELECT ready_checked_at FROM games").first<{ ready_checked_at: string | null }>();
		expect(checked?.ready_checked_at).toBe("2026-11-13T00:00:00.000Z");
		expect(await deps.db.prepare("SELECT detail FROM platform_alerts WHERE kind = 'game_day'").first<{ detail: string }>()).toMatchObject({ detail: expect.stringMatching(/^1 live game in the next 8 hours/) });
	});
	it("marks ready videos and builds the MP4 download", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		const id = await seedVideo(deps, { gameId, status: "processing", streamUid: "u1", r2Key: "originals/a.mov" });
		deps.stream.videos.set("u1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 2830 });
		const summary = await runSync(deps);
		expect(summary).toMatchObject({ ready: 1, failed: 0 });
		expect(await getActiveVideoForGame(deps.db, deps.team.id, gameId)).toMatchObject({ id, status: "ready", durationSeconds: 2830 });
		expect(deps.stream.downloads.get("u1")).toBe("inprogress");
	});

	it("marks Stream errors as failed and retries missing Stream copies", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		const bad = await seedVideo(deps, { gameId, status: "processing", streamUid: "u9", r2Key: "originals/bad.mov" });
		deps.stream.videos.set("u9", { readyToStream: false, state: "error", errorReason: "Invalid file", durationSeconds: -1 });
		const queued = await seedVideo(deps, { gameId: await seedGame(deps, { roundLabel: "10" }), status: "processing", r2Key: "originals/q.mov" });
		const summary = await runSync(deps);
		expect(summary).toMatchObject({ copiesRequested: 1, failed: 1 });
		expect((await getVideo(deps.db, deps.team.id, bad))?.status).toBe("failed");
		expect((await getVideo(deps.db, deps.team.id, queued))?.streamUid).toBe("uid-1");
	});

	it("deletes expired videos and abandoned uploads, and purges old download logs", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		const old = await seedVideo(deps, { gameId, streamUid: "old", r2Key: "originals/old.mov", deleteAfter: "2026-10-01T00:00:00.000Z" });
		const stale = await seedVideo(deps, { gameId: await seedGame(deps, { roundLabel: "10" }), status: "uploading", r2Key: "originals/stale.mov", r2UploadId: "up-9", createdAt: "2026-10-01T00:00:00.000Z" });
		await deps.db.prepare("INSERT INTO downloads (team_id, video_id, member_id, kind, created_at) VALUES (?, ?, 1, 'hd', '2024-01-01T00:00:00.000Z')")
			.bind(deps.team.id, old).run();
		const summary = await runSync(deps);
		expect(summary).toMatchObject({ expired: 1, abandoned: 1, downloadsPurged: 1 });
		expect(deps.stream.deleted).toEqual(["old"]);
		expect(deps.originals.aborted).toEqual(["originals/stale.mov"]);
		expect(await getVideo(deps.db, deps.team.id, stale)).toBeNull();
	});

	it("deletes photos whose season is over", async () => {
		const deps = createTestDeps();
		await addPhoto(deps, (await getActiveMember(deps.db, deps.team.id, 1))!, testJpeg(), "");
		await deps.db.prepare("UPDATE photos SET delete_after = '2026-10-01T00:00:00.000Z'").run();
		expect(await runSync(deps)).toMatchObject({ photosExpired: 1 });
		expect(deps.images.stored.size).toBe(0);
	});

	it("work past the run's budget of outside calls waits for the next run, without failing it or marking PlayHQ broken", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		await seedVideo(deps, { gameId, status: "processing", streamUid: "u1", r2Key: "originals/a.mov" });
		deps.stream.videos.set("u1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 2830 });
		await deps.db.prepare("INSERT INTO playhq_fixtures (team_id, competition, playhq_team_id, url, name) VALUES (?, 'VJBL', 'x', ?, 'X')")
			.bind(deps.team.id, "https://www.playhq.com/example-association/org/x/teams/y/8fab8b8c").run();
		const spent = () => Promise.reject(new FetchBudgetSpent());
		const tight = { ...deps, stream: Object.assign(Object.create(deps.stream), { details: spent }), playhq: { teamFixture: spent, gameResult: spent } };
		expect(await runSync(tight)).toMatchObject({ ready: 0, playhqChecked: 0 });
		expect(await deps.db.prepare("SELECT last_error FROM playhq_fixtures").first<string | null>("last_error")).toBeNull();
		deps.playhq.teams.set("8fab8b8c", { name: "X", games: [] });
		expect(await runSync(deps)).toMatchObject({ ready: 1, playhqChecked: 1 });
	});

	it("keeps going past one broken video, then fails the run loudly", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		await seedVideo(deps, { gameId, status: "processing", streamUid: "broken", r2Key: "originals/m.mov" });
		deps.stream.broken.add("broken");
		const good = await seedVideo(deps, { gameId: await seedGame(deps, { roundLabel: "10" }), status: "processing", streamUid: "u2", r2Key: "originals/g.mov" });
		deps.stream.videos.set("u2", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 60 });
		await expect(runSync(deps)).rejects.toBeInstanceOf(AggregateError);
		expect((await getVideo(deps.db, deps.team.id, good))?.status).toBe("ready");
	});
});
