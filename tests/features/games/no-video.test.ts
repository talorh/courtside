import { describe, expect, it } from "vitest";
import { getGame } from "../../../src/features/games/games-repository.ts";
import { familiesForm, form, jsonBody, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { gameForm, seedGame, seedVideo } from "../../helpers/seed.ts";

// No video is a game's third Video choice on Add game and Edit, instead of its own button (neater), and nobody's rostered to film it. Test clock: Thu 15 Oct 2026, 11am.
const fields = { date: "2026-10-16", hour: "6", minute: "40", period: "pm", competition: "Practice match", roundLabel: "", opponent: "Lost Footage", venue: "Saints Stadium, Court 1" };
const gameOf = async (deps: TestDeps, id: number) => (await getGame(deps.db, deps.team.id, id))!;
const noVideoAt = (deps: TestDeps, id: number) => deps.db.prepare("SELECT no_video_at AS at FROM games WHERE id = ?").bind(id).first<string | null>("at");
const errorOf = async (res: Response) => ((await res.json()) as { error: { message: string } }).error.message;

describe("No video, a game's third Video choice", () => {
	it("Add game and Edit offer it; the game drops out of upload and Go live until it's Live stream or Record again", async () => {
		const deps = createTestDeps();
		const manager = makeClient(deps);
		const fixture = await (await manager("/fixture")).text();
		expect(fixture).toContain('<option value="none">No video</option>');
		expect(fixture).not.toContain("/no-video");
		expect((await manager("/fixture", form({ ...fields, video: "none" }))).headers.get("Location")).toBe("/fixture?done=novideo");
		const id = (await deps.db.prepare("SELECT id FROM games WHERE opponent = 'Lost Footage'").first<number>("id"))!;
		expect((await gameOf(deps, id)).noVideo).toBe(true);
		const saved = await (await manager("/fixture?done=novideo")).text();
		expect(saved).toContain("Saved as No video. It won&#39;t be offered for upload or Go live, and nobody&#39;s rostered to film it.");
		expect(saved.split("vs Lost Footage</a>")[1]).toMatch(/^[^]*?<span class="role">No video<\/span>/);
		expect(await (await manager(`/fixture?edit=${id}`)).text()).toContain('<option value="none" selected>');
		expect(await (await manager("/upload")).text()).not.toContain("Lost Footage");
		const upload = await manager("/api/uploads", jsonBody({ gameId: id, fileName: "a.mov", fileSize: 10, contentType: "video/quicktime" }));
		expect([upload.status, await errorOf(upload)]).toEqual([409, "This game is set to No video. Ask Sam to change that on the Fixture first."]);
		const live = await manager(`/api/live/${id}/browser`, jsonBody({ mimeType: "video/mp4" }));
		expect([live.status, await errorOf(live)]).toEqual([409, "This game is set to No video. Ask Sam to change that on the Fixture first."]);

		expect((await manager(`/fixture/${id}`, await gameForm(deps, id, { video: "record" }))).headers.get("Location")).toBe("/fixture?done=saved");
		expect(await gameOf(deps, id)).toMatchObject({ noVideo: false, liveStream: false });
		expect(await (await manager("/upload")).text()).toContain("Lost Footage");
	});

	it("keeps when it was first set, and leaves the game's Live stream or Record as it was", async () => {
		let now = new Date("2026-10-15T00:00:00Z");
		const deps = createTestDeps();
		(deps as { now: () => Date }).now = () => now;
		const manager = makeClient(deps);
		const id = await seedGame(deps, { startsAt: "2026-10-23T18:40" });
		await manager(`/fixture/${id}`, await gameForm(deps, id, { video: "record" }));
		await manager(`/fixture/${id}`, await gameForm(deps, id, { video: "none" }));
		expect(await noVideoAt(deps, id)).toBe("2026-10-15T00:00:00.000Z");
		now = new Date("2026-10-16T00:00:00Z");
		await manager(`/fixture/${id}`, await gameForm(deps, id, { venue: "Saints Stadium, Court 2" }));
		expect(await noVideoAt(deps, id)).toBe("2026-10-15T00:00:00.000Z");
		expect(await gameOf(deps, id)).toMatchObject({ noVideo: true, liveStream: false, venue: "Saints Stadium, Court 2" });
		const streamed = await seedGame(deps, { startsAt: "2026-10-30T18:40" });
		await manager(`/fixture/${streamed}`, await gameForm(deps, streamed, { video: "none" }));
		expect(await gameOf(deps, streamed)).toMatchObject({ noVideo: true, liveStream: true });
	});

	it("isn't allowed for a game that has its video (one that failed doesn't count)", async () => {
		const deps = createTestDeps();
		const manager = makeClient(deps);
		const filmed = await seedGame(deps, { opponent: "Filmed" });
		await seedVideo(deps, { gameId: filmed, streamUid: "u" });
		const res = await manager(`/fixture/${filmed}`, await gameForm(deps, filmed, { video: "none" }));
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("This game has a video, so it can&#39;t be No video. Delete the video first if it shouldn&#39;t be there.");
		expect((await gameOf(deps, filmed)).noVideo).toBe(false);
		const failed = await seedGame(deps, { opponent: "Failed" });
		await seedVideo(deps, { gameId: failed, status: "failed" });
		expect((await manager(`/fixture/${failed}`, await gameForm(deps, failed, { video: "none" }))).status).toBe(303);
		expect((await gameOf(deps, failed)).noVideo).toBe(true);
	});

	it("takes the game's video duty off the roster, and its match day message leaves Video out", async () => {
		const deps = createTestDeps();
		const manager = makeClient(deps);
		const next = await seedGame(deps, { startsAt: "2026-10-23T18:40", opponent: "Riverton Wolves" });
		await seedGame(deps, { startsAt: "2026-10-30T18:40", opponent: "Pine Valley" });
		await manager("/roster/families", familiesForm("Smith\nBruce\nBrown\nLee\nPatel"));
		await manager("/roster/generate", form({}));
		const videoWeeks = async () => (await deps.db.prepare("SELECT week FROM roster_slots WHERE duty = 'video' ORDER BY week").all<{ week: string }>()).results.map((r) => r.week);
		expect(await videoWeeks()).toEqual(["2026-10-19", "2026-10-26"]);
		await manager(`/fixture/${next}`, await gameForm(deps, next, { video: "none" }));
		const roster = await (await manager("/roster")).text();
		expect(await videoWeeks()).toEqual(["2026-10-26"]);
		expect(roster.split('id="w2026-10-19"')[1]?.split('id="w2026-10-26"')[0]).toContain('<span class="duty-name">Video</span><span class="duty-fams"><span class="duty-fam empty">No video</span></span>');
		expect(await (await manager("/roster/week/2026-10-19/message")).text()).not.toContain("🎥 Video");
		expect(await (await manager("/roster/week/2026-10-26/message")).text()).toContain("🎥 Video");
	});

	it("only a team manager can set it", async () => {
		const deps = createTestDeps();
		const id = await seedGame(deps);
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'p@x.com', 'watcher'), (?, 'c@x.com', 'coach')").bind(deps.team.id, deps.team.id).run();
		for (const who of ["p@x.com", "c@x.com"]) expect((await makeClient(deps, who)(`/fixture/${id}`, await gameForm(deps, id, { video: "none" }))).status).toBe(403);
		expect((await gameOf(deps, id)).noVideo).toBe(false);
	});
});
