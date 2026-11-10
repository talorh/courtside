// How far the site scales (docs/reviews/2026-10-28-scaling.md): each job runs every team in one invocation, and D1
// allows 1,000 queries an invocation on Workers Paid, so a run's trips to the database decide how many teams fit. Each
// team here has one of everything (seedTeam); on a game night some are also streaming and processing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDaily } from "../../src/jobs/daily.ts";
import { QUIET_TEAMS_A_RUN, runSync } from "../../src/jobs/sync-videos.ts";
import { makeClient } from "../helpers/app.ts";
import { countingDb } from "../helpers/counting-db.ts";
import { createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { addTeam, seedTeam } from "../helpers/two-teams.ts";

afterEach(() => vi.restoreAllMocks());

// D1's queries per Worker invocation on Workers Paid (developers.cloudflare.com/d1/platform/limits).
const D1_QUERIES_A_RUN = 1000;

/** B12.1 and `more` teams, each with one of everything; `live` of them streaming a game and processing another's video. */
async function site(more: number, o: { now?: Date; live?: number } = {}) {
	const deps = createTestDeps(o.now);
	await seedTeam(deps, deps.team, "b12");
	for (let i = 1; i <= more; i++) {
		const team = await addTeam(deps.db, { id: `b10.${i}-2026`, code: `b10.${i}`, name: `Saints U10 Boys 10.${i}`, seasonStart: 2026, askName: null, status: "active", closedAt: null, deleteAfter: null });
		const s = await seedTeam(deps, team, `t${i}`);
		if (i <= (o.live ?? 0)) await gameNight(deps, team.id, s.members.filmer, i);
	}
	return deps;
}

/** A team's game night: a live stream whose phone is sending its recording, and another game's upload being processed. */
async function gameNight(deps: TestDeps, teamId: string, filmer: number, i: number) {
	const run = (sql: string, ...v: unknown[]) => deps.db.prepare(sql).bind(...v).run();
	const game = async (at: string) => (await run("INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, ?, 'VJBL', '10', 'Lakeside')", teamId, at)).meta.last_row_id;
	const tonight = await game("2026-10-15T10:40"), last = await game("2026-10-08T18:40");
	const recording = (await run(`INSERT INTO videos (team_id, game_id, status, r2_key, r2_upload_id, uploaded_by, delete_after, created_at)
		VALUES (?, ?, 'uploading', ?, 'up-1', ?, '2027-12-31T13:00:00.000Z', '2026-10-14T23:50:00.000Z')`, teamId, tonight, `originals/${teamId}/live-${i}.mp4`, filmer)).meta.last_row_id;
	deps.live.inputs.set(`in-${i}`, { name: "x", enabled: true, teamId });
	deps.live.connected.add(`in-${i}`);
	await run(`INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, status, last_live_at, created_at, recording_video_id)
		VALUES (?, ?, ?, ?, 'open', '2026-10-14T23:55:00.000Z', '2026-10-14T23:50:00.000Z', ?)`, teamId, tonight, `in-${i}`, filmer, recording);
	await run(`INSERT INTO videos (team_id, game_id, status, stream_uid, uploaded_by, delete_after, created_at)
		VALUES (?, ?, 'processing', ?, ?, '2027-12-31T13:00:00.000Z', '2026-10-14T23:00:00.000Z')`, teamId, last, `proc-${i}`, filmer);
	deps.stream.videos.set(`proc-${i}`, { readyToStream: false, state: "inprogress", errorReason: "", durationSeconds: 0 });
}

/** One run's trips to the database. */
async function trips(deps: TestDeps, job: (d: TestDeps) => Promise<unknown>) {
	const { db, counter } = countingDb(deps.db);
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	await job({ ...deps, db } as TestDeps).catch(() => {});
	return counter.trips;
}

describe("scaling: each job runs in one invocation, inside D1's 1,000 queries, however many teams", () => {
	it("runs every team every five minutes while there are a turn's worth or fewer, at about 18 trips a team", async () => {
		const one = await trips(await site(0), runSync), twelve = await trips(await site(QUIET_TEAMS_A_RUN - 1), runSync);
		expect((twelve - one) / (QUIET_TEAMS_A_RUN - 1)).toBeLessThanOrEqual(18);
	}, 120_000);

	it("past that takes turns: 120 quiet teams cost a run what 12 do, and 120 with 20 on a game night still fit", async () => {
		const twelve = await trips(await site(QUIET_TEAMS_A_RUN - 1), runSync), quiet = await trips(await site(119), runSync), busy = await trips(await site(119, { live: 20 }), runSync);
		expect(quiet).toBeLessThanOrEqual(twelve + 20);
		expect(busy).toBeLessThan(D1_QUERIES_A_RUN);
	}, 300_000);

	it("reads every team's records for the 3am run in one trip: 51 teams cost what one does", async () => {
		const at = new Date("2026-10-24T16:00:00Z");
		const one = await trips(await site(0, { now: at }), runDaily), many = await trips(await site(50, { now: at }), runDaily);
		expect(many - one).toBeLessThanOrEqual(10);
		expect(many).toBeLessThan(D1_QUERIES_A_RUN);
	}, 120_000);

	it("opens the admin pages and a team's Home with as many trips for 51 teams as for 2 (more rows, not more queries)", async () => {
		const pages = ["/admin", "/admin/teams", "/admin/log", "/admin/platform", "/admin/support", "/"];
		const count = async (deps: TestDeps) => {
			const { db, counter } = countingDb(deps.db);
			const client = makeClient({ ...deps, db } as TestDeps);
			const out: number[] = [];
			for (const path of pages) {
				const before = counter.trips;
				expect((await client(path)).status, path).toBe(200);
				out.push(counter.trips - before);
			}
			return out;
		};
		expect(await count(await site(50))).toEqual(await count(await site(1)));
	}, 120_000);
});
