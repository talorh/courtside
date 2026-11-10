import { describe, expect, it } from "vitest";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

// Friday 23 Oct 2026's practice match, as it will run: Go live was opened at 6:44pm the night before
// to check it, so its stream turns a day old at 6:44pm on game night. local is UTC+11.
async function gameNight() {
	let now = new Date("2026-10-22T07:44:00Z"); // Thu 6:44pm
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'p@x.com', 'watcher')").bind(deps.team.id).run();
	const gameId = await seedGame(deps, { startsAt: "2026-10-23T18:30", competition: "Practice match", opponent: "Northside 2" });
	const filmer = makeClient(deps), family = makeClient(deps, "p@x.com");
	await filmer(`/live?game=${gameId}`);
	const at = (melbourne: string) => { now = new Date(`${melbourne}+11:00`); };
	/** The 5-minute run, every 5 minutes from `from` up to `to` (local times on game night). */
	const cronUntil = async (from: string, to: string) => {
		for (let t = Date.parse(`2026-10-23T${from}+11:00`); t <= Date.parse(`2026-10-23T${to}+11:00`); t += 5 * 60_000) {
			now = new Date(t);
			await runSync(deps);
		}
	};
	const stream = () => deps.db.prepare("SELECT status FROM live_streams").first<string>("status");
	return { deps, gameId, filmer, family, at, cronUntil, stream };
}

describe("game night, start to finish", () => {
	it("filmed from tip-off: the stream stays up, families watch without the page reloading, and the video is saved", async () => {
		const { deps, gameId, filmer, family, at, cronUntil, stream } = await gameNight();
		at("2026-10-23T18:00:00");
		expect((await filmer("/live")).status).toBe(200); // set up at the stadium
		at("2026-10-23T18:30:00");
		const { data } = (await (await filmer(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }))).json()) as { data: { videoId: number } };
		deps.live.connected.add("live-1");
		await cronUntil("18:30:30", "19:35:30");
		expect(await stream()).toBe("open");
		expect(deps.live.inputs.get("live-1")!.enabled).toBe(true);
		const watching = await (await family(`/games/${gameId}`)).text();
		expect(watching).toContain("data-whep=");
		expect(watching).not.toContain('http-equiv="refresh"');
		expect(await (await family("/")).text()).toContain("LIVE NOW");
		at("2026-10-23T19:40:00"); // final buzzer: End game, Yes stop
		deps.live.connected.clear();
		expect(((await (await filmer(`/api/live/${gameId}/end`, jsonBody({}))).json()) as { data: unknown }).data).toEqual({ status: "ended" });
		const done = await filmer(`/api/uploads/${data.videoId}/complete`, jsonBody({ parts: [1, 2, 3].map((n) => ({ partNumber: n, etag: `e${n}` })) }));
		expect(((await done.json()) as { data: unknown }).data).toEqual({ status: "processing" });
		expect(await stream()).toBe("saved");
		const uid = (await getVideo(deps.db, deps.team.id, data.videoId))!.streamUid!;
		deps.stream.videos.set(uid, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 70 * 60 });
		await cronUntil("19:45:30", "20:00:30");
		expect(await getVideo(deps.db, deps.team.id, data.videoId)).toMatchObject({ status: "ready", durationSeconds: 4200 });
		expect(await (await family(`/games/${gameId}`)).text()).toContain(`/tok-${uid}/iframe`);
	});
	it("a filmer who taps Go live late (6:50pm, after the stream turns a day old) still streams to the same input", async () => {
		const { deps, gameId, filmer, at, cronUntil, stream } = await gameNight();
		at("2026-10-23T18:00:00");
		await filmer("/live");
		await cronUntil("18:40:30", "18:50:30");
		expect(await stream()).toBe("open");
		at("2026-10-23T18:50:45");
		const start = (await (await filmer(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }))).json()) as { data: { whipUrl: string } };
		expect(start.data.whipUrl).toBe("https://customer-dev.cloudflarestream.com/whip-live-1/webRTC/publish");
		expect(deps.live.inputs.size).toBe(1);
	});
});
