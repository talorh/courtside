import { afterEach, describe, expect, it, vi } from "vitest";
import { closeSeasonsOver } from "../../src/jobs/close-seasons.ts";
import { runDaily } from "../../src/jobs/daily.ts";
import { runSync } from "../../src/jobs/sync-videos.ts";
import { makeClient } from "../helpers/app.ts";
import { B12_1, createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { addTeam, G14_5, seedTeam } from "../helpers/two-teams.ts";

afterEach(() => vi.restoreAllMocks());

const G = G14_5.id;
// The 2026/27 season's videos and photos are due at the end of Fri 31 Dec 2027 in the club's time zone (midnight AEDT).
const DUE = "2027-12-31T13:00:00.000Z";
// 11pm on Fri 31 Dec 2027 there, an hour before it's due, and the 3am job's run on Sat 1 Jan 2028 after it.
const NEW_YEARS_EVE = new Date("2027-12-31T12:00:00Z");
const NEW_YEARS_3AM = new Date("2027-12-31T16:00:00Z");

async function g14At(now: Date) {
	const deps = createTestDeps(now);
	await addTeam(deps.db, G14_5);
	const g = await seedTeam(deps, G14_5, "g");
	return { deps, g };
}
const team = (deps: TestDeps, id = G) => deps.db.prepare("SELECT status, closed_at, delete_after FROM teams WHERE id = ?").bind(id).first();
const lines = async (deps: TestDeps) =>
	(await deps.db.prepare("SELECT admin_email, device, action, detail FROM admin_log WHERE team_id = ? ORDER BY id").bind(G).all()).results;
const quiet = () => vi.spyOn(console, "log").mockImplementation(() => {});
const later = (deps: TestDeps, now: Date) => ({ ...deps, now: () => now });

describe("a team closes by itself once its season is over", () => {
	it("stays open until its videos and photos are due, at the end of 31 December of the year its season ends", async () => {
		const { deps } = await g14At(NEW_YEARS_EVE);
		quiet();
		await runDaily(deps).catch(() => {});
		expect(await team(deps)).toEqual({ status: "active", closed_at: null, delete_after: null });
		expect(await lines(deps)).toEqual([]);
	});

	it("at the 3am job after that, closes as End season's When they're due does, written to the Log as the site's", async () => {
		const { deps } = await g14At(NEW_YEARS_3AM);
		quiet();
		await runDaily(deps).catch(() => {});
		expect(await team(deps)).toEqual({ status: "closed", closed_at: NEW_YEARS_3AM.toISOString(), delete_after: DUE });
		expect(await team(deps, B12_1.id)).toMatchObject({ status: "closed", delete_after: DUE });
		expect(await lines(deps)).toEqual([{ admin_email: "site", device: "", action: "team_closed", detail: "deleted tonight, as its videos and photos were due on Fri 31 Dec 2027" }]);
		const log = await (await makeClient(deps)("/admin/log")).text();
		expect(log).toContain("ended Saints G14.5&#39;s season and closed it, to be deleted tonight, as its videos and photos were due on Fri 31 Dec 2027");
	});

	it("is then deleted by the 5-minute job in the normal way, from that night", async () => {
		const { deps } = await g14At(NEW_YEARS_3AM);
		quiet();
		await closeSeasonsOver(deps);
		const sync = later(deps, new Date(NEW_YEARS_3AM.getTime() + 5 * 60_000));
		for (let i = 0; i < 5 && (await team(deps))?.status !== "deleted"; i++) await runSync(sync);
		expect(await team(deps)).toMatchObject({ status: "deleted" });
		expect(deps.images.deleted).toEqual(["img-g"]);
		expect((await lines(deps)).map((l) => [l.admin_email, l.action])).toEqual([["site", "team_closed"], ["site", "team_deleted"]]);
	});

	it("leaves a team that's streaming at 3am for the next night, without failing this one", async () => {
		const { deps, g } = await g14At(NEW_YEARS_3AM);
		const logged = quiet();
		await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at, last_live_at) VALUES (?, ?, 'in-late', ?, '2027-12-31T15:00:00.000Z', '2027-12-31T15:58:00.000Z')")
			.bind(G, g.gameId, g.members.filmer).run();
		await expect(closeSeasonsOver(deps)).resolves.toBeUndefined();
		expect(await team(deps)).toEqual({ status: "active", closed_at: null, delete_after: null });
		expect(await lines(deps)).toEqual([]);
		expect(logged.mock.calls.map(([l]) => JSON.parse(String(l)))).toContainEqual({ event: "season_close_waits", teamId: G });
		expect(await team(deps, B12_1.id)).toMatchObject({ status: "closed" });
		const nextNight = new Date(NEW_YEARS_3AM.getTime() + 24 * 3_600_000);
		await closeSeasonsOver(later(deps, nextNight));
		expect(await team(deps)).toEqual({ status: "closed", closed_at: nextNight.toISOString(), delete_after: DUE });
	});

	it("leaves a team that's closed already, or whose season isn't over, as it is", async () => {
		const { deps } = await g14At(NEW_YEARS_3AM);
		await deps.db.prepare("UPDATE teams SET status = 'closed', closed_at = '2027-11-01T00:00:00.000Z', delete_after = ? WHERE id = ?").bind(DUE, G).run();
		await addTeam(deps.db, { ...G14_5, id: "g14.5-2027", seasonStart: 2027 });
		quiet();
		await closeSeasonsOver(deps);
		expect(await team(deps)).toEqual({ status: "closed", closed_at: "2027-11-01T00:00:00.000Z", delete_after: DUE });
		expect(await team(deps, "g14.5-2027")).toEqual({ status: "active", closed_at: null, delete_after: null });
		expect(await lines(deps)).toEqual([]);
	});
});
