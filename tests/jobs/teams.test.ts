import { afterEach, describe, expect, it, vi } from "vitest";
import { withTeam } from "../../src/app/deps.ts";
import { getActiveMember } from "../../src/features/members/members-repository.ts";
import { openLive } from "../../src/features/live/live-service.ts";
import { getGame } from "../../src/features/games/games-repository.ts";
import { getVideo } from "../../src/features/videos/videos-repository.ts";
import { createClip } from "../../src/features/clips/clips-service.ts";
import { runSync } from "../../src/jobs/sync-videos.ts";
import { sweepOrphans } from "../../src/jobs/sweep-orphans.ts";
import { B12_1, createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { addTeam, G14_5, type Seeded, seedTeam } from "../helpers/two-teams.ts";

afterEach(() => vi.restoreAllMocks());

const B14_2 = { ...G14_5, id: "b14.2-2026", code: "b14.2", name: "Saints U14 Boys 14.2" };

/** Three teams, one of everything each; each has a video Stream has finished and a PlayHQ fixture due a check. */
async function threeTeams(closed = B14_2.id) {
	const deps = createTestDeps();
	await addTeam(deps.db, G14_5);
	await addTeam(deps.db, B14_2);
	const seeded: Seeded[] = [];
	for (const [team, tag] of [[B12_1, "b"], [G14_5, "g"], [B14_2, "x"]] as const) {
		const s = await seedTeam(deps, team, tag);
		await deps.db.prepare("UPDATE videos SET status = 'processing' WHERE id = ?").bind(s.videoId).run();
		seeded.push(s);
	}
	await deps.db.prepare("UPDATE teams SET status = 'closed' WHERE id = ?").bind(closed).run();
	return { deps, seeded };
}

const status = async (deps: TestDeps, s: Seeded) => (await getVideo(deps.db, s.team.id, s.videoId))?.status;

describe("the 5-minute job, for every team", () => {
	it("runs each team's own steps: everything for current teams; a closed team's videos still finish, but no PlayHQ", async () => {
		const { deps, seeded } = await threeTeams();
		const summary = await runSync(deps);
		for (const s of seeded) expect(await status(deps, s), s.team.id).toBe("ready");
		expect(summary.ready).toBe(3);
		expect(deps.playhq.reads.sort()).toEqual(["example-association/00000062", "example-association/00000067"]);
	});

	it("logs each team's own summary with its team, and the whole run's", async () => {
		const { deps } = await threeTeams();
		const logged = vi.spyOn(console, "log").mockImplementation(() => {});
		await runSync(deps);
		const lines = logged.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string; teamId?: string; ready?: number; teams?: number });
		expect(Object.fromEntries(lines.filter((l) => l.event === "sync_team").map((l) => [l.teamId, l.ready]))).toEqual({ [B12_1.id]: 1, [B14_2.id]: 1, [G14_5.id]: 1 });
		expect(lines.find((l) => l.event === "sync_videos")).toMatchObject({ teams: 3, ready: 3 });
	});

	it("keeps going past a team whose step fails, then fails the run loudly", async () => {
		const { deps, seeded } = await threeTeams();
		deps.stream.broken.add(`stream-g`);
		vi.spyOn(console, "log").mockImplementation(() => {});
		await expect(runSync(deps)).rejects.toBeInstanceOf(AggregateError);
		expect([await status(deps, seeded[0]!), await status(deps, seeded[2]!)]).toEqual(["ready", "ready"]);
	});

	it("runs a team's other steps when one of them fails outright (a database hiccup), and still fails the run", async () => {
		const { deps, seeded } = await threeTeams();
		const db = { prepare: (sql: string) => { if (sql.includes("FROM live_streams")) throw new Error("D1 hiccup"); return deps.db.prepare(sql); }, batch: deps.db.batch.bind(deps.db) } as unknown as D1Database;
		vi.spyOn(console, "log").mockImplementation(() => {});
		await expect(runSync({ ...deps, db })).rejects.toBeInstanceOf(AggregateError);
		for (const s of seeded) expect(await status(deps, s), s.team.id).toBe("ready");
	});

	it("starts with a different team from one run to the next, so one busy team can't use up every run's outside calls", async () => {
		const firsts = new Set<string>();
		for (const minute of [0, 5, 10]) {
			const { deps } = await threeTeams();
			const at = new Date(Date.UTC(2026, 9, 15, 0, minute));
			const logged = vi.spyOn(console, "log").mockImplementation(() => {});
			await runSync({ ...deps, now: () => at });
			firsts.add((JSON.parse(String(logged.mock.calls[0]?.[0])) as { teamId: string }).teamId);
			logged.mockRestore();
		}
		expect(firsts.size).toBe(3);
	});

	it("takes one deleted team a run, in turn, so deleted teams piling up season after season never crowd out live teams", async () => {
		const gone: string[][] = [];
		for (const minute of [0, 5, 10]) {
			const { deps } = await threeTeams();
			for (const id of ["b14.1-old", "b14.3-old", "b14.7-old"]) {
				await addTeam(deps.db, { ...G14_5, id, code: `b14.${id[4]}` });
				await deps.db.prepare("UPDATE teams SET status = 'deleted' WHERE id = ?").bind(id).run();
			}
			const at = new Date(Date.UTC(2026, 9, 15, 0, minute));
			const logged = vi.spyOn(console, "log").mockImplementation(() => {});
			await runSync({ ...deps, now: () => at });
			const lines = logged.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string; teamId?: string; teams?: number; deletedTeams?: number });
			const ran = lines.filter((l) => l.event === "sync_team").map((l) => l.teamId!);
			expect(ran.filter((id) => !id.endsWith("-old")).sort()).toEqual([B12_1.id, B14_2.id, G14_5.id].sort());
			gone.push(ran.filter((id) => id.endsWith("-old")));
			expect(lines.find((l) => l.event === "sync_videos")).toMatchObject({ teams: 3, deletedTeams: 3 });
			logged.mockRestore();
		}
		expect(gone.map((ids) => ids.length)).toEqual([1, 1, 1]);
		expect(new Set(gone.flat()).size).toBe(3);
	});
});

describe("the nightly clean-up across teams", () => {
	it("never deletes another team's videos, clips, live inputs or photos, and still deletes what no team knows", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		for (const [team, tag] of [[B12_1, "b"], [G14_5, "g"]] as const) {
			const s = await seedTeam(deps, team, tag);
			deps.live.inputs.set(`input-${tag}`, { name: tag, enabled: true });
			await deps.db.prepare("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, created_at) VALUES (?, ?, ?, ?, '2026-10-01T00:00:00.000Z')")
				.bind(team.id, s.gameId, `input-${tag}`, s.members.filmer).run();
		}
		deps.stream.videos.set("nobodys", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 60 });
		deps.live.inputs.set("nobodys-input", { name: "x", enabled: true });
		deps.images.stored.set("nobodys-image", { bytes: new Uint8Array([1]), teamId: "", uploadedBy: 1, uploaded: "2026-10-01T00:00:00.000Z" });
		vi.spyOn(console, "log").mockImplementation(() => {});
		expect(await sweepOrphans(deps)).toMatchObject({ orphanVideos: 1, orphanInputs: 1, orphanImages: 1, orphansDeleted: 3 });
		expect([deps.stream.deleted, deps.live.deletedInputs, deps.images.deleted]).toEqual([["nobodys"], ["nobodys-input"], ["nobodys-image"]]);
	});

	it("deletes nothing when it can't read every team's records", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		deps.stream.videos.set("nobodys", { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 60 });
		const db = { ...deps.db, prepare: (sql: string) => { if (sql.includes("FROM photos")) throw new Error("D1 7403 not authorized"); return deps.db.prepare(sql); }, batch: deps.db.batch.bind(deps.db) } as D1Database;
		await expect(sweepOrphans({ ...deps, db })).rejects.toThrow(/every team/);
		expect(deps.stream.deleted).toEqual([]);
	});
});

describe("what a team's Stream things say about it", () => {
	it("names a live input after its team, and both live inputs and clips carry the team's id", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		const g = await seedTeam(deps, G14_5, "g");
		const teamDeps = withTeam(deps, G14_5);
		const next = (await deps.db.prepare("INSERT INTO games (team_id, starts_at, competition, round_label, opponent) VALUES (?, '2026-10-15T18:40', 'VJBL', '10', 'Lakeside')").bind(G14_5.id).run()).meta.last_row_id;
		const game = (await getGame(deps.db, G14_5.id, next))!;
		const input = await openLive(teamDeps, (await getActiveMember(deps.db, G14_5.id, g.members.filmer))!, game);
		expect(deps.live.inputs.get(input.uid)).toMatchObject({ name: "Saints G14.5 · 2026-10-15 · Round 10 · vs Lakeside", teamId: G14_5.id });
		const video = (await getVideo(deps.db, G14_5.id, g.videoId))!;
		await createClip(teamDeps, (await getActiveMember(deps.db, G14_5.id, g.members.filmer))!, video, { label: "Three", start: "0:10", end: "0:20", players: [] });
		expect(deps.clipper.requests.at(-1)).toMatchObject({ teamId: G14_5.id });
	});
});
