import { describe, expect, it } from "vitest";
import { getActiveMember } from "../../../src/features/members/members-repository.ts";
import { addPhoto } from "../../../src/features/photos/photos-service.ts";
import { purgeDownloadsBefore } from "../../../src/features/videos/downloads-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { testJpeg } from "../../helpers/jpeg.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// Saturday 24 Oct 2026, 7pm in the club's time zone.
const NOW = new Date("2026-10-24T08:00:00Z");

async function setup() {
	const deps = createTestDeps(NOW);
	await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Pat Family', 'watcher')").bind(deps.team.id).run();
	const pat = (await getActiveMember(deps.db, deps.team.id, 2))!;
	return { deps, pat, watcher: makeClient(deps, "p@x.com") };
}

const logged = (deps: TestDeps) => deps.db.prepare("SELECT team_id, member_id, kind, item_id, name, created_at FROM media_downloads ORDER BY id").all().then((r) => r.results);

describe("the download log, for photos and clips", () => {
	it("logs a photo's download with who took it and the file it came as", async () => {
		const { deps, pat, watcher } = await setup();
		await addPhoto(deps, pat, testJpeg(), "2026-10-23T19:05:12");
		expect((await watcher("/photos/1/download")).status).toBe(200);
		expect(await logged(deps)).toEqual([
			{ team_id: deps.team.id, member_id: pat.id, kind: "photo", item_id: 1, name: "saints-b12-1-2026-10-23-photo-1.jpg", created_at: NOW.toISOString() },
		]);
	});
	it("logs each photo in a zip, and only the ones it holds", async () => {
		const { deps, pat, watcher } = await setup();
		for (let i = 0; i < 3; i++) await addPhoto(deps, pat, testJpeg(), "2026-10-23T19:05:12");
		await watcher("/photos/2/delete", form({ confirm: "yes" }));
		expect((await watcher("/photos/download?id=1&id=2&id=3")).status).toBe(200);
		expect((await logged(deps)).map((r) => [r.kind, r.item_id, r.name])).toEqual([
			["photo", 1, "saints-b12-1-2026-10-23-photo-1.jpg"], ["photo", 3, "saints-b12-1-2026-10-23-photo-3.jpg"],
		]);
	});
	it("logs a clip's download, its link or its iPhone save, once it's ready, and not while it's being made", async () => {
		const { deps, pat, watcher } = await setup();
		const videoId = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "u1", r2Key: "originals/a.mov" });
		await watcher(`/videos/${videoId}/clips`, form({ start: "0:10", end: "0:20", label: "Steal" }));
		deps.stream.videos.set("clip-1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 10 });
		await runSync(deps);
		expect((await watcher("/clips/1/download")).status).toBe(409);
		expect(await logged(deps)).toEqual([]);
		deps.stream.downloads.set("clip-1", "ready");
		expect((await watcher("/clips/1/download")).status).toBe(302);
		expect((await watcher("/api/clips/1/download")).status).toBe(200);
		expect((await logged(deps)).map((r) => [r.member_id, r.kind, r.item_id, r.name])).toEqual([
			[pat.id, "clip", 1, "saints-b12-1-2026-10-11-round-9-vs-lakeside-rockets-clip-steal.mp4"],
			[pat.id, "clip", 1, "saints-b12-1-2026-10-11-round-9-vs-lakeside-rockets-clip-steal.mp4"],
		]);
	});
	it("is kept two years, as the video download log is, and outlives the photo it names", async () => {
		const { deps, pat, watcher } = await setup();
		await addPhoto(deps, pat, testJpeg(), "2026-10-23T19:05:12");
		await watcher("/photos/1/download");
		await watcher("/photos/1/delete", form({ confirm: "yes" }));
		expect(await logged(deps)).toHaveLength(1);
		await deps.db.prepare("UPDATE media_downloads SET created_at = '2024-10-01T00:00:00.000Z'").run();
		expect(await purgeDownloadsBefore(deps.db, deps.team.id, "2024-10-24T08:00:00.000Z")).toBe(1);
		expect(await logged(deps)).toEqual([]);
	});
});
