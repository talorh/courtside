import { describe, expect, it } from "vitest";
import { getActiveMember } from "../../src/features/members/members-repository.ts";
import { addPhoto } from "../../src/features/photos/photos-service.ts";
import { runSync } from "../../src/jobs/sync-videos.ts";
import { sweepOrphans } from "../../src/jobs/sweep-orphans.ts";
import { deleteVideo } from "../../src/features/videos/video-removal-service.ts";
import { getVideo } from "../../src/features/videos/videos-repository.ts";
import { jsonBody, makeClient } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { testJpeg } from "../helpers/jpeg.ts";
import { seedGame, seedVideo } from "../helpers/seed.ts";

const stream = (deps: ReturnType<typeof createTestDeps>, uid: string, created = "2026-10-01T00:00:00.000Z") => {
	deps.stream.videos.set(uid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 60 });
	deps.stream.created.set(uid, created);
};

describe("orphan sweep (daily)", () => {
	it("removes Stream videos the site no longer points to, and keeps everything it still needs", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		await seedVideo(deps, { gameId, streamUid: "on-site" });
		const kept = await seedVideo(deps, { gameId: await seedGame(deps, { opponent: "B" }), streamUid: "kept-a-day" });
		await deleteVideo(deps, (await getVideo(deps.db, deps.team.id, kept))!, "admin");
		await deps.db.prepare("INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, stream_uid) VALUES (?, 1, 'x', 0, 5, 'ready', 'a-clip')").bind(deps.team.id).run();
		for (const uid of ["on-site", "kept-a-day", "a-clip", "left-behind"]) stream(deps, uid);
		stream(deps, "just-made", "2026-10-14T12:00:00.000Z"); // an upload whose copy is still being saved
		expect(await sweepOrphans(deps)).toMatchObject({ orphanVideos: 1, orphansDeleted: 1 });
		expect(deps.stream.deleted).toEqual(["left-behind"]);
	});

	it("leaves staging's things out of its brake and removes them a week on, not two days (docs/runbooks/staging.md)", async () => {
		const deps = createTestDeps();
		await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "live-site" });
		stream(deps, "live-site");
		// More of staging's than the live site's: counted, they'd look like a wrong database and stop the clean-up.
		for (const [uid, made] of [["s-old", "2026-10-01T00:00:00.000Z"], ["s-1", "2026-10-12T00:00:00.000Z"], ["s-2", "2026-10-12T00:00:00.000Z"], ["s-3", "2026-10-12T00:00:00.000Z"],
			["s-4", "2026-10-12T00:00:00.000Z"], ["s-5", "2026-10-12T00:00:00.000Z"], ["s-6", "2026-10-12T00:00:00.000Z"]]) {
			stream(deps, uid!, made);
			deps.stream.staging.add(uid!);
		}
		deps.live.inputs.set("s-input", { name: "Staging game", enabled: false, site: "staging" });
		deps.live.createdAt.set("s-input", "2026-10-12T00:00:00.000Z");
		deps.images.stored.set("s-photo", { bytes: new Uint8Array([1]), teamId: "t", uploadedBy: 1, uploaded: "2026-10-01T00:00:00.000Z", site: "staging" });
		expect(await sweepOrphans(deps)).toMatchObject({ orphanVideos: 1, orphanInputs: 0, orphanImages: 1, orphansDeleted: 2 });
		expect([deps.stream.deleted, deps.images.deleted]).toEqual([["s-old"], ["s-photo"]]);
	});

	it("an external app's recording, which Stream labels with only a name, is staging's when its live input is", async () => {
		const deps = createTestDeps();
		await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "live-site" });
		stream(deps, "live-site");
		deps.live.inputs.set("s-input", { name: "Staging game", enabled: false, site: "staging" });
		deps.live.createdAt.set("s-input", "2026-10-14T00:00:00.000Z");
		for (const uid of ["rec-1", "rec-2", "rec-3", "rec-4", "rec-5", "rec-6"]) {
			stream(deps, uid, "2026-10-12T00:00:00.000Z");
			deps.stream.recordedFrom.set(uid, "s-input");
		}
		// Six of them, three days old: as the live site's they'd be removed, or trip the brake; as staging's, they wait a week.
		expect(await sweepOrphans(deps)).toMatchObject({ orphanVideos: 0, orphansDeleted: 0 });
		expect(deps.stream.deleted).toEqual([]);
	});
	it("never runs on staging, which would take the live site's things for leftovers", async () => {
		const deps = createTestDeps();
		stream(deps, "live-site");
		await expect(sweepOrphans({ ...deps, config: { ...deps.config, staging: true } })).rejects.toThrow(/staging/);
		expect(deps.stream.deleted).toEqual([]);
	});

	it("a test stream leaves nothing behind: the recording never reaches Stream, and its live input goes after two days", async () => {
		let now = new Date("2026-10-15T00:00:00Z");
		const deps = createTestDeps();
		(deps as { now: () => Date }).now = () => now;
		const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
		const client = makeClient(deps);
		await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }));
		deps.live.createdAt.set("live-1", now.toISOString());
		now = new Date(now.getTime() + 20_000);
		await client(`/api/live/${gameId}/end`, jsonBody({}));
		expect(deps.originals.aborted).toHaveLength(1);
		expect(deps.stream.uploads).toEqual([]);
		expect((await sweepOrphans(deps)).orphanInputs).toBe(0); // still reusable for a while
		now = new Date("2026-10-17T01:00:00Z");
		expect(await sweepOrphans(deps)).toMatchObject({ orphanInputs: 1, orphansDeleted: 1 });
		expect(deps.live.inputs.size).toBe(0);
	});

	it("keeps the live input of a stream that's still open", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps, { startsAt: "2026-10-23T18:40" });
		await makeClient(deps)("/live");
		expect(await sweepOrphans({ ...deps, now: () => new Date("2026-10-18T00:00:00Z") })).toMatchObject({ orphanInputs: 0 });
		expect(deps.live.inputs.size).toBe(1);
		expect(gameId).toBeGreaterThan(0);
	});

	it("Go live opened on several games (each sets up an input, closed after a day) is tidied up, not refused (22 Oct)", async () => {
		let now = new Date("2026-10-15T00:00:00Z");
		const deps = createTestDeps();
		(deps as { now: () => Date }).now = () => now;
		for (let i = 0; i < 7; i++) {
			const gameId = await seedGame(deps, { startsAt: `2026-10-${16 + i}T18:40`, opponent: `Team ${i}` });
			await makeClient(deps)(`/live?game=${gameId}`);
			deps.live.createdAt.set(`live-${i + 1}`, now.toISOString());
		}
		now = new Date("2026-10-18T00:00:00Z");
		await runSync(deps); // closes the ones nobody used
		expect(await sweepOrphans(deps)).toMatchObject({ orphanInputs: 7, orphansDeleted: 7 });
	});

	it("keeps an external app's live input while its recording is on the site, and removes it once the recording has gone", async () => {
		const deps = createTestDeps();
		await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "rec-saved" });
		stream(deps, "rec-saved");
		deps.stream.recordedFrom.set("rec-saved", "app-input");
		deps.live.inputs.set("app-input", { name: "B12.1 v Rockets", enabled: false });
		deps.live.createdAt.set("app-input", "2026-10-01T00:00:00.000Z");
		expect(await sweepOrphans(deps)).toMatchObject({ orphanInputs: 0, orphansDeleted: 0 });
		expect(deps.live.inputs.has("app-input")).toBe(true);
		await deps.db.prepare("UPDATE videos SET deleted_at = ?, purge_after = ? WHERE team_id = ?").bind("2026-10-02T00:00:00.000Z", "2026-10-03T00:00:00.000Z", deps.team.id).run();
		expect(await sweepOrphans(deps)).toMatchObject({ orphanVideos: 1, orphanInputs: 1, orphansDeleted: 2 });
	});

	it("removes photos' images the site doesn't show, two days on, and keeps the rest", async () => {
		const deps = createTestDeps();
		const manager = (await getActiveMember(deps.db, deps.team.id, 1))!;
		const old = "2026-10-01T00:00:00.000Z";
		await addPhoto(deps, manager, testJpeg(), "");
		deps.images.stored.get("img-1")!.uploaded = old; // on the site: kept however old
		const leftover = await deps.images.upload(testJpeg(), { teamId: deps.team.id, uploadedBy: 1, filename: "photo.jpg" }); // its save failed
		deps.images.stored.get(leftover)!.uploaded = old;
		await deps.images.upload(testJpeg(), { teamId: deps.team.id, uploadedBy: 1, filename: "photo.jpg" }); // just now: its row may still be on its way
		const noDate = await deps.images.upload(testJpeg(), { teamId: deps.team.id, uploadedBy: 1, filename: "photo.jpg" });
		deps.images.stored.get(noDate)!.uploaded = ""; // when it was stored isn't known: kept
		expect(await sweepOrphans(deps)).toMatchObject({ orphanImages: 1, orphansDeleted: 1 });
		expect([...deps.images.stored.keys()]).toEqual(["img-1", "img-3", "img-4"]);
	});

	it("Images not answering doesn't stop Stream's clean-up, and the night says it didn't finish", async () => {
		const deps = createTestDeps();
		stream(deps, "left-behind");
		deps.images.down = true;
		const outcome = await sweepOrphans(deps);
		expect(outcome).toMatchObject({ orphanVideos: 1, orphanImages: 0, orphansDeleted: 1 });
		expect(deps.stream.deleted).toEqual(["left-behind"]);
		expect(outcome.errors.map(String)).toEqual(["Error: Images unavailable (503)"]);
	});

	it("deletes nothing, and fails loudly, when most of the photos look unknown", async () => {
		const deps = createTestDeps();
		for (let i = 0; i < 8; i++) {
			const id = await deps.images.upload(testJpeg(), { teamId: deps.team.id, uploadedBy: 1, filename: "photo.jpg" });
			deps.images.stored.get(id)!.uploaded = "2026-10-01T00:00:00.000Z";
		}
		await expect(sweepOrphans(deps)).rejects.toThrow("0 of 0 live inputs and 8 of 8 photos are unknown to the database");
		expect(deps.images.stored.size).toBe(8);
	});

	it("deletes nothing, and fails loudly, when most of Stream looks unused (the wrong or an empty database)", async () => {
		const deps = createTestDeps();
		for (let i = 0; i < 8; i++) stream(deps, `v${i}`);
		await expect(sweepOrphans(deps)).rejects.toThrow("Orphan sweep refused: 8 of 8 Stream videos");
		expect(deps.stream.deleted).toEqual([]);
	});
});
