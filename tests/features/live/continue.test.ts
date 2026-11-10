import { describe, expect, it } from "vitest";
import { listSegments } from "../../../src/features/live/recording-segments-repository.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

const IPHONE = { headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1" } };
const data = async <T,>(res: Response) => ((await res.json()) as { data: T }).data;

// Test clock: 7:40pm Thursday 15 Oct in the club's time zone; Sam went live on tonight's game and the page died.
async function closedMidGame() {
	let now = new Date("2026-10-15T08:40:00Z");
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	const team = deps.team.id;
	await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'sam@x.com', 'filmer'), (?, 'alex@x.com', 'filmer'), (?, 'coach@x.com', 'coach')").bind(team, team, team).run();
	const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
	const sam = makeClient(deps, "sam@x.com");
	const start = await data<{ videoId: number }>(await sam(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" })));
	const uploadId = [...deps.originals.created.values()][0]!;
	const reached = (numbers: number[], minutesAgo: number) => deps.presigner.parts.set(uploadId, numbers.map((partNumber) => ({ partNumber, etag: `"e${partNumber}"`, uploaded: new Date(now.getTime() - minutesAgo * 60_000).toISOString() })));
	const carryOn = (client = sam, body: object = { videoId: start.videoId, mimeType: "video/mp4" }) => client(`/api/live/${gameId}/continue`, { ...jsonBody(body), ...IPHONE });
	const later = (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); };
	return { deps, gameId, sam, start, reached, carryOn, later };
}

describe("Carry on streaming after the page closed", () => {
	it("opens segment 2 beside the recording, on the same stream input, and logs how long was lost", async () => {
		const { deps, start, reached, carryOn, later } = await closedMidGame();
		later(20);
		reached([1, 2], 12);
		const res = await carryOn();
		expect(res.status).toBe(201);
		expect(await data<object>(res)).toEqual({ segment: 2, videoId: start.videoId, partSize: 8 * 1024 * 1024, whipUrl: "https://customer-dev.cloudflarestream.com/whip-live-1/webRTC/publish" });
		const [segment] = await listSegments(deps.db, deps.team.id, start.videoId);
		expect(segment).toMatchObject({ n: 2, r2UploadId: "up-2" });
		expect(segment!.r2Key).toMatch(/\/live-2026-10-15\.2\.mp4$/);
		expect(deps.live.inputs.get("live-1")?.enabled).toBe(true);
		const log = await deps.db.prepare("SELECT detail, device FROM admin_log WHERE action = 'live_continued'").first<{ detail: string; device: string }>();
		expect(log).toMatchObject({ detail: expect.stringContaining("carried on after the page closed; about 12 minutes not recorded"), device: "iPhone, Safari" });
		expect((await deps.db.prepare("SELECT COUNT(*) AS n FROM live_streams WHERE status = 'open'").first<{ n: number }>())!.n).toBe(1);
		// A second carry on makes segment 3.
		expect((await data<{ segment: number }>(await carryOn())).segment).toBe(3);
	});
	it("waits while a part arrived in the last two minutes (a tab still alive), and refuses another container, another person, an ended stream and a wrong recording", async () => {
		const { deps, gameId, sam, start, reached, carryOn, later } = await closedMidGame();
		later(20);
		reached([1], 1);
		expect(await data<object>(await carryOn())).toEqual({ status: "sending", retryIn: 20, waitLeft: 60 });
		reached([1], 10);
		expect((await carryOn(sam, { videoId: start.videoId, mimeType: "video/webm" })).status).toBe(409);
		expect((await carryOn(makeClient(deps, "alex@x.com"))).status).toBe(403);
		expect((await carryOn(makeClient(deps, "coach@x.com"))).status).toBe(403);
		expect((await carryOn(sam, { videoId: start.videoId + 7, mimeType: "video/mp4" })).status).toBe(404);
		await sam(`/api/live/${gameId}/end`, jsonBody({ recordedSeconds: 900 }));
		const ended = await carryOn();
		expect(ended.status).toBe(409);
		expect(await ended.text()).toContain("ended");
	});
	it("while Stream still says the phone is connected it waits too", async () => {
		const { deps, reached, carryOn, later } = await closedMidGame();
		later(20);
		reached([1], 10);
		deps.live.connected.add("live-1");
		expect(await data<object>(await carryOn())).toEqual({ status: "streaming", retryIn: 20 });
	});
});
