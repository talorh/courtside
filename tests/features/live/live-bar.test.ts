import { describe, expect, it } from "vitest";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";
import { addTeam } from "../../helpers/two-teams.ts";

// The bar along the top of a team's pages while one of its games is being streamed: the game, and Watch live. The
// 5-minute job notes a stream it sees sending (last_live_at), so "live" is a stream noted in the last 8 minutes and not
// ended. Test clock: 2026-10-15T08:00Z, 7pm in the club's time zone; the game started at 6:40pm.
const NOW = "2026-10-15T08:00:00.000Z";
const minutesAgo = (m: number) => new Date(Date.parse(NOW) - m * 60_000).toISOString();

async function streaming(deps: TestDeps, seen: string | null, ended: string | null = null, team = deps.team.id) {
	const gameId = await seedGame(deps, { startsAt: "2026-10-15T18:40", opponent: "Pine Valley", roundLabel: "7" });
	await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at, last_live_at, end_requested_at) VALUES (?, ?, ?, 1, ?, ?, ?)")
		.bind(team, gameId, `in-${gameId}`, minutesAgo(30), seen, ended).run();
	return gameId;
}

const page = async (deps: TestDeps, path: string) => (await makeClient(deps)(path)).text();
const BAR = 'class="livebar"';

describe("the live bar", () => {
	it("is along the top of the team's other pages while a game is streaming: the game, and Watch live, to its page", async () => {
		const deps = createTestDeps(new Date(NOW));
		const gameId = await streaming(deps, minutesAgo(3));
		for (const path of ["/fixture", "/photos", "/help", "/roster"]) {
			const html = await page(deps, path);
			expect([path, html.includes(BAR)]).toEqual([path, true]);
		}
		const html = await page(deps, "/fixture");
		expect(html).toContain(`<a class="livebar" href="/games/${gameId}">`);
		expect(html).toContain("LIVE NOW");
		expect(html).toContain("Round 7 · vs Pine Valley");
		expect(html).toContain("Watch live");
	});
	it("isn't on Home or Watch games (their LIVE NOW cards say it), Go live, or the live game's own page", async () => {
		const deps = createTestDeps(new Date(NOW));
		const gameId = await streaming(deps, minutesAgo(3));
		for (const path of ["/", "/games", "/live", `/games/${gameId}`]) {
			const html = await page(deps, path);
			expect([path, html.includes(BAR)]).toEqual([path, false]);
		}
	});
	it("only while it's streaming: not once End game is tapped, not when nothing's come in for 8 minutes, not before Go live", async () => {
		for (const [seen, ended] of [[minutesAgo(3), minutesAgo(1)], [minutesAgo(9), null], [null, null]] as const) {
			const deps = createTestDeps(new Date(NOW));
			await streaming(deps, seen, ended);
			expect([seen, ended, (await page(deps, "/fixture")).includes(BAR)]).toEqual([seen, ended, false]);
		}
	});
	it("costs a download link nothing: no database read for an /api/ address", async () => {
		const deps = createTestDeps(new Date(NOW));
		await streaming(deps, minutesAgo(3));
		const reads: string[] = [];
		const prepare = deps.db.prepare.bind(deps.db);
		deps.db.prepare = ((sql: string) => (reads.push(sql), prepare(sql))) as typeof deps.db.prepare;
		await makeClient(deps)("/api/videos/999/download/hd");
		expect(reads.filter((sql) => sql.includes("live_streams ls"))).toEqual([]);
		await page(deps, "/fixture");
		expect(reads.filter((sql) => sql.includes("live_streams ls"))).toHaveLength(1);
	});
	it("is the team's own games only: another team's stream shows nothing here", async () => {
		const deps = createTestDeps(new Date(NOW));
		const other = (await addTeam(deps.db)).id;
		await streaming(deps, minutesAgo(3), null, other);
		expect(await page(deps, "/fixture")).not.toContain(BAR);
	});
});
