import { describe, expect, it, vi } from "vitest";
import { checkComingGames, checkGames, gameDayReadiness } from "../../../src/features/admin/game-day-checks.ts";
import { setAlert } from "../../../src/features/admin/alerts-service.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

/** Friday 13 Nov 2026 in the club's time zone (AEDT, UTC+11), a game at 6:40pm, the 5-minute job just run. `at`: local time. */
async function gameDay(at = "10:00"): Promise<TestDeps & { clock: (time: string) => void }> {
	let now = local(at);
	const deps = createTestDeps(now);
	(deps as { now: () => Date }).now = () => now;
	await seedGame(deps, { startsAt: "2026-11-13T18:40", competition: "Practice match", opponent: "Camberwell U12 Boys 2" });
	await setAlert(deps, "sync_job", "ok", "The last run was fine");
	return Object.assign(deps, { clock: (time: string) => { now = local(time); } });
}
const local = (time: string) => new Date(Date.parse(`2026-11-13T${time}:00+11:00`));
const alert = (deps: TestDeps) => deps.db.prepare("SELECT level, detail, checked_at FROM platform_alerts WHERE kind = 'game_day'").first<{ level: string; detail: string; checked_at: string }>();
const openInput = async (deps: TestDeps, gameId = 1) => {
	const input = await deps.live.createInput("Game", deps.team.id);
	await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, status, created_at) VALUES (?, ?, ?, 'open', ?)").bind(deps.team.id, gameId, input.uid, deps.now().toISOString()).run();
	return input.uid;
};
const sync = async (deps: TestDeps) => {
	await setAlert(deps, "sync_job", "ok", "The last run was fine");
	await checkComingGames(deps);
};

describe("the game check: each live game, 8 hours before tip-off", () => {
	it("checks nothing before a game is 8 hours away, then checks it once", async () => {
		const deps = await gameDay("10:35");
		await sync(deps);
		expect(await alert(deps)).toBeNull();
		deps.clock("10:40");
		await openInput(deps);
		await sync(deps);
		expect(await alert(deps)).toMatchObject({ level: "ok", detail: "1 live game in the next 8 hours: Saints U12 Boys 12.1 Fri 13 Nov 2026, 6:40pm v Camberwell U12 Boys 2. Stream answered with 1,035 minutes free, the Go live input is there, the joiner joined its test files in 12 seconds and the 5-minute job ran just now" });
		const first = (await alert(deps))!.checked_at;
		deps.clock("12:00");
		await sync(deps);
		expect((await alert(deps))!.checked_at).toBe(first);
		expect(deps.email.sent).toEqual([]);
	});

	it("checks the evening's second game when it's 8 hours away too", async () => {
		const deps = await gameDay("10:45");
		await seedGame(deps, { startsAt: "2026-11-13T19:40", competition: "Practice match", opponent: "Eltham 5" });
		await sync(deps);
		expect((await alert(deps))!.detail).toMatch(/^1 live game in the next 8 hours/);
		deps.clock("11:40");
		await sync(deps);
		expect((await alert(deps))!.detail).toMatch(/^2 live games in the next 8 hours: .*v Camberwell U12 Boys 2; .*v Eltham 5\./);
	});

	it("checks again every hour while something's wrong, and the ticket clears by itself once it's fine", async () => {
		const deps = await gameDay("10:45");
		deps.joiner.down = true;
		await sync(deps);
		expect(await alert(deps)).toMatchObject({ level: "warn", detail: expect.stringContaining("the joiner didn't answer") });
		expect(deps.email.sent.map((e) => e.subject)).toEqual(["Courtside: A coming game may have a problem (#1)"]);
		deps.joiner.down = false;
		deps.clock("11:15");
		await sync(deps);
		expect((await alert(deps))!.level).toBe("warn");
		deps.clock("11:50");
		await sync(deps);
		expect((await alert(deps))!.level).toBe("ok");
		expect(await deps.db.prepare("SELECT status FROM support_requests WHERE id = 1").first<{ status: string }>()).toEqual({ status: "resolved" });
		deps.joiner.down = true;
		deps.clock("19:00");
		await sync(deps);
		expect((await alert(deps))!.level).toBe("ok");
	});

	it("is urgent when Stream doesn't answer, or has too few minutes for the games, or the 5-minute job has stopped", async () => {
		const deps = await gameDay();
		deps.live.down = true;
		await checkGames(deps);
		expect(await alert(deps)).toMatchObject({ level: "urgent", detail: expect.stringContaining("Stream didn't answer") });
		deps.live.down = false;
		deps.live.usage = { usedMinutes: 1000, limitMinutes: 1100 };
		await checkGames(deps);
		expect(await alert(deps)).toMatchObject({ level: "urgent", detail: expect.stringContaining("only 100 minutes free for 1 game") });
		deps.live.usage = { usedMinutes: 65, limitMinutes: 1100 };
		await deps.db.prepare("UPDATE platform_alerts SET checked_at = '2026-11-12T20:00:00.000Z' WHERE kind = 'sync_job'").run();
		await checkGames(deps);
		expect(await alert(deps)).toMatchObject({ level: "urgent", detail: expect.stringContaining("the 5-minute job hasn't run since Fri 13 Nov 2026, 7:00am") });
	});

	it("warns when a game's Go live input has gone from Stream, or another alert is up", async () => {
		const deps = await gameDay();
		const uid = await openInput(deps);
		deps.live.inputs.delete(uid);
		await checkGames(deps);
		expect(await alert(deps)).toMatchObject({ level: "warn", detail: expect.stringContaining("Stream no longer has the Go live input for Saints U12 Boys 12.1's game (Go live will set up a new one)") });
		await deps.db.prepare("DELETE FROM live_streams").run();
		await setAlert(deps, "site_errors", "urgent", "12 server errors in the last hour");
		await checkGames(deps);
		expect(await alert(deps)).toMatchObject({ level: "urgent", detail: expect.stringContaining("alerts already up: Server errors (urgent)") });
	});

	it("a game set to No video or recorded and uploaded isn't a live game to check", async () => {
		const deps = await gameDay("11:00");
		await deps.db.prepare("UPDATE games SET no_video_at = '2026-11-01T00:00:00.000Z'").run();
		await seedGame(deps, { startsAt: "2026-11-13T19:00", opponent: "Eltham 5" });
		await deps.db.prepare("UPDATE games SET live_stream = 0 WHERE id = 2").run();
		await sync(deps);
		expect(await alert(deps)).toBeNull();
		expect(gameDayReadiness({ games: [], storage: { usedMinutes: 65, limitMinutes: 1100 }, joiner: { ok: true, bytes: 1, seconds: 3 }, syncCheckedAt: null, alerts: [], now: local("11:00"), within: "7 days", staging: false }).detail).toMatch(/^No live games in the next 7 days\./);
	});

	it("on staging the 5-minute job isn't expected (no scheduled jobs there)", async () => {
		const deps = await gameDay();
		await deps.db.prepare("DELETE FROM platform_alerts WHERE kind = 'sync_job'").run();
		await checkGames({ ...deps, config: { ...deps.config, staging: true } });
		expect(await alert(deps)).toMatchObject({ level: "ok", detail: expect.stringContaining("staging has no 5-minute job") });
	});

	it("never throws: a database that can't be read is logged as a problem", async () => {
		const deps = await gameDay("11:00");
		vi.spyOn(console, "error").mockImplementation(() => {});
		const db = { prepare: (sql: string) => { if (/FROM games/.test(sql)) throw new Error("D1 hiccup"); return deps.db.prepare(sql); }, batch: deps.db.batch.bind(deps.db) } as unknown as D1Database;
		await expect(checkComingGames({ ...deps, db })).resolves.toBeUndefined();
		expect((await deps.db.prepare("SELECT what FROM problems").all<{ what: string }>()).results.map((r) => r.what)).toContain("The admins' alert for Game check couldn't be updated");
	});
});

describe("the game check on Platform", () => {
	it("has its row in What's watched and a button that checks the week's live games now", async () => {
		const deps = await gameDay();
		const client = makeClient(deps);
		const page = await (await client("/admin/platform")).text();
		expect(page).toContain("<h3>The game check</h3>");
		expect(page).toContain("Not checked yet: the 5-minute job checks each live game 8 hours before tip-off");
		expect(page).toContain('<form method="post" action="/admin/run-game-day" class="inline"><button class="btn">Run the game check now</button></form>');
		const ran = await client("/admin/run-game-day", { method: "POST", body: new URLSearchParams() });
		expect([ran.status, ran.headers.get("Location")]).toEqual([303, "/admin/platform?done=gameday"]);
		const after = await (await client("/admin/platform?done=gameday")).text();
		expect(after).toContain("The game check ran: its row says how the week&#39;s live games stand.");
		expect(after).toMatch(/1 live game in the next 7 days/);
	});
});
