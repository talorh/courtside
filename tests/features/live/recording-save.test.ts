import { describe, expect, it } from "vitest";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

const ATTEMPT = "4a5b6c7d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";

// Test clock: 2026-10-15T00:00Z = 11am Thursday 15 Oct in the club's time zone; the game is tonight. Sam films it.
async function filmed(attempt?: string) {
	let now = new Date("2026-10-15T00:00:00Z");
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	const team = deps.team.id;
	await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'sam@x.com', 'filmer'), (?, 'alex@x.com', 'filmer'), (?, 'coach@x.com', 'coach')")
		.bind(team, team, team).run();
	const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40" });
	const sam = makeClient(deps, "sam@x.com");
	const start = (body: object) => sam(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4", ...body }));
	const res = await start(attempt ? { attempt } : {});
	const { videoId } = ((await res.json()) as { data: { videoId: number } }).data;
	const video = async () => (await getVideo(deps.db, team, videoId))!;
	const uploadId = (await video()).r2UploadId!;
	const later = (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); };
	/** Parts that reached R2, `minutesAgo` before now. */
	const reached = (numbers: number[], minutesAgo = 10) => deps.presigner.parts.set(uploadId, numbers.map((partNumber) =>
		({ partNumber, etag: `"e${partNumber}"`, uploaded: new Date(now.getTime() - minutesAgo * 60_000).toISOString() })));
	const row = () => deps.db.prepare("SELECT status, cancel_reason FROM live_streams").first<{ status: string; cancel_reason: string | null }>();
	return { deps, gameId, videoId, sam, start, video, uploadId, later, reached, row };
}

const save = (client: ReturnType<typeof makeClient>, gameId: number) => client(`/api/live/${gameId}/save`, jsonBody({}));
const statusOf = async (res: Response) => ((await res.json()) as { data?: { status: string } }).data?.status;

describe("asking Go live to start again after a lost answer", () => {
	it("the same attempt gets the same recording back; anything else is told the game is being filmed", async () => {
		const { deps, gameId, videoId, start } = await filmed(ATTEMPT);
		const again = await start({ attempt: ATTEMPT });
		expect(again.status).toBe(201);
		expect(((await again.json()) as { data: { videoId: number } }).data.videoId).toBe(videoId);
		expect((await start({ attempt: "0a5b6c7d-1e2f-4a3b-8c4d-5e6f7a8b9c0d" })).status).toBe(409);
		expect((await start({})).status).toBe(409);
		expect((await makeClient(deps, "alex@x.com")(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4", attempt: ATTEMPT }))).status).toBe(409);
		expect([...deps.originals.created.keys()]).toEqual([expect.stringContaining(`/${ATTEMPT}/live-2026-10-15.mp4`)]);
	});
	it("a reload on a phone without the recording offers the filmer their own recording, and no one else", async () => {
		const { deps, videoId, sam } = await filmed(ATTEMPT);
		const mine = await (await sam("/live")).text();
		expect(mine).toContain(`data-recording="${videoId}" data-mine="1"`);
		expect(mine).toContain("<b>Your recording of this game isn't on this phone</b>");
		for (const other of ["alex@x.com", "coach@x.com"]) {
			const page = await (await makeClient(deps, other)("/live")).text();
			expect(page).toContain(`data-recording="${videoId}"`);
			expect(page).not.toContain('data-mine="1"');
		}
	});
});

describe("saving what was recorded when the phone stopped", () => {
	it("from any phone of the filmer's: R2's parts become the game video, and asking twice is fine", async () => {
		const { deps, gameId, sam, video, reached, row } = await filmed();
		reached([1, 2, 3]);
		expect(await statusOf(await save(sam, gameId))).toBe("saved");
		expect(await video()).toMatchObject({ status: "processing", streamUid: "uid-1", r2UploadId: null });
		expect(deps.originals.completed[0]?.parts).toEqual([1, 2, 3].map((n) => ({ partNumber: n, etag: `e${n}` })));
		expect(await row()).toMatchObject({ status: "saved" });
		expect(await statusOf(await save(sam, gameId))).toBe("saved");
		expect(deps.originals.completed).toHaveLength(1);
	});
	it("keeps only the run of parts from the start: a video needs its beginning", async () => {
		const { deps, gameId, sam, reached } = await filmed();
		reached([1, 2, 4, 5]);
		await save(sam, gameId);
		expect(deps.originals.completed[0]?.parts.map((p) => p.partNumber)).toEqual([1, 2]);
	});
	it("a recording R2 already made whole (the save that marks it got lost) is saved, by hand or by itself, never deleted", async () => {
		for (const how of ["by hand", "by itself"]) {
			const { deps, gameId, sam, video, uploadId, row, later } = await filmed();
			// R2 finished the upload, so its list of parts is gone, but the site never marked the video uploaded.
			deps.originals.completed.push({ key: (await video()).r2Key!, parts: [1, 2].map((n) => ({ partNumber: n, etag: `e${n}` })) });
			deps.presigner.gone.add(uploadId);
			if (how === "by hand") expect(await statusOf(await save(sam, gameId))).toBe("saved");
			else {
				later(25 * 60);
				await runSync(deps);
			}
			expect(await video(), how).toMatchObject({ status: "processing", streamUid: "uid-1" });
			expect(await row(), how).toMatchObject({ status: "saved" });
			expect(deps.originals.aborted, how).toEqual([]);
		}
	});
	it("nothing reached the site: the recording goes and the game is free again", async () => {
		const { deps, gameId, videoId, sam, reached, row } = await filmed();
		reached([2, 3]);
		expect(await statusOf(await save(sam, gameId))).toBe("nothing");
		expect(await getVideo(deps.db, deps.team.id, videoId)).toBeNull();
		expect(await row()).toMatchObject({ status: "cancelled", cancel_reason: expect.stringContaining("Nothing from the phone reached the site") });
		expect(deps.originals.aborted).toHaveLength(1);
		expect(await (await sam("/live")).text()).not.toContain(`data-recording="${videoId}"`);
	});
	it("asks the page to wait while a phone is still streaming it or still sending parts; refuses another filmer; a coach can", async () => {
		const { deps, gameId, sam, reached } = await filmed();
		reached([1], 1);
		const sending = await save(sam, gameId);
		expect(sending.status).toBe(200);
		expect(((await sending.json()) as { data: object }).data).toEqual({ status: "sending", retryIn: 20 });
		reached([1], 10);
		deps.live.connected.add("live-1");
		expect(((await (await save(sam, gameId)).json()) as { data: object }).data).toEqual({ status: "streaming", retryIn: 20 });
		deps.live.connected.clear();
		expect((await save(makeClient(deps, "alex@x.com"), gameId)).status).toBe(403);
		expect(await statusOf(await save(makeClient(deps, "coach@x.com"), gameId))).toBe("saved");
	});
	it("a recording nothing has come from for 24 hours saves itself; one quiet for less doesn't, so a phone has a day to find Wi-Fi", async () => {
		const { deps, video, later, reached } = await filmed();
		later(20 * 60);
		reached([1, 2], 16 * 60);
		await runSync(deps);
		expect((await video()).status).toBe("uploading");
		// A day old now, but its last part came 21 hours ago.
		later(5 * 60);
		await runSync(deps);
		expect((await video()).status).toBe("uploading");
		later(4 * 60);
		await runSync(deps);
		expect((await video()).status).toBe("processing");
	});
	it("once stopped, a stream Stream still calls connected isn't live: the game isn't shown live and its recording still saves itself", async () => {
		const { deps, gameId, sam, video, later, reached } = await filmed();
		later(5);
		expect((await sam(`/api/live/${gameId}/end`, jsonBody({}))).status).toBe(200);
		deps.live.connected.add("live-1");
		const lastLive = () => deps.db.prepare("SELECT last_live_at AS at FROM live_streams").first<{ at: string | null }>();
		await runSync(deps);
		expect((await lastLive())?.at).toBeNull();
		later(25 * 60);
		reached([1, 2], 25 * 60);
		await runSync(deps);
		expect((await video()).status).toBe("processing");
	});
	it("saves itself the same once the team's season is closed, which stops nothing on its way", async () => {
		const { deps, video, later, reached, row } = await filmed();
		reached([1, 2], 25 * 60);
		await deps.db.prepare("UPDATE teams SET status = 'closed', closed_at = ?, delete_after = '2027-12-31T13:00:00.000Z' WHERE id = ?").bind(deps.now().toISOString(), deps.team.id).run();
		later(25 * 60);
		await runSync(deps);
		expect((await video()).status).toBe("processing");
		expect(await row()).toMatchObject({ status: "saved" });
	});
	it("Delete it and start again won't delete a recording a phone is still streaming", async () => {
		const { deps, videoId, sam } = await filmed();
		deps.live.connected.add("live-1");
		expect((await sam(`/api/uploads/${videoId}/abort`, jsonBody({}))).status).toBe(409);
		deps.live.connected.clear();
		expect((await sam(`/api/uploads/${videoId}/abort`, jsonBody({}))).status).toBe(200);
		expect(await getVideo(deps.db, deps.team.id, videoId)).toBeNull();
	});
});
