import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTeam } from "../../src/app/current-team.ts";
import { adminLogStatement, listAdminLog } from "../../src/features/admin/admin-log-repository.ts";
import { loadViewer } from "../../src/auth/viewer.ts";
import { sweepOrphans } from "../../src/jobs/sweep-orphans.ts";
import { runSync } from "../../src/jobs/sync-videos.ts";
import { makeClient, MANAGER } from "../helpers/app.ts";
import { B12_1, createTestDeps, type TestDeps } from "../helpers/fakes.ts";
import { addMember, addTeam, G14_5, seedTeam, teamSnapshot } from "../helpers/two-teams.ts";

afterEach(() => vi.restoreAllMocks());

const G = G14_5.id;
// 3am yesterday in the club's time zone (the tests' clock is 11am on Thu 15 Oct 2026): deleting has started.
const PAST = "2026-10-14T16:00:00.000Z";

/**
 * B12.1 and G14.5, one of everything each (seedTeam), and for G14.5 also: a download of its video by a family (the
 * download log, kept two years), a second game with an unfinished upload, a stray original, a saved live stream,
 * activity, Ask counts, a roster week and duties, who opened the video, and a support request. G14.5 is closed.
 */
async function closedG14(deleteAfter = PAST) {
	const deps = createTestDeps();
	await addTeam(deps.db, G14_5);
	const b = await seedTeam(deps, B12_1, "b");
	const g = await seedTeam(deps, G14_5, "g");
	const run = async (sql: string, ...v: unknown[]) => (await deps.db.prepare(sql).bind(...v).run()).meta.last_row_id;
	await run("INSERT INTO downloads (team_id, video_id, member_id, kind, created_at) VALUES (?, ?, ?, 'hd', '2026-10-12T00:00:00.000Z')", G, g.videoId, g.members.watcher);
	const game2 = await run("INSERT INTO games (team_id, starts_at, competition, round_label, opponent, created_by) VALUES (?, '2026-10-13T18:40', 'VJBL', '10', 'Lakeside', ?)", G, g.members.manager);
	await run(`INSERT INTO videos (team_id, game_id, status, r2_key, r2_upload_id, uploaded_by, delete_after, created_at)
		VALUES (?, ?, 'uploading', 'originals/g14.5-2026/u1/game.mov', 'up-g', ?, '2027-12-31T13:00:00.000Z', '2026-10-13T12:00:00.000Z')`, G, game2, g.members.manager);
	await deps.originals.put("originals/g14.5-2026/u2/stray.mov", "x", "video/quicktime");
	await deps.originals.put("originals/g14.5-2026-2/u3/next-seasons.mov", "x", "video/quicktime");
	await deps.originals.put("originals/b12.1-2026/u4/b12s.mov", "x", "video/quicktime");
	await run("INSERT INTO live_streams (team_id, game_id, live_input_uid, started_by, status, created_at) VALUES (?, ?, 'input-g', ?, 'saved', '2026-10-11T08:00:00.000Z')", G, g.gameId, g.members.filmer);
	await run("INSERT INTO activity (team_id, kind, game_id, member_id, created_at) VALUES (?, 'video_ready', ?, ?, '2026-10-11T09:00:00.000Z')", G, g.gameId, g.members.filmer);
	await run("INSERT INTO ask_counts (team_id, member_id, day, n) VALUES (?, ?, '2026-10-12', 3)", G, g.members.watcher);
	await run("INSERT INTO roster_slots (team_id, week, duty, position, game_id, family_id) VALUES (?, '2026-10-12', 'scoring', 1, ?, ?)", G, g.gameId, g.familyId);
	await run("INSERT INTO roster_duties (team_id, lollies_family_id, updated_at) VALUES (?, ?, '2026-10-12T00:00:00.000Z')", G, g.familyId);
	await run("INSERT INTO roster_weeks (team_id, week, extra_off, updated_at) VALUES (?, '2026-10-12', 1, '2026-10-12T00:00:00.000Z')", G);
	await run("INSERT INTO game_lines (team_id, kind, lines, updated_at) VALUES (?, 'won', 'The Saints beat {opponent} at {venue}. It was {ours} to {them}.', '2026-10-12T00:00:00.000Z')", G);
	await run("INSERT INTO video_views (team_id, video_id, member_id, opened_at) VALUES (?, ?, ?, '2026-10-12T00:00:00.000Z')", G, g.videoId, g.members.coach);
	await run("INSERT INTO support_requests (team_id, member_id, topic, message, contact, created_at) VALUES (?, ?, 'videos', 'Help', 'x', '2026-10-12T00:00:00.000Z')", G, g.members.manager);
	await deps.db.prepare("UPDATE teams SET status = 'closed', closed_at = '2026-10-12T00:00:00.000Z', delete_after = ? WHERE id = ?").bind(deleteAfter, G).run();
	return { deps, b, g };
}

const count = async (deps: TestDeps, table: string, teamId = G) =>
	deps.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE team_id = ?`).bind(teamId).first<number>("n");
const status = async (deps: TestDeps) => deps.db.prepare("SELECT status, deleted_at FROM teams WHERE id = ?").bind(G).first();
const quiet = () => vi.spyOn(console, "log").mockImplementation(() => {});

/** The 5-minute job, run after run, until G14.5 is deleted (or `max` runs). */
async function untilDeleted(deps: TestDeps, max = 10) {
	for (let i = 0; i < max; i++) {
		await runSync(deps);
		if ((await status(deps))?.status === "deleted") return i + 1;
	}
	throw new Error(`G14.5 wasn't deleted in ${max} runs`);
}

/** Every table with a team's rows, once the team is deleted: gone, or kept for the download log (and the admin log, and Costs' figures). */
const GONE = ["clip_players", "favourites", "video_views", "coach_notes", "game_scores", "removal_requests", "clip_removal_requests",
	"photo_removal_requests", "recording_segments", "clips", "live_streams", "activity", "ask_counts", "roster_slots", "roster_weeks", "roster_duties", "roster_families", "players",
	"playhq_fixtures", "photos", "support_messages", "support_requests", "game_lines", "problems"];
const KEPT = ["admin_log", "cost_views", "downloads", "games", "media_downloads", "members", "videos"];

describe("deleting a closed team once its date has passed", () => {
	it("has a say over every table with a team's rows: a new one goes in GONE or KEPT (roster_weeks was missed)", async () => {
		const deps = createTestDeps();
		const { results } = await deps.db.prepare("SELECT m.name FROM sqlite_master m WHERE m.type = 'table' AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) c WHERE c.name = 'team_id') ORDER BY m.name").all<{ name: string }>();
		expect(results.map((r) => r.name)).toEqual([...GONE, ...KEPT].sort());
	});
	it("deletes its photos' images, Stream copies and originals, then its rows, keeping only what the download log names", async () => {
		const { deps, g } = await closedG14();
		quiet();
		await untilDeleted(deps);
		expect(deps.images.deleted).toEqual([`img-g`]);
		expect(deps.stream.deleted.sort()).toEqual(["clip-g", "stream-g"]);
		expect(deps.originals.aborted).toEqual(["originals/g14.5-2026/u1/game.mov"]);
		expect(deps.originals.removed).toEqual(["originals/g14.5-2026/u2/stray.mov"]);
		for (const table of GONE) expect(await count(deps, table), table).toBe(0);
		expect(await count(deps, "downloads")).toBe(1);
		const kept = async (sql: string) => (await deps.db.prepare(sql).bind(G).all()).results;
		expect(await kept("SELECT id, stream_uid, r2_key, r2_upload_id, deleted_at IS NOT NULL AS gone FROM videos WHERE team_id = ?"))
			.toEqual([{ id: g.videoId, stream_uid: null, r2_key: null, r2_upload_id: null, gone: 1 }]);
		expect(await kept("SELECT id, deleted_at IS NOT NULL AS gone FROM games WHERE team_id = ?")).toEqual([{ id: g.gameId, gone: 1 }]);
		// The family who downloaded it, who uploaded it, and who added the game, each marked removed.
		expect(await kept("SELECT id, removed_at IS NOT NULL AS gone FROM members WHERE team_id = ? ORDER BY id"))
			.toEqual([g.members.manager, g.members.filmer, g.members.watcher].sort((a, b) => a - b).map((id) => ({ id, gone: 1 })));
		expect(await status(deps)).toEqual({ status: "deleted", deleted_at: "2026-10-15T00:00:00.000Z" });
		expect(await deps.db.prepare("SELECT admin_email, action, detail FROM admin_log WHERE team_id = ?").bind(G).all().then((r) => r.results))
			.toEqual([{ admin_email: "site", action: "team_deleted", detail: "1 photo, 1 clip, 1 video, 1 game and 1 person's details deleted; the download log keeps 1 video, 1 game and 3 people's details" }]);
	});

	it("never touches another team's rows, images, Stream copies or originals", async () => {
		const { deps, b } = await closedG14();
		quiet();
		// B12.1's own PlayHQ check, due now, would change its fixture's checked_at: not the deletion's doing.
		await deps.db.prepare("UPDATE playhq_fixtures SET checked_at = ? WHERE team_id = ?").bind(deps.now().toISOString(), B12_1.id).run();
		const before = await teamSnapshot(deps.db, B12_1.id);
		await untilDeleted(deps);
		expect(await teamSnapshot(deps.db, B12_1.id)).toBe(before);
		expect(deps.images.stored.has("img-b")).toBe(true);
		expect([...deps.stream.deleted, ...deps.originals.removed, ...deps.originals.aborted].join(" ")).not.toMatch(/-b\b|b12\.1-2026|g14\.5-2026-2/);
		expect((await makeClient(deps, b.emails.watcher)("/games")).status).toBe(200);
	});

	it("leaves a closed team before its date alone, and an open one", async () => {
		const { deps } = await closedG14("2027-12-31T13:00:00.000Z");
		quiet();
		const before = await teamSnapshot(deps.db, G);
		await runSync(deps);
		await runSync(deps);
		expect(await status(deps)).toEqual({ status: "closed", deleted_at: null });
		expect(deps.images.deleted).toEqual([]);
		expect(await teamSnapshot(deps.db, G)).not.toBe("");
		expect(JSON.parse(await teamSnapshot(deps.db, G)).photos).toEqual(JSON.parse(before).photos);
	});

	it("takes a slice a run, at most 20 outside calls, after every team's own steps", async () => {
		const { deps, g } = await closedG14();
		for (let i = 0; i < 30; i++) {
			deps.images.stored.set(`img-g${i}`, { bytes: new Uint8Array([1]), teamId: G, uploadedBy: g.members.filmer, uploaded: "2026-10-12T00:00:00.000Z" });
			await deps.db.prepare(`INSERT INTO photos (team_id, image_id, taken_at, width, height, bytes, uploaded_by, delete_after, created_at)
				VALUES (?, ?, '2026-10-11T12:00:00', 4, 3, 1, ?, '2027-12-31T13:00:00.000Z', '2026-10-12T00:00:00.000Z')`).bind(G, `img-g${i}`, g.members.filmer).run();
		}
		const logged = quiet();
		await runSync(deps);
		expect(deps.images.deleted).toHaveLength(20);
		expect(await status(deps)).toMatchObject({ status: "closed" });
		const events = logged.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string; teamId?: string });
		expect(events.findIndex((e) => e.event === "team_purge")).toBeGreaterThan(events.findLastIndex((e) => e.event === "sync_team"));
		expect(events.find((e) => e.event === "sync_team" && e.teamId === G)).toBeUndefined();
		expect(await untilDeleted(deps)).toBeLessThanOrEqual(2);
		expect(deps.images.deleted).toHaveLength(31);
	});

	it("keeps what's done when a call fails part way, and carries on from there the next run", async () => {
		const { deps } = await closedG14();
		quiet();
		deps.stream.deleteFails.add("stream-g");
		await expect(runSync(deps)).rejects.toBeInstanceOf(AggregateError);
		expect(deps.images.deleted).toEqual(["img-g"]);
		expect(await count(deps, "photos")).toBe(1);
		expect(await status(deps)).toMatchObject({ status: "closed" });
		deps.stream.deleteFails.clear();
		await untilDeleted(deps);
		expect(deps.images.deleted).toEqual(["img-g"]);
	});

	it("counts something already gone from Images or Stream as deleted", async () => {
		const { deps } = await closedG14();
		quiet();
		deps.images.stored.delete("img-g");
		deps.stream.videos.delete("stream-g");
		await untilDeleted(deps);
		expect(await status(deps)).toMatchObject({ status: "deleted" });
	});

	it("doesn't make new Stream copies or clips for a team it's deleting", async () => {
		const { deps, g } = await closedG14();
		quiet();
		await deps.db.prepare("UPDATE videos SET status = 'processing', stream_uid = NULL, r2_key = 'originals/g14.5-2026/u9/g.mov' WHERE id = ?").bind(g.videoId).run();
		await untilDeleted(deps);
		expect(deps.stream.uploads).toEqual([]);
	});

	it("is gone from its members' teams at once, so nobody lands on a team half deleted", async () => {
		const { deps, g } = await closedG14();
		await addMember(deps.db, B12_1.id, g.emails.watcher, "watcher");
		const viewer = await loadViewer(deps.db, g.emails.watcher, deps.now());
		expect(viewer.memberships.map((m) => m.team.id)).toEqual([B12_1.id]);
		expect((await currentTeam(deps.db, viewer, { team: G, adminTeam: null })).team).toMatchObject({ id: B12_1.id });
		const admin = await loadViewer(deps.db, MANAGER, deps.now());
		expect(admin.isAdmin).toBe(true);
	});

	it("drops the download log's videos, games and people once the log no longer names them (after two years), then the team's row", async () => {
		const { deps } = await closedG14();
		quiet();
		await untilDeleted(deps);
		await runSync(deps);
		expect(await status(deps)).toMatchObject({ status: "deleted" }); // its download log keeps it
		await deps.db.prepare("UPDATE downloads SET created_at = '2024-10-01T00:00:00.000Z' WHERE team_id = ?").bind(G).run();
		await runSync(deps);
		for (const table of ["downloads", "videos", "games", "members"]) expect(await count(deps, table), table).toBe(0);
		expect(await status(deps)).toBeNull();
	});
	it("keeps the people a photo or clip download names, and the team's row, until that log goes too (after two years)", async () => {
		const { deps, g } = await closedG14();
		quiet();
		await deps.db.prepare("DELETE FROM downloads WHERE team_id = ?").bind(G).run();
		await deps.db.prepare("INSERT INTO media_downloads (team_id, member_id, kind, item_id, name, created_at) VALUES (?, ?, 'photo', 1, 'p.jpg', '2026-10-12T00:00:00.000Z')").bind(G, g.members.coach).run();
		await untilDeleted(deps);
		await runSync(deps);
		expect(await status(deps)).toMatchObject({ status: "deleted" });
		expect(await deps.db.prepare("SELECT id FROM members WHERE team_id = ?").bind(G).all().then((r) => r.results)).toEqual([{ id: g.members.coach }]);
		await deps.db.prepare("UPDATE media_downloads SET created_at = '2024-10-01T00:00:00.000Z' WHERE team_id = ?").bind(G).run();
		await runSync(deps);
		for (const table of ["media_downloads", "members"]) expect(await count(deps, table), table).toBe(0);
		expect(await status(deps)).toBeNull();
	});
	it("deletes the row of a team nobody downloaded from straight after, so its id is free; the Log keeps its name", async () => {
		const { deps } = await closedG14();
		quiet();
		await deps.db.prepare("DELETE FROM downloads WHERE team_id = ?").bind(G).run();
		await adminLogStatement(deps.db, { device: "", adminEmail: MANAGER, teamId: G, action: "team_onboarded", detail: "g14.5", at: "2026-10-01T00:00:00.000Z" }).run();
		await deps.db.prepare("INSERT INTO cost_views (month, team_id, minutes, saved_at) VALUES ('2026-10', ?, 12, '2026-10-12T00:00:00.000Z')").bind(G).run();
		await untilDeleted(deps);
		await runSync(deps);
		expect(await status(deps)).toBeNull();
		for (const table of ["admin_log", "cost_views"]) expect(await count(deps, table), table).toBe(0);
		const lines = (await listAdminLog(deps.db, 50)).filter((l) => l.action === "team_onboarded" || l.action === "team_deleted");
		expect(lines.map((l) => [l.action, l.team])).toEqual([["team_deleted", { code: "g14.5", seasonStart: 2026 }], ["team_onboarded", { code: "g14.5", seasonStart: 2026 }]]);
		// B12.1 untouched.
		expect(await deps.db.prepare("SELECT status FROM teams WHERE id = ?").bind(B12_1.id).first("status")).toBe("active");
	});

	it("leaves its live inputs to the nightly sweep, which doesn't refuse afterwards", async () => {
		const { deps } = await closedG14();
		quiet();
		deps.live.inputs.set("input-g", { name: "g", enabled: true });
		await untilDeleted(deps);
		expect(deps.live.deletedInputs).toEqual([]);
		await expect(sweepOrphans(deps)).resolves.toMatchObject({ orphanInputs: 1 });
		expect(deps.live.deletedInputs).toEqual(["input-g"]);
	});
});
