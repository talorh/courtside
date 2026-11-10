import { describe, expect, it } from "vitest";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// Favourite a game or a highlight clip, shown under Watch games ("Your favourites").
// Each member's own. A star on the game page and on each clip in its side panel; plain form posts.
const PAT = "p@x.com";
async function gameWithClip(deps: TestDeps, opponent = "Lakeside Rockets") {
	const gameId = await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent });
	const videoId = await seedVideo(deps, { gameId, streamUid: `u-${opponent}` });
	const clip = await deps.db.prepare(`INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, stream_uid)
		VALUES (?, ?, 'Steph from way downtown', 100, 112, 'ready', ?)`).bind(deps.team.id, videoId, `c-${opponent}`).run();
	return { gameId, videoId, clipId: clip.meta.last_row_id };
}
async function setUp() {
	const deps = createTestDeps();
	await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, 'Pat', 'watcher')").bind(deps.team.id, PAT).run();
	return { deps, pat: makeClient(deps, PAT), ...(await gameWithClip(deps)) };
}
const favourites = async (client: ReturnType<typeof makeClient>) => {
	const page = await (await client("/games")).text();
	return page.includes('class="favs"') ? page.split('class="favs"')[1]!.split("</section>")[0]! : "";
};

describe("favourites", () => {
	it("a member stars a game on its page, it shows under Your favourites on Watch games, and unstarring takes it off", async () => {
		const { pat, gameId } = await setUp();
		expect(await favourites(pat)).toBe("");
		expect(await (await pat(`/games/${gameId}`)).text()).toContain(`action="/games/${gameId}/favourite"`);
		const res = await pat(`/games/${gameId}/favourite`, form({ on: "1", back: `/games/${gameId}` }));
		expect(res.headers.get("Location")).toBe(`/games/${gameId}`);
		expect(await favourites(pat)).toContain(`href="/games/${gameId}"`);
		expect(await (await pat(`/games/${gameId}`)).text()).toContain('aria-pressed="true"');
		expect((await pat(`/games/${gameId}/favourite`, form({ on: "1", back: "/games" }))).status).toBe(303); // twice is still once
		expect((await favourites(pat)).split(`href="/games/${gameId}"`).length).toBe(2);
		await pat(`/games/${gameId}/favourite`, form({ on: "0", back: "/games" }));
		expect(await favourites(pat)).toBe("");
	});

	it("a highlight clip starred in the side panel shows as a row that opens the clip", async () => {
		const { pat, gameId, clipId } = await setUp();
		expect(await (await pat(`/games/${gameId}`)).text()).toContain(`action="/clips/${clipId}/favourite"`);
		await pat(`/clips/${clipId}/favourite`, form({ on: "1", back: `/games/${gameId}?clip=${clipId}` }));
		const favs = await favourites(pat);
		expect(favs).toContain(`href="/games/${gameId}?clip=${clipId}"`);
		expect(favs).toContain("Steph from way downtown");
		expect(favs).toContain("vs Lakeside Rockets");
	});

	it("each member sees only their own", async () => {
		const { deps, pat, gameId, clipId } = await setUp();
		await pat(`/games/${gameId}/favourite`, form({ on: "1", back: "/games" }));
		await pat(`/clips/${clipId}/favourite`, form({ on: "1", back: "/games" }));
		expect(await favourites(makeClient(deps))).toBe("");
		expect(await (await makeClient(deps)(`/games/${gameId}`)).text()).not.toContain('aria-pressed="true"');
	});

	it("a deleted clip, video or game drops out", async () => {
		const { deps, pat, gameId, clipId } = await setUp();
		const other = await gameWithClip(deps, "Riverton Wolves");
		for (const [path, back] of [[`/games/${gameId}/favourite`, "/games"], [`/clips/${clipId}/favourite`, "/games"], [`/clips/${other.clipId}/favourite`, "/games"], [`/games/${other.gameId}/favourite`, "/games"]]) {
			await pat(path!, form({ on: "1", back: back! }));
		}
		const manager = makeClient(deps);
		await manager(`/clips/${clipId}/delete`, form({ confirm: "yes" }));
		expect(await favourites(pat)).not.toContain(`clip=${clipId}`);
		await manager(`/videos/${other.videoId}/delete`, form({ confirm: "yes" }));
		expect(await favourites(pat)).not.toContain(`clip=${other.clipId}`);
		await manager(`/fixture/${other.gameId}/delete-all`, form({ confirm: "yes" }));
		expect(await favourites(pat)).not.toContain(`href="/games/${other.gameId}"`);
		expect(await favourites(pat)).toContain(`href="/games/${gameId}"`);
	});

	it("only for games and clips that are there, and only back to Watch games or a game page", async () => {
		const { pat, gameId } = await setUp();
		expect((await pat("/games/999/favourite", form({ on: "1", back: "/games" }))).status).toBe(404);
		expect((await pat("/clips/999/favourite", form({ on: "1", back: "/games" }))).status).toBe(404);
		expect((await pat(`/games/${gameId}/favourite`, form({ on: "1", back: "//evil.example" }))).status).toBe(400);
	});
});
