import { describe, expect, it } from "vitest";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// The win pop-up: the first time a member opens a game that's ready to watch and was won, a second of
// celebration over the page. Once per person per game; never for a member who hides scores.
const PAT = "p@x.com";
const POP = 'class="winpop"';
async function game(score: [string, string] | null, video: { status?: "ready" | "processing" } | null = {}) {
	const deps = createTestDeps();
	const gameId = await seedGame(deps, { startsAt: "2026-10-09T18:40", opponent: "Knox" });
	const videoId = video ? await seedVideo(deps, { gameId, streamUid: "u-knox", ...video }) : 0;
	if (score) await makeClient(deps)(`/games/${gameId}/score`, form({ ours: score[0], opponent: score[1] }));
	await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, 'Pat', 'watcher')").bind(deps.team.id, PAT).run();
	return { deps, gameId, videoId };
}
const open = async (deps: TestDeps, path: string, email = PAT) => (await makeClient(deps, email)(path)).text();
const seen = (deps: TestDeps) => deps.db.prepare("SELECT COUNT(*) AS n FROM win_seen WHERE team_id = ?").bind(deps.team.id).first<number>("n");

describe("the win pop-up on a game's page", () => {
	it("shows the first time a member opens a won game that's ready to watch: the game's name, no score, its script", async () => {
		const { deps, gameId } = await game(["34", "28"]);
		const page = await open(deps, `/games/${gameId}`);
		const pop = page.slice(page.indexOf(POP), page.indexOf("</main>"));
		expect(pop).toContain("<h2>Saints win!</h2>");
		expect(pop).toContain('<p class="wingame">Round 9 · vs Knox</p>');
		expect(pop).toContain('<img src="/club-mark.webp" alt="" width="400" height="320">');
		expect(pop).not.toMatch(/34|28/);
		expect(page).toContain('<script type="module" src="/win.js"></script>');
	});
	it("shows once: not when the same member opens the game again", async () => {
		const { deps, gameId } = await game(["34", "28"]);
		expect(await open(deps, `/games/${gameId}`)).toContain(POP);
		const again = await open(deps, `/games/${gameId}`);
		expect(again).not.toContain(POP);
		expect(again).not.toContain("/win.js");
		expect(again).toContain("Won 34 to 28");
	});
	it("is each member's own: one person seeing it doesn't use up another's", async () => {
		const { deps, gameId } = await game(["34", "28"]);
		expect(await open(deps, `/games/${gameId}`)).toContain(POP);
		expect(await open(deps, `/games/${gameId}`, "sam@saints.example")).toContain(POP);
		expect(await seen(deps)).toBe(2);
	});
	it("never shows for a loss or a draw, or a game with no score, and nothing is remembered", async () => {
		for (const score of [["28", "34"], ["30", "30"], null] as Array<[string, string] | null>) {
			const { deps, gameId } = await game(score);
			expect(await open(deps, `/games/${gameId}`), String(score)).not.toContain(POP);
			expect(await seen(deps)).toBe(0);
		}
	});
	it("never shows to a member who hides scores; once they show scores again, their first opening gets it", async () => {
		const { deps, gameId } = await game(["34", "28"]);
		await makeClient(deps, PAT)("/me/scores", form({ hide: "1", back: "/games" }));
		const hidden = await open(deps, `/games/${gameId}`);
		expect(hidden).not.toContain(POP);
		expect(hidden).not.toContain("Saints win");
		expect(await seen(deps)).toBe(0);
		await makeClient(deps, PAT)("/me/scores", form({ hide: "0", back: "/games" }));
		expect(await open(deps, `/games/${gameId}`)).toContain(POP);
	});
	it("waits for the video: not while it's processing or with no video, then on the first opening once it's ready", async () => {
		const none = await game(["34", "28"], null);
		expect(await open(none.deps, `/games/${none.gameId}`)).not.toContain(POP);
		const { deps, gameId, videoId } = await game(["34", "28"], { status: "processing" });
		expect(await open(deps, `/games/${gameId}`)).not.toContain(POP);
		expect(await seen(deps)).toBe(0);
		await deps.db.prepare("UPDATE videos SET status = 'ready' WHERE team_id = ? AND id = ?").bind(deps.team.id, videoId).run();
		deps.stream.videos.set("u-knox", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 2830 });
		expect(await open(deps, `/games/${gameId}`)).toContain(POP);
	});
	it("is for the full game: a highlight clip's page doesn't show it or use it up", async () => {
		const { deps, gameId, videoId } = await game(["34", "28"]);
		const clip = await deps.db.prepare(`INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, stream_uid, created_by, created_at)
			VALUES (?, ?, 'Steal', 10, 25, 'ready', 'c-steal', 1, '2026-10-11T04:00:00.000Z')`).bind(deps.team.id, videoId).run();
		expect(await open(deps, `/games/${gameId}?clip=${clip.meta.last_row_id}`)).not.toContain(POP);
		expect(await seen(deps)).toBe(0);
		expect(await open(deps, `/games/${gameId}`)).toContain(POP);
	});
	it("a score put right to a win afterwards still gets its pop-up", async () => {
		const { deps, gameId } = await game(["28", "34"]);
		expect(await open(deps, `/games/${gameId}`)).not.toContain(POP);
		await makeClient(deps)(`/games/${gameId}/score`, form({ ours: "36", opponent: "34" }));
		expect(await open(deps, `/games/${gameId}`)).toContain(POP);
	});
});
