import { describe, expect, it } from "vitest";
import { jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

describe("upload routes", () => {
	it("with no played game left to upload, pre-selects the next game, not the furthest one", async () => {
		const deps = createTestDeps();
		await seedGame(deps, { startsAt: "2026-10-30T18:40", roundLabel: "11" });
		const next = await seedGame(deps, { startsAt: "2026-10-23T18:40", roundLabel: "10" });
		expect(await (await makeClient(deps)("/upload")).text()).toContain(`<option value="${next}" selected>`);
	});
	it("lists the latest game played first (picked), going back, then the games to come; none that have their video", async () => {
		const deps = createTestDeps();
		const older = await seedGame(deps, { startsAt: "2026-09-20T10:20", roundLabel: "7" });
		const latest = await seedGame(deps, { startsAt: "2026-10-04T10:20", roundLabel: "8" });
		const done = await seedGame(deps, { startsAt: "2026-10-11T11:40", roundLabel: "9" });
		await seedVideo(deps, { gameId: done, streamUid: "u" });
		const next = await seedGame(deps, { startsAt: "2026-10-18T09:00", roundLabel: "10" });
		const after = await seedGame(deps, { startsAt: "2026-10-25T09:00", roundLabel: "11" });
		const page = await (await makeClient(deps)("/upload")).text();
		expect(page).toContain(`<option value="${latest}" selected>`);
		expect(page).not.toContain(`<option value="${done}"`);
		const order = [...page.matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1]));
		expect(order).toEqual([latest, older, next, after]);
		const busy = await seedGame(deps, { startsAt: "2026-09-27T12:00", roundLabel: "7b" });
		await seedVideo(deps, { gameId: busy, status: "uploading", r2Key: "originals/busy.mov", r2UploadId: "up-b" });
		const again = await (await makeClient(deps)("/upload")).text();
		expect(again).toMatch(new RegExp(`<option value="${busy}">[^<]*\\(upload in progress, pick to carry on\\)</option>`));
		expect(page).toContain('src="/upload.js"');
		expect(page).toContain("<b>iPhone: save the video to Files first.</b>");
		expect(page).toContain('<label class="btn primary bigpick filepick" id="pick"><span id="pick-text">Choose the video</span><input id="file" type="file" accept="video/*"></label>');
		expect(page).toContain('<details class="panel tips" open><summary>Upload tips</summary>');
		// Only what's needed to upload; filming and the rest are in Help.
		expect(page).not.toContain("Filming tips");
		expect(page).toContain('More help: <a href="/help#record-iphone">iPhone</a> or <a href="/help#record-android">Android</a> in Help.');
		expect(page).not.toContain("<dialog");
		// The whole game in one video (the rule that matters most): first of the upload tips.
		expect(page).toContain('<summary>Upload tips</summary><ol class="steps">\n<li><b>One video of the whole game</b>, not one per quarter.</li>');
		expect(page).not.toContain('class="after-note"');
		expect(page).toContain('<p class="done-note" id="done-note" hidden>');
		expect(page).toContain('<span class="small drop-hint">On a computer you can also drag the video file onto this box.</span>');
		expect(page).toContain('<button class="btn quiet" type="button" id="cancel" hidden>Cancel upload</button>');
		expect(page).toContain("Save to Files");
		// Picked from Photos, the iPhone converts the video first: say so truthfully, and say the camera setting that keeps a game small.
		expect(page).toContain("the iPhone converts the whole game first");
		expect(page).not.toContain("twice as long");
		expect(page).not.toContain("4 to 8 GB");
	});
	it("runs the JSON flow with the standard envelope", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		const client = makeClient(deps);
		const start = await client("/api/uploads", jsonBody({ gameId, fileName: "a.mov", fileSize: 10, contentType: "video/quicktime" }));
		expect(start.status).toBe(201);
		const { data } = (await start.json()) as { data: { videoId: number } };
		const urls = await (await client(`/api/uploads/${data.videoId}/part-urls`, jsonBody({ partNumbers: [1] }))).json();
		expect(urls).toMatchObject({ ok: true, data: { urls: { 1: expect.stringContaining("partNumber=1") } } });
		const done = await (await client(`/api/uploads/${data.videoId}/complete`, jsonBody({ parts: [{ partNumber: 1, etag: "e" }] }))).json();
		expect(done).toEqual({ ok: true, data: { status: "processing" } });
	});
	it("validates input and blocks parents", async () => {
		const deps = createTestDeps();
		const gameId = await seedGame(deps);
		const bad = await makeClient(deps)("/api/uploads", jsonBody({ gameId, fileName: "a.txt", fileSize: 10, contentType: "text/plain" }));
		expect(bad.status).toBe(400);
		expect(((await bad.json()) as { error: { message: string } }).error.message).toContain("Choose a video file");
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'p@x.com', 'watcher')").bind(deps.team.id).run();
		expect((await makeClient(deps, "p@x.com")("/upload")).status).toBe(403);
	});
});
