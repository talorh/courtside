import { describe, expect, it, vi } from "vitest";
import { checkGameDay, gameDayReadiness, sundayAfter } from "../../../src/features/admin/game-day-checks.ts";
import { setAlert } from "../../../src/features/admin/alerts-service.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

/** Wednesday 11 Nov 2026, 9am local time, with a game on the Friday and the 5-minute job just run. */
async function midweek(): Promise<TestDeps> {
	const deps = createTestDeps(new Date("2026-11-10T22:00:00Z"));
	await seedGame(deps, { startsAt: "2026-11-13T18:40", competition: "Practice match", opponent: "Camberwell U12 Boys 2" });
	await setAlert(deps, "sync_job", "ok", "The last run was fine");
	return deps;
}
const alert = (deps: TestDeps) => deps.db.prepare("SELECT level, detail FROM platform_alerts WHERE kind = 'game_day'").first<{ level: string; detail: string }>();
const openInput = async (deps: TestDeps, gameId = 1) => {
	const input = await deps.live.createInput("Game", deps.team.id);
	await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, status, created_at) VALUES (?, ?, ?, 'open', ?)").bind(deps.team.id, gameId, input.uid, deps.now().toISOString()).run();
	return input.uid;
};

describe("the Friday check: are the weekend's games good to go", () => {
	it("looks up to Sunday", () => {
		expect(sundayAfter("2026-11-11")).toBe("2026-11-15");
		expect(sundayAfter("2026-11-13")).toBe("2026-11-15");
		expect(sundayAfter("2026-11-15")).toBe("2026-11-15");
	});

	it("is ok when Stream answers with minutes to spare, every Go live input is there, the joiner joins and the 5-minute job is running", async () => {
		const deps = await midweek();
		await openInput(deps);
		await checkGameDay(deps);
		expect(await alert(deps)).toEqual({ level: "ok", detail: "1 live game up to Sun 15 Nov 2026: Saints U12 Boys 12.1 Fri 13 Nov 2026, 6:40pm v Camberwell U12 Boys 2. Stream answered with 1,035 minutes free, the Go live input is there, the joiner joined its test files in 12 seconds and the 5-minute job ran just now" });
		expect(deps.email.sent).toEqual([]);
	});

	it("is urgent when Stream doesn't answer, or has too few minutes for the games, or the 5-minute job has stopped", async () => {
		const deps = await midweek();
		deps.live.down = true;
		await checkGameDay(deps);
		expect(await alert(deps)).toMatchObject({ level: "urgent", detail: expect.stringContaining("Stream didn't answer") });
		deps.live.down = false;
		deps.live.usage = { usedMinutes: 1000, limitMinutes: 1100 };
		await checkGameDay(deps);
		expect(await alert(deps)).toMatchObject({ level: "urgent", detail: expect.stringContaining("only 100 minutes free for 1 game") });
		deps.live.usage = { usedMinutes: 65, limitMinutes: 1100 };
		await deps.db.prepare("UPDATE platform_alerts SET checked_at = '2026-11-10T20:00:00.000Z' WHERE kind = 'sync_job'").run();
		await checkGameDay(deps);
		expect(await alert(deps)).toMatchObject({ level: "urgent", detail: expect.stringContaining("the 5-minute job hasn't run since Wed 11 Nov 2026, 7:00am") });
	});

	it("warns when a game's Go live input has gone from Stream, the joiner doesn't answer, or another alert is up", async () => {
		const deps = await midweek();
		const uid = await openInput(deps);
		deps.live.inputs.delete(uid);
		await checkGameDay(deps);
		expect(await alert(deps)).toMatchObject({ level: "warn", detail: expect.stringContaining("Stream no longer has the Go live input for Saints U12 Boys 12.1's game (Go live will set up a new one)") });
		await deps.db.prepare("DELETE FROM live_streams").run();
		deps.joiner.down = true;
		await checkGameDay(deps);
		expect(await alert(deps)).toMatchObject({ level: "warn", detail: expect.stringContaining("the joiner didn't answer") });
		deps.joiner.down = false;
		await setAlert(deps, "site_errors", "urgent", "12 server errors in the last hour");
		await checkGameDay(deps);
		expect(await alert(deps)).toMatchObject({ level: "urgent", detail: expect.stringContaining("alerts already up: Server errors (urgent)") });
	});

	it("raises a ticket for the admins when something's wrong, and clears it by itself when the next check is fine", async () => {
		const deps = await midweek();
		deps.joiner.down = true;
		await checkGameDay(deps);
		expect(deps.email.sent.map((e) => e.subject)).toEqual(["Courtside: The weekend's games may have a problem (#1)"]);
		expect(deps.email.sent[0]!.text).toContain("What to do:");
		deps.joiner.down = false;
		await checkGameDay(deps);
		expect(await deps.db.prepare("SELECT status FROM support_requests WHERE id = 1").first<{ status: string }>()).toEqual({ status: "resolved" });
		expect(deps.email.sent).toHaveLength(1);
	});

	it("with no games up to Sunday, says so and still checks the site", async () => {
		const deps = createTestDeps(new Date("2026-11-16T22:00:00Z"));
		await setAlert(deps, "sync_job", "ok", "The last run was fine");
		await checkGameDay(deps);
		expect(await alert(deps)).toMatchObject({ level: "ok", detail: expect.stringMatching(/^No live games up to Sun 22 Nov 2026\. Stream answered/) });
	});

	it("a game set to No video or recorded and uploaded isn't a live game to check", async () => {
		const deps = await midweek();
		await deps.db.prepare("UPDATE games SET no_video_at = '2026-11-01T00:00:00.000Z'").run();
		await seedGame(deps, { startsAt: "2026-11-14T10:00", opponent: "Eltham 5" });
		await deps.db.prepare("UPDATE games SET live_stream = 0 WHERE id = 2").run();
		expect(gameDayReadiness({ games: [], storage: { usedMinutes: 65, limitMinutes: 1100 }, joiner: { ok: true, bytes: 1, seconds: 3 }, syncCheckedAt: null, alerts: [], now: new Date("2026-11-10T22:00:00Z"), until: "2026-11-15", staging: false }).detail).toMatch(/^No live games up to Sun 15 Nov 2026/);
		await checkGameDay(deps);
		expect((await alert(deps))!.detail).toMatch(/^No live games up to Sun 15 Nov 2026/);
	});

	it("on staging the 5-minute job isn't expected (no scheduled jobs there)", async () => {
		const deps = await midweek();
		await deps.db.prepare("DELETE FROM platform_alerts WHERE kind = 'sync_job'").run();
		await checkGameDay({ ...deps, config: { ...deps.config, staging: true } });
		expect(await alert(deps)).toMatchObject({ level: "ok", detail: expect.stringContaining("staging has no 5-minute job") });
	});

	it("never throws: a database that can't be read is logged as a problem", async () => {
		const deps = await midweek();
		vi.spyOn(console, "error").mockImplementation(() => {});
		const db = { prepare: (sql: string) => { if (/FROM games/.test(sql)) throw new Error("D1 hiccup"); return deps.db.prepare(sql); }, batch: deps.db.batch.bind(deps.db) } as unknown as D1Database;
		await expect(checkGameDay({ ...deps, db })).resolves.toBeUndefined();
		expect((await deps.db.prepare("SELECT what FROM problems").all<{ what: string }>()).results.map((r) => r.what)).toContain("The admins' alert for Friday check couldn't be updated");
	});
});

describe("the Friday check on Platform", () => {
	it("has its row in What's watched and a button that runs it now", async () => {
		const deps = await midweek();
		const client = makeClient(deps);
		const page = await (await client("/admin/platform")).text();
		expect(page).toContain("<h3>The Friday check</h3>");
		expect(page).toContain("Not checked yet: it runs at 6am every Friday");
		expect(page).toContain('<form method="post" action="/admin/run-game-day" class="inline"><button class="btn">Run the Friday check now</button></form>');
		const ran = await client("/admin/run-game-day", { method: "POST", body: new URLSearchParams() });
		expect([ran.status, ran.headers.get("Location")]).toEqual([303, "/admin/platform?done=gameday"]);
		const after = await (await client("/admin/platform?done=gameday")).text();
		expect(after).toContain("The Friday check ran: its row says how the weekend&#39;s games stand.");
		expect(after).toMatch(/1 live game up to Sun 15 Nov 2026/);
	});
});
