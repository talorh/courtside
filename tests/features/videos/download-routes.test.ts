import { describe, expect, it } from "vitest";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

const kinds = (deps: ReturnType<typeof createTestDeps>) =>
	deps.db.prepare("SELECT kind FROM downloads ORDER BY id").all<{ kind: string }>().then((r) => r.results.map((x) => x.kind));

describe("downloads", () => {
	it("asks Stream to build the MP4 when missing, then redirects once ready", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "u1" });
		const client = makeClient(deps);
		const first = await client(`/videos/${id}/download/hd`);
		expect(first.status).toBe(409);
		expect(await first.text()).toContain("It&#39;s ready about 10 to 15 minutes after the game is ready to watch.");
		expect(deps.stream.downloads.get("u1")).toBe("inprogress");
		deps.stream.downloads.set("u1", "ready");
		const ready = await client(`/videos/${id}/download/hd`);
		expect(ready.status).toBe(302);
		expect(ready.headers.get("Location")).toBe(
			"https://customer-cust.cloudflarestream.com/tok-u1-dl/downloads/default.mp4?filename=saints-b12-1-2026-10-11-round-9-vs-lakeside-rockets.mp4");
		expect(await kinds(deps)).toEqual(["hd"]);
	});
	it("gives an iPhone the HD link as JSON (Save on a phone), logged as a download; or why it isn't ready", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "u1" });
		const client = makeClient(deps);
		const first = await client(`/api/videos/${id}/download/hd`);
		expect(first.status).toBe(409);
		expect(await first.json()).toEqual({ ok: false, error: { code: "conflict", message: "The HD video is still being made. It's ready about 10 to 15 minutes after the game is ready to watch. Please try again a bit later." } });
		expect(await kinds(deps)).toEqual([]);
		deps.stream.downloads.set("u1", "ready");
		expect(await (await client(`/api/videos/${id}/download/hd`)).json()).toEqual({ ok: true, data: {
			url: "https://customer-cust.cloudflarestream.com/tok-u1-dl/downloads/default.mp4?filename=saints-b12-1-2026-10-11-round-9-vs-lakeside-rockets.mp4",
			name: "saints-b12-1-2026-10-11-round-9-vs-lakeside-rockets.mp4",
		} });
		expect(await kinds(deps)).toEqual(["hd"]);
	});
	it("no longer offers the original file", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), streamUid: "u1", r2Key: "originals/a/IMG_1.MOV", originalName: "IMG_1.MOV" });
		expect((await makeClient(deps)(`/videos/${id}/download/original`)).status).toBe(404);
	});
	it("refuses downloads for a video that isn't ready", async () => {
		const deps = createTestDeps();
		const id = await seedVideo(deps, { gameId: await seedGame(deps), status: "processing", streamUid: "u1", r2Key: "originals/a.mov" });
		expect((await makeClient(deps)(`/videos/${id}/download/hd`)).status).toBe(409);
	});
});
