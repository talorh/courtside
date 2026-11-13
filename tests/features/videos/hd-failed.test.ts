import { describe, expect, it } from "vitest";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { busyTeamIds } from "../../../src/jobs/all-teams-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

const problems = async (deps: ReturnType<typeof createTestDeps>) =>
	(await deps.db.prepare("SELECT what, times FROM problems WHERE team_id = ? AND kind = 'stream_problem'").bind(deps.team.id).all()).results;

describe("Stream saying it couldn't make a video's HD MP4", () => {
	it("is noted on the video, logged once and asked once more; the runs after leave the video alone", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "u1" });
		deps.stream.downloads.set("u1", "error");
		let asks = 0;
		const ask = deps.stream.generateDownload.bind(deps.stream);
		deps.stream.generateDownload = async (uid: string) => { asks++; await ask(uid); deps.stream.downloads.set(uid, "error"); };
		const warned: string[] = [];
		const warn = console.warn;
		console.warn = (line: string) => void warned.push(line);
		try {
			await runSync(deps);
		} finally {
			console.warn = warn;
		}
		expect(await getVideo(deps.db, deps.team.id, id)).toMatchObject({ status: "ready", hdReadyAt: null, hdFailedAt: deps.now().toISOString() });
		expect(asks).toBe(1);
		expect(warned.map((l) => JSON.parse(l))).toContainEqual(expect.objectContaining({ event: "hd_failed", videoId: id }));
		expect(await problems(deps)).toEqual([{ what: expect.stringContaining("HD"), times: 1 }]);
		expect(await busyTeamIds(deps.db, "2026-11-14")).not.toContain(deps.team.id);
		await runSync(deps);
		await runSync(deps);
		expect(asks).toBe(1);
		expect(await problems(deps)).toEqual([{ what: expect.stringContaining("HD"), times: 1 }]);
	});
});
