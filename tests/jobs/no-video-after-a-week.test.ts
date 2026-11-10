import { describe, expect, it } from "vitest";
import { getGame } from "../../src/features/games/games-repository.ts";
import { runSync } from "../../src/jobs/sync-videos.ts";
import { makeClient } from "../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { gameForm, seedGame, seedVideo } from "../helpers/seed.ts";

// A game nobody uploaded or streamed in the week after tip-off is set to No video by the 5-minute job, with a line in
// the Log by the site. A team manager who sets it back to Video gives it another week from then. local is UTC+11 in
// November: Friday 13 Nov 2026 at 7:35pm (08:35 UTC) is waiting for video until 7:35pm the Friday after.
const at = (iso: string) => createTestDeps(new Date(iso));
const later = (deps: TestDeps, iso: string) => { (deps as { now: () => Date }).now = () => new Date(iso); };
const noVideo = async (deps: TestDeps, id: number) => (await getGame(deps.db, deps.team.id, id))!.noVideo;
const FRIDAY = "2026-11-13T19:35";

describe("No video a week after the game", () => {
	it("waits a week from tip-off, then No video, with the Log saying why", async () => {
		const deps = at("2026-11-13T09:00:00Z");
		const gameId = await seedGame(deps, { startsAt: FRIDAY, opponent: "Lakeside Rockets", roundLabel: "6" });
		later(deps, "2026-11-20T08:30:00Z"); // 5 minutes short of a week: still waiting for video
		await runSync(deps);
		expect(await noVideo(deps, gameId)).toBe(false);
		later(deps, "2026-11-20T08:40:00Z");
		await runSync(deps);
		expect(await noVideo(deps, gameId)).toBe(true);
		const log = await deps.db.prepare("SELECT admin_email, action, detail FROM admin_log").all<{ admin_email: string; action: string; detail: string }>();
		expect(log.results).toEqual([{ admin_email: "site", action: "game_changed", detail: "Round 6 · vs Lakeside Rockets, Fri 13 Nov: No video, as nothing was uploaded or streamed in the week it waited for video" }]);
	});
	it("a team manager who sets it back to Video, to upload it, gets another week from then, then No video again", async () => {
		const deps = at("2026-11-13T09:00:00Z");
		const gameId = await seedGame(deps, { startsAt: FRIDAY });
		later(deps, "2026-11-20T09:00:00Z");
		await runSync(deps);
		expect(await noVideo(deps, gameId)).toBe(true);
		expect((await makeClient(deps)(`/fixture/${gameId}`, await gameForm(deps, gameId, { video: "record" }))).status).toBe(303);
		expect(await noVideo(deps, gameId)).toBe(false);
		for (const iso of ["2026-11-20T09:05:00Z", "2026-11-27T08:55:00Z"]) {
			later(deps, iso);
			await runSync(deps);
		}
		expect(await noVideo(deps, gameId)).toBe(false);
		expect(await (await makeClient(deps)("/upload")).text()).toContain(`value="${gameId}"`);
		later(deps, "2026-11-27T09:05:00Z");
		await runSync(deps);
		expect(await noVideo(deps, gameId)).toBe(true);
	});
	it("a game a team manager set to No video and back again, before the site did, waits a week from being set back", async () => {
		const deps = at("2026-11-13T09:00:00Z");
		const gameId = await seedGame(deps, { startsAt: FRIDAY });
		const manager = makeClient(deps);
		later(deps, "2026-11-14T00:00:00Z");
		await manager(`/fixture/${gameId}`, await gameForm(deps, gameId, { video: "none" }));
		await manager(`/fixture/${gameId}`, await gameForm(deps, gameId, { video: "record" }));
		later(deps, "2026-11-20T23:55:00Z"); // a week from tip-off, not yet from being set back
		await runSync(deps);
		expect(await noVideo(deps, gameId)).toBe(false);
		later(deps, "2026-11-21T00:05:00Z");
		await runSync(deps);
		expect(await noVideo(deps, gameId)).toBe(true);
	});
	it("leaves a game with an upload of any kind (still uploading, processing, failed), and one whose stream is saving", async () => {
		const deps = at("2026-11-13T09:00:00Z");
		deps.stream.videos.set("p1", { readyToStream: false, state: "inprogress", errorReason: "", durationSeconds: 0 });
		const videos = [
			{ status: "uploading", r2Key: "originals/k1", r2UploadId: "u1", createdAt: "2026-11-21T00:30:00.000Z" },
			{ status: "processing", streamUid: "p1", r2Key: "originals/k2" },
			{ status: "ready", streamUid: "r1" },
			{ status: "failed" },
		] as const;
		const ids: number[] = [];
		for (const v of videos) {
			const id = await seedGame(deps, { startsAt: FRIDAY });
			await seedVideo(deps, { gameId: id, ...v });
			ids.push(id);
		}
		// Streamed and ended, its recording still on its way from the phone (a day to reach Wi-Fi).
		const streamed = await seedGame(deps, { startsAt: FRIDAY });
		const recording = await seedVideo(deps, { gameId: streamed, status: "uploading", r2Key: "originals/k3", r2UploadId: "u3", createdAt: "2026-11-21T00:00:00.000Z" });
		await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at, last_live_at, end_requested_at, recording_video_id) VALUES (?, ?, 'in-x', 1, ?, ?, ?, ?)")
			.bind(deps.team.id, streamed, "2026-11-21T00:00:00.000Z", "2026-11-21T00:40:00.000Z", "2026-11-21T00:45:00.000Z", recording).run();
		later(deps, "2026-11-21T01:00:00Z");
		await runSync(deps);
		for (const id of [...ids, streamed]) expect([id, await noVideo(deps, id)]).toEqual([id, false]);
	});
	it("a game where Go live was only opened (nothing streamed) is set to No video, and its live input closed", async () => {
		const deps = at("2026-11-13T09:00:00Z");
		const gameId = await seedGame(deps, { startsAt: FRIDAY });
		await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at) VALUES (?, ?, 'in-unused', 1, ?)")
			.bind(deps.team.id, gameId, "2026-11-13T08:30:00.000Z").run();
		later(deps, "2026-11-21T01:00:00Z");
		await runSync(deps);
		expect(await noVideo(deps, gameId)).toBe(true);
		expect(await deps.db.prepare("SELECT status FROM live_streams").first<{ status: string }>()).toEqual({ status: "cancelled" });
	});
	it("leaves a closed team's games as they are", async () => {
		const deps = at("2026-11-13T09:00:00Z");
		const gameId = await seedGame(deps, { startsAt: FRIDAY });
		await deps.db.prepare("UPDATE teams SET status = 'closed', closed_at = ?, delete_after = '2027-12-31T13:00:00.000Z' WHERE id = ?").bind("2026-11-14T00:00:00.000Z", deps.team.id).run();
		later(deps, "2026-11-21T01:00:00Z");
		await runSync(deps);
		expect(await noVideo(deps, gameId)).toBe(false);
		expect((await deps.db.prepare("SELECT COUNT(*) AS n FROM admin_log").first<{ n: number }>())?.n).toBe(0);
	});
});
