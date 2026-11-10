import { describe, expect, it } from "vitest";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

// Go live in the admin Log, a team's line each with who did it: going live, the game ending (End game, or the camera
// stopping), a stream thrown away as a test, and its recording saved. Test clock: 11am Thursday 15 Oct in the club's time zone.
const ATTEMPT = "4a5b6c7d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const GAME = "Round 9 · vs Northside 2, Thu 15 Oct";

async function filmer() {
	let now = new Date("2026-10-15T00:00:00Z");
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'sam@x.com', 'filmer')").bind(deps.team.id).run();
	const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40", opponent: "Northside 2", roundLabel: "9" });
	const sam = makeClient(deps, "sam@x.com");
	const goLive = async () => ((await (await sam(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4", attempt: ATTEMPT }))).json()) as { data: { videoId: number } }).data.videoId;
	const later = (seconds: number) => { now = new Date(now.getTime() + seconds * 1000); };
	const log = async () => (await deps.db.prepare("SELECT admin_email, action, detail FROM admin_log ORDER BY id").all<{ admin_email: string; action: string; detail: string }>()).results;
	return { deps, gameId, sam, goLive, later, log };
}

describe("Go live in the admin Log", () => {
	it("who went live (once, however often a lost answer is asked again), and that End game was tapped", async () => {
		const { gameId, sam, goLive, later, log } = await filmer();
		await goLive();
		await goLive();
		later(30 * 60);
		await sam(`/api/live/${gameId}/end`, jsonBody({ recordedSeconds: 1700, cause: "tapped" }));
		await sam(`/api/live/${gameId}/end`, jsonBody({ recordedSeconds: 1700, cause: "tapped" }));
		expect(await log()).toEqual([
			{ admin_email: "sam@x.com", action: "live_started", detail: GAME },
			{ admin_email: "sam@x.com", action: "live_ended", detail: `${GAME}: End game tapped` },
		]);
	});
	it("a camera that stopped ends it, and says so; under a minute recorded, it's a stream thrown away as a test", async () => {
		const ended = await filmer();
		await ended.goLive();
		ended.later(30 * 60);
		await ended.sam(`/api/live/${ended.gameId}/end`, jsonBody({ recordedSeconds: 1500, cause: "camera" }));
		expect((await ended.log()).at(-1)).toEqual({ admin_email: "sam@x.com", action: "live_ended", detail: `${GAME}: the camera stopped (the phone locked, or another app took it)` });
		const test = await filmer();
		await test.goLive();
		test.later(92);
		await test.sam(`/api/live/${test.gameId}/end`, jsonBody({ recordedSeconds: 45, cause: "camera" }));
		expect((await test.log()).at(-1)).toEqual({ admin_email: "sam@x.com", action: "live_test", detail: `${GAME}: 45 seconds recorded, then the camera stopped` });
	});
	it("its recording saved, by whoever went live, once the phone has sent it all", async () => {
		const { deps, gameId, sam, goLive, later, log } = await filmer();
		const videoId = await goLive();
		later(30 * 60);
		await sam(`/api/live/${gameId}/end`, jsonBody({ recordedSeconds: 1700, cause: "tapped" }));
		await sam(`/api/uploads/${videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }] }));
		expect((await getVideo(deps.db, deps.team.id, videoId))?.status).toBe("processing");
		expect((await log()).at(-1)).toEqual({ admin_email: "sam@x.com", action: "live_saved", detail: GAME });
		const page = (await (await makeClient(deps)("/admin/log?show=videos")).text()).replaceAll("&#39;", "'");
		expect(page).toContain(`went live on Saints B12.1's game ${GAME}`);
		expect(page).toContain(`ended the live stream of Saints B12.1's game ${GAME}: End game tapped`);
		expect(page).toContain(`saved the live stream of Saints B12.1's game ${GAME}`);
	});
	it("a short one that slipped past End game is the site's line once it's processed", async () => {
		const { deps, gameId, sam, goLive, log } = await filmer();
		const videoId = await goLive();
		await sam(`/api/uploads/${videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "a" }] }));
		const uid = (await getVideo(deps.db, deps.team.id, videoId))!.streamUid!;
		deps.stream.videos.set(uid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 20 });
		await runSync(deps);
		expect((await log()).at(-1)).toEqual({ admin_email: "site", action: "live_test", detail: `${GAME}: 20 seconds, found once it was processed` });
		expect(gameId).toBeGreaterThan(0);
	});
});
