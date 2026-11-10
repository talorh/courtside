import { describe, expect, it } from "vitest";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { form, jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

async function setup() {
	const deps = createTestDeps();
	for (const [email, name, role] of [["andrew@x.com", "Andrew", "coach"], ["f@x.com", "Fiona", "filmer"], ["p@x.com", "Pat", "watcher"]]) {
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)").bind(deps.team.id, email, name, role).run();
	}
	return { deps, gameId: await seedGame(deps), admin: makeClient(deps), coach: makeClient(deps, "andrew@x.com"), filmer: makeClient(deps, "f@x.com"), watcher: makeClient(deps, "p@x.com") };
}

describe("notifications", () => {
	it("follows a video from upload to HD MP4, for admins only", async () => {
		const { deps, gameId, admin, coach, filmer, watcher } = await setup();
		const started = await filmer("/api/uploads", jsonBody({ gameId, fileName: "IMG_1.MOV", fileSize: 20_000_000, contentType: "video/quicktime" }));
		const { data } = (await started.json()) as { data: { videoId: number } };
		expect(await (await admin("/notifications")).text()).toContain("Uploading from a parent");
		await filmer(`/api/uploads/${data.videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "e1" }, { partNumber: 2, etag: "e2" }] }));
		expect(await (await admin("/notifications")).text()).toContain("Uploaded, now being processed");
		deps.stream.videos.set("uid-1", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 2830 });
		await runSync(deps);
		expect(await (await admin("/notifications")).text()).toContain("HD MP4 download still being made");
		deps.stream.downloads.set("uid-1", "ready");
		expect(await runSync(deps)).toMatchObject({ hdReady: 1 });
		await watcher(`/videos/${data.videoId}/removal-requests`, form({ reason: "please" }));
		const adminPage = await (await admin("/notifications")).text();
		for (const text of ["<b>Fiona</b> started uploading", "<b>Fiona</b> finished uploading", "Ready to watch", "HD MP4 download ready"]) expect(adminPage).toContain(text);
		expect(adminPage).toContain("Nothing streaming, uploading or processing right now.");
		expect(adminPage).toContain("<b>Pat</b> asked for the video to be removed");
		expect(adminPage).toContain("1 open removal request.");
		expect((await watcher("/notifications")).status).toBe(403);
		expect((await filmer("/notifications")).status).toBe(403);
		expect((await coach("/notifications")).status).toBe(403);
		expect(await (await coach("/fixture")).text()).not.toContain('href="/notifications"');
		expect(await (await admin("/fixture")).text()).toContain('href="/notifications"');
	});
	it("re-asks Stream for an HD MP4 it has no record of", async () => {
		const { deps, gameId } = await setup();
		await deps.db.prepare("INSERT INTO videos (team_id, game_id, status, stream_uid, delete_after) VALUES (?, ?, 'ready', 'u7', '2028-10-14T00:00:00.000Z')").bind(deps.team.id, gameId).run();
		deps.stream.videos.set("u7", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 60 });
		await runSync(deps);
		expect(deps.stream.downloads.get("u7")).toBe("inprogress");
	});
});
