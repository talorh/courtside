import { describe, expect, it } from "vitest";
import { busyTeamIds } from "../../src/jobs/all-teams-repository.ts";
import { QUIET_TEAMS_A_RUN, teamsThisRun } from "../../src/jobs/sync-videos.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { addTeam, G14_5 } from "../helpers/two-teams.ts";

// The 5-minute job takes turns: every busy team every run, and a turn
// of the quiet ones, so a run's database trips stay inside D1's 1,000 however many teams there are.
const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}` }));

describe("which teams a run works on", () => {
	it("is every team, every run, while there are no more than a turn's worth", () => {
		const teams = ids(QUIET_TEAMS_A_RUN);
		for (const run of [0, 1, 7]) {
			const picked = teamsThisRun(teams, new Set(), run);
			expect([...picked.busy, ...picked.turn].map((t) => t.id).sort()).toEqual(teams.map((t) => t.id).sort());
		}
	});
	it("is every busy team plus the next turn of quiet ones, each quiet team reached once in every few runs", () => {
		const teams = ids(50);
		const busy = new Set(["t3", "t20"]);
		const runs = Math.ceil(48 / QUIET_TEAMS_A_RUN);
		const seen = new Map<string, number>();
		for (let run = 100; run < 100 + runs; run++) {
			const picked = teamsThisRun(teams, busy, run);
			expect(picked.busy.map((t) => t.id).sort()).toEqual(["t20", "t3"]);
			expect(picked.turn.length).toBe(QUIET_TEAMS_A_RUN);
			expect(picked.turn.some((t) => busy.has(t.id))).toBe(false);
			for (const t of picked.turn) seen.set(t.id, (seen.get(t.id) ?? 0) + 1);
		}
		expect(seen.size).toBe(48);
		expect([...seen.values()].every((n) => n === 1)).toBe(true);
	});
});

describe("busy teams", () => {
	it("are those with a game today, a live stream open, a video or clip being processed, or an HD copy awaited", async () => {
		const deps = createTestDeps(new Date("2026-10-31T06:00:00.000Z")); // 5pm local, 31 Oct
		const run = (sql: string, ...v: unknown[]) => deps.db.prepare(sql).bind(...v).run();
		const team = async (n: number) => (await addTeam(deps.db, { ...G14_5, id: `team-${n}`, code: `g14.${n}`, name: `Team ${n}` })).id;
		const [today, live, processing, clip, hd, quiet] = await Promise.all([1, 2, 3, 4, 5, 6].map(team));
		// Every team played yesterday; one plays today.
		const game = async (teamId: string, day = "2026-10-30") => (await run("INSERT INTO games (team_id, starts_at, competition, opponent) VALUES (?, ?, 'VJBL', 'Lakeside')", teamId, `${day}T18:40`)).meta.last_row_id;
		await game(today, "2026-10-31");
		await game(quiet);
		await run("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, status, created_at) VALUES (?, ?, 'in-1', NULL, 'open', '2026-10-31T05:00:00.000Z')", live, await game(live));
		await run("INSERT INTO videos (team_id, game_id, status, stream_uid, delete_after, created_at) VALUES (?, ?, 'processing', 'p1', '2027-12-31T13:00:00.000Z', '2026-10-31T05:00:00.000Z')", processing, await game(processing));
		await run("INSERT INTO videos (team_id, game_id, status, stream_uid, delete_after, created_at) VALUES (?, ?, 'ready', 'r1', '2027-12-31T13:00:00.000Z', '2026-10-31T05:00:00.000Z')", hd, await game(hd));
		const ready = (await run("INSERT INTO videos (team_id, game_id, status, stream_uid, hd_ready_at, delete_after, created_at) VALUES (?, ?, 'ready', 'r2', '2026-10-31T05:30:00.000Z', '2027-12-31T13:00:00.000Z', '2026-10-31T05:00:00.000Z')", clip, await game(clip))).meta.last_row_id;
		await run("INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, stream_uid, status) VALUES (?, ?, 'x', 1, 5, 'c1', 'processing')", clip, ready);
		const busy = await busyTeamIds(deps.db, "2026-10-31");
		expect([...busy].sort()).toEqual([today, live, processing, clip, hd].sort());
		expect(busy.has(quiet)).toBe(false);
		expect(busy.has(deps.team.id)).toBe(false);
	});
});
