import { describe, expect, it } from "vitest";
import { getActiveVideoForGame, getVideo } from "../../../src/features/videos/videos-repository.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

const json = async (res: Response) => (await res.json()) as { data: Record<string, unknown> };

// Test clock: 11am Thursday 15 Oct in the club's time zone; the game is tonight. Go live, then paused (waiting for tip-off).
async function pausedSoon() {
	let now = new Date("2026-10-15T00:00:00Z");
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
	const client = makeClient(deps);
	const start = (await json(await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" })))).data as { videoId: number };
	const uploadId = (await getVideo(deps.db, deps.team.id, start.videoId))!.r2UploadId!;
	const reached = (count: number) => deps.presigner.parts.set(uploadId, Array.from({ length: count }, (_, i) =>
		({ partNumber: i + 1, etag: `"e${i + 1}"`, uploaded: now.toISOString() })));
	const later = (seconds: number) => { now = new Date(now.getTime() + seconds * 1000); };
	const end = (body: object) => client(`/api/live/${gameId}/end`, jsonBody(body));
	return { deps, gameId, client, reached, later, end };
}

describe("the test rule counts what was recorded, not the time since Go live", () => {
	it("stopped minutes in with only 30 seconds recorded (paused the rest): a test, and the game streams again", async () => {
		const { deps, gameId, client, reached, later, end } = await pausedSoon();
		later(4 * 60);
		reached(1);
		expect((await json(await end({ recordedSeconds: 30 }))).data).toEqual({ status: "test", seconds: 30 });
		expect(await getActiveVideoForGame(deps.db, deps.team.id, gameId)).toBeNull();
		expect(await (await client(`/games/${gameId}`)).text()).toContain("Only 30 seconds were recorded, so it was treated as a test and not saved.");
		expect((await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }))).status).toBe(201);
	});
	it("more than a minute's worth already in storage is kept, whatever the page counted", async () => {
		const { deps, gameId, reached, later, end } = await pausedSoon();
		later(4 * 60);
		reached(3);
		expect((await json(await end({ recordedSeconds: 30 }))).data).toEqual({ status: "ended" });
		expect((await getActiveVideoForGame(deps.db, deps.team.id, gameId))?.status).toBe("uploading");
	});
	it("a minute or more recorded is the game, and an old page that sends no count goes by the time since Go live", async () => {
		const first = await pausedSoon();
		first.later(4 * 60);
		expect((await json(await first.end({ recordedSeconds: 75 }))).data).toEqual({ status: "ended" });
		const old = await pausedSoon();
		old.later(4 * 60);
		expect((await json(await old.end({}))).data).toEqual({ status: "ended" });
	});
	it("storage not answering at End game ends the game as usual: the recording is kept, never thrown away on a guess", async () => {
		const { deps, gameId, later, end } = await pausedSoon();
		later(4 * 60);
		deps.presigner.listParts = () => Promise.reject(new Error("R2 timed out"));
		expect((await json(await end({ recordedSeconds: 30 }))).data).toEqual({ status: "ended" });
		expect((await getActiveVideoForGame(deps.db, deps.team.id, gameId))?.status).toBe("uploading");
	});
	it("refuses a count that isn't a number of seconds", async () => {
		const { later, end } = await pausedSoon();
		later(4 * 60);
		expect((await end({ recordedSeconds: -5 })).status).toBe(400);
	});
});
