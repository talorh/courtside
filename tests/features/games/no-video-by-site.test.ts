import { describe, expect, it } from "vitest";
import { getGame } from "../../../src/features/games/games-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// The site's No video (a week on with nothing filmed) is a team manager's to undo one game at a time (Edit): switches
// for many games at once are about games still to be filmed, so they leave it alone. local is UTC+11 in November.
const later = (deps: TestDeps, iso: string) => { (deps as { now: () => Date }).now = () => new Date(iso); };
const noVideo = async (deps: TestDeps, id: number) => (await getGame(deps.db, deps.team.id, id))!.noVideo;

describe("the site's own No video", () => {
	it("a PlayHQ fixture switched back to Video clears its own No video, not the site's on a game nobody filmed", async () => {
		const deps = createTestDeps(new Date("2026-11-01T00:00:00Z"));
		const link = "https://www.playhq.com/example-association/org/x/y/teams/saints-b12\.1-2026-1/aaaa1111";
		deps.playhq.teams.set("aaaa1111", { name: "Tournament", games: [
			{ id: "t1", round: "Round 1", date: "2026-11-07", time: "09:00", opponent: "Lakeside", venue: "" },
			{ id: "t2", round: "Round 2", date: "2026-11-21", time: "09:00", opponent: "Riverton", venue: "" },
		] });
		const manager = makeClient(deps);
		await manager("/fixture/link", form({ url: link, competition: "Tournament" }));
		const id = async (opponent: string) => (await deps.db.prepare("SELECT id FROM games WHERE opponent = ?").bind(opponent).first<number>("id"))!;
		const [lakeside, riverton] = [await id("Lakeside"), await id("Riverton")];
		later(deps, "2026-11-14T00:00:00Z"); // Lakeside's game was a week ago, nothing filmed
		await runSync(deps);
		expect(await noVideo(deps, lakeside)).toBe(true);
		const fixture = (await deps.db.prepare("SELECT id FROM playhq_fixtures").first<number>("id"))!;
		await manager(`/fixture/playhq/${fixture}/no-video`, form({}));
		await manager(`/fixture/playhq/${fixture}/video`, form({}));
		expect([await noVideo(deps, lakeside), await noVideo(deps, riverton)]).toEqual([true, false]);
	});
	it("a week switched back to Video does the same", async () => {
		const deps = createTestDeps(new Date("2026-11-13T00:00:00Z"));
		const friday = await seedGame(deps, { startsAt: "2026-11-13T19:35" });
		const sunday = await seedGame(deps, { startsAt: "2026-11-15T18:00" });
		later(deps, "2026-11-21T00:00:00Z"); // 11am Saturday: Friday's game a week on, nothing filmed
		await runSync(deps);
		expect(await noVideo(deps, friday)).toBe(true);
		const manager = makeClient(deps);
		await manager("/roster/week/2026-11-09/no-video", form({}));
		expect(await noVideo(deps, sunday)).toBe(true);
		await manager("/roster/week/2026-11-09/video", form({}));
		expect([await noVideo(deps, friday), await noVideo(deps, sunday)]).toEqual([true, false]);
	});
	it("a game whose video a team manager deleted (to replace it, say) is left alone; a stream thrown away as a test isn't a video", async () => {
		const deps = createTestDeps(new Date("2026-11-13T00:00:00Z"));
		const deleted = await seedGame(deps, { startsAt: "2026-11-13T19:35" });
		const tested = await seedGame(deps, { startsAt: "2026-11-13T19:35" });
		for (const [gameId, reason] of [[deleted, "admin"], [tested, "live_test"]] as const) {
			const videoId = await seedVideo(deps, { gameId, status: "ready", streamUid: `s${gameId}` });
			await deps.db.prepare("UPDATE videos SET deleted_at = ?, deleted_reason = ? WHERE id = ?").bind("2026-11-13T10:00:00.000Z", reason, videoId).run();
		}
		later(deps, "2026-11-21T00:00:00Z");
		await runSync(deps);
		expect([await noVideo(deps, deleted), await noVideo(deps, tested)]).toEqual([false, true]);
	});
	it("the game's page stops waiting for a live stream once the game is over, when Go live was only opened", async () => {
		const deps = createTestDeps(new Date("2026-11-08T05:00:00Z")); // 4pm Sunday
		const gameId = await seedGame(deps, { startsAt: "2026-11-08T16:40" });
		await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at) VALUES (?, ?, 'in-open', 1, ?)")
			.bind(deps.team.id, gameId, "2026-11-08T04:39:00.000Z").run();
		deps.live.inputs.set("in-open", { name: "Go live opened", enabled: true });
		const waiting = "The live stream hasn't started yet";
		expect(await (await makeClient(deps)(`/games/${gameId}`)).text()).toContain(waiting);
		later(deps, "2026-11-08T06:45:00Z"); // 5:45pm: the game's hour is up
		const page = await (await makeClient(deps)(`/games/${gameId}`)).text();
		expect(page).not.toContain(waiting);
		expect(page).toContain("No video for this game yet.");
	});
});
