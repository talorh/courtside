import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { insertPartClipWrite } from "../../../src/features/clips/clips-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";

// Saturday 24 Oct 2026, 7pm at the club (Australia/Melbourne).
const NOW = new Date("2026-10-24T08:00:00Z");
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

async function setup() {
	const deps = createTestDeps(NOW);
	for (const [email, role] of [["p@x.com", "watcher"], ["q@x.com", "watcher"]]) {
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)").bind(deps.team.id, email, role, role).run();
	}
	const idOf = async (email: string) => (await deps.db.prepare("SELECT id FROM members WHERE team_id = ? AND email = ?").bind(deps.team.id, email).first<number>("id"))!;
	const gameId = await seedGame(deps);
	const videoId = await seedVideo(deps, { gameId, streamUid: "u1" });
	return { deps, gameId, videoId, p: await idOf("p@x.com"), q: await idOf("q@x.com"), watcher: makeClient(deps, "p@x.com"), other: makeClient(deps, "q@x.com") };
}

/** Clips already made: `seconds` long each, by `by`, at `at`. */
async function made(deps: TestDeps, videoId: number, by: number, at: string, seconds: number, n = 1, deleted = false) {
	for (let i = 0; i < n; i++) {
		await deps.db.prepare(`INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, stream_uid, created_by, created_at, deleted_at)
			VALUES (?, ?, 'Earlier', 0, ?, 'ready', ?, ?, ?, ?)`).bind(deps.team.id, videoId, seconds, crypto.randomUUID(), by, at, deleted ? at : null).run();
	}
}

const rows = async (deps: TestDeps) => (await deps.db.prepare("SELECT COUNT(*) AS n FROM clips WHERE team_id = ?").bind(deps.team.id).first<number>("n"))!;
const clip = (start: string, end: string) => form({ start, end, label: "Steal" });

describe("0014 an app stream's parts marked", () => {
	it("marks the parts already saved, and only those", () => {
		const db = new DatabaseSync(":memory:");
		const files = readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort();
		const apply = (f: string) => db.exec(`BEGIN; ${readFileSync(`migrations/${f}`, "utf8")}; COMMIT;`);
		for (const f of files.filter((f) => f < "0014")) apply(f);
		db.exec("INSERT INTO teams (id, name, code, season_start) VALUES ('b12.1-2026', 'U12 Boys 12.1', 'b12.1', 2026)");
		db.exec(`INSERT INTO games (id, team_id, starts_at, competition, round_label, opponent, venue) VALUES (1, 'b12.1-2026', '2026-10-11T11:40', 'VJBL', '9', 'Westside', 'Westside Stadium')`);
		db.exec("INSERT INTO videos (id, team_id, game_id, status, delete_after) VALUES (1, 'b12.1-2026', 1, 'ready', 'x')");
		const clip = (label: string, start: number) => db.prepare(`INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status)
			VALUES ('b12.1-2026', 1, ?, ?, 600, 'ready')`).run(label, start);
		clip("Live stream, more from 7:10pm", 0);
		clip("Fast break", 0);
		clip("Live stream, more from the corner", 30);
		apply("0014_clip_parts.sql");
		expect(db.prepare("SELECT label, part FROM clips ORDER BY id").all()).toEqual([
			{ label: "Live stream, more from 7:10pm", part: 1 }, { label: "Fast break", part: 0 }, { label: "Live stream, more from the corner", part: 0 },
		]);
	});
});

describe("the 50 clips a game video can have", () => {
	it("refuses the 51st without asking Stream for it", async () => {
		const { deps, videoId, q, watcher } = await setup();
		await made(deps, videoId, q, ago(48 * HOUR), 10, 50);
		const res = await watcher(`/videos/${videoId}/clips`, clip("0:10", "0:20"));
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("This game already has 50 clips.");
		expect(deps.clipper.requests).toEqual([]);
		expect(await rows(deps)).toBe(50);
	});
	it("holds when posts overlap: each one's place is taken before Stream is asked", async () => {
		const { deps, videoId, watcher } = await setup();
		// Every post waits inside Stream's clip call until the last has been sent, as overlapping requests would. The
		// node:sqlite shim can't overlap two requests' batches, so each runs alone up to Stream's call (or its refusal),
		// and once all are in, each is let go and finished in turn.
		const real = deps.clipper.clip.bind(deps.clipper);
		const gates: Array<() => void> = [];
		deps.clipper.clip = async (r) => { await new Promise<void>((go) => gates.push(go)); return real(r); };
		const pending: Array<Promise<Response>> = [];
		const statuses: number[] = [];
		for (let i = 0; i < 55; i++) {
			const sent = watcher(`/videos/${videoId}/clips`, clip(String(i * 10), String(i * 10 + 5)));
			let done = false;
			void sent.then(() => { done = true; });
			while (gates.length === pending.length && !done) await new Promise((ok) => setTimeout(ok, 1));
			if (done) statuses.push((await sent).status);
			else pending.push(sent);
		}
		for (const [i, go] of gates.entries()) { go(); statuses.push((await pending[i]!).status); }
		expect(statuses.filter((s) => s === 303)).toHaveLength(50);
		expect(statuses.filter((s) => s === 409)).toHaveLength(5);
		expect(deps.clipper.requests).toHaveLength(50);
		expect(await rows(deps)).toBe(50);
	});
});

describe("an hour of clips a day for each person", () => {
	it("refuses a clip past the hour, says when it fits, and leaves others free to make theirs", async () => {
		const { deps, videoId, p, watcher, other } = await setup();
		// 50 minutes at 9pm last night, 5 more at 6pm today.
		await made(deps, videoId, p, ago(22 * HOUR), 300, 10);
		await made(deps, videoId, p, ago(HOUR), 300);
		expect((await watcher(`/videos/${videoId}/clips`, clip("1:00", "6:00"))).status).toBe(303);
		const res = await watcher(`/videos/${videoId}/clips`, clip("10:00", "10:10"));
		expect(res.status).toBe(429);
		const text = await res.text();
		expect(text).toContain("Clips are up to an hour a day for each person, and you&#39;ve made 1 hour of clips in the last 24 hours.");
		expect(text).toContain("This one can be made from 9:00pm.");
		expect(deps.clipper.requests).toHaveLength(1);
		expect((await other(`/videos/${videoId}/clips`, clip("10:00", "10:10"))).status).toBe(303);
	});
	it("counts deleted clips (they were made), and offers a shorter one when there's room", async () => {
		const { deps, videoId, p, watcher } = await setup();
		await made(deps, videoId, p, ago(2 * HOUR), 300, 11, true);
		await made(deps, videoId, p, ago(2 * HOUR), 120, 1, true);
		const res = await watcher(`/videos/${videoId}/clips`, clip("1:00", "6:00"));
		expect(res.status).toBe(429);
		expect(await res.text()).toContain("This one can be made from 5:00pm tomorrow, or one up to 3 minutes long now.");
	});
	it("fits again once the clips are a day old", async () => {
		const { deps, videoId, p, watcher } = await setup();
		await made(deps, videoId, p, ago(23 * HOUR), 300, 12);
		expect((await watcher(`/videos/${videoId}/clips`, clip("1:00", "1:10"))).status).toBe(429);
		deps.now = () => new Date(NOW.getTime() + HOUR);
		expect((await watcher(`/videos/${videoId}/clips`, clip("1:00", "1:10"))).status).toBe(303);
	});
	it("leaves out an app stream's other parts, which the site makes, not the person", async () => {
		const { deps, videoId, p, watcher } = await setup();
		await deps.db.batch([0, 1].map((i) => insertPartClipWrite(deps.db, deps.team.id, { videoStreamUid: "u1", label: "Live stream, more from 7:10pm", endSeconds: 2400, streamUid: `part-${i}`, createdBy: p })));
		expect((await watcher(`/videos/${videoId}/clips`, clip("1:00", "6:00"))).status).toBe(303);
	});
});

describe("five hours of clips a day for each team", () => {
	it("refuses a clip past the team's five hours, whoever made the rest", async () => {
		const { deps, videoId, q, watcher } = await setup();
		await made(deps, videoId, 1, ago(3 * HOUR), 300, 30, true);
		await made(deps, videoId, q, ago(3 * HOUR), 300, 29, true);
		await made(deps, videoId, q, ago(2 * HOUR), 180);
		await made(deps, videoId, 1, ago(25 * HOUR), 300, 12);
		const res = await watcher(`/videos/${videoId}/clips`, clip("1:00", "4:00"));
		expect(res.status).toBe(429);
		const text = await res.text();
		expect(text).toContain("Clips are up to 5 hours a day for each team, to keep video storage free for games, and the team has made 4 hours 58 minutes of clips in the last 24 hours.");
		expect(text).toContain("This one can be made from 4:00pm tomorrow, or one up to 2 minutes long now.");
		expect(deps.clipper.requests).toEqual([]);
		expect((await watcher(`/videos/${videoId}/clips`, clip("1:00", "3:00"))).status).toBe(303);
	});
});

describe("5 hours of clips kept for each team", () => {
	/** Two more games' videos holding `perVideo` clips each, all 5 minutes long and made two days ago. */
	async function kept(deps: TestDeps, by: number, perVideo: number) {
		const ids: number[] = [];
		for (const round of ["10", "11"]) {
			const id = await seedVideo(deps, { gameId: await seedGame(deps, { roundLabel: round }), streamUid: `u${round}` });
			await made(deps, id, by, ago(48 * HOUR), 300, perVideo);
			ids.push(id);
		}
		return ids;
	}
	it("refuses a clip once the team's kept clips come to 5 hours, however long ago they were made", async () => {
		const { deps, videoId, q, watcher } = await setup();
		await kept(deps, q, 30);
		const res = await watcher(`/videos/${videoId}/clips`, clip("0:10", "0:20"));
		expect(res.status).toBe(429);
		const text = await res.text();
		expect(text).toContain("A team keeps up to 5 hours of clips, to keep video storage free for games, and the team&#39;s clips come to 5 hours now.");
		expect(text).toContain("This one can be made once a team manager deletes some clips.");
		expect(deps.clipper.requests).toEqual([]);
		expect(await rows(deps)).toBe(60);
	});
	it("offers a shorter one when there's room, and leaves out deleted clips and a deleted video's", async () => {
		const { deps, videoId, q, watcher } = await setup();
		const [first] = await kept(deps, q, 30);
		await deps.db.prepare("UPDATE clips SET end_seconds = 180 WHERE team_id = ? AND id = (SELECT MIN(id) FROM clips WHERE team_id = ?)").bind(deps.team.id, deps.team.id).run();
		await made(deps, videoId, q, ago(48 * HOUR), 300, 2, true);
		const res = await watcher(`/videos/${videoId}/clips`, clip("1:00", "4:00"));
		expect(res.status).toBe(429);
		expect(await res.text()).toContain("This one can be made once a team manager deletes some clips, or one up to 2 minutes long now.");
		await deps.db.prepare("UPDATE videos SET deleted_at = ? WHERE team_id = ? AND id = ?").bind(ago(HOUR), deps.team.id, first).run();
		expect((await watcher(`/videos/${videoId}/clips`, clip("1:00", "4:00"))).status).toBe(303);
	});
});

describe("a clip's place, taken before Stream is asked", () => {
	it("is given back when Stream can't make the clip", async () => {
		const { deps, videoId, watcher } = await setup();
		deps.clipper.failNext = "stream unavailable";
		expect((await watcher(`/videos/${videoId}/clips`, clip("0:10", "0:20"))).status).toBe(502);
		expect(await rows(deps)).toBe(0);
	});
	it("is given back, and Stream's clip deleted, when the clip can't be saved", async () => {
		const { deps, videoId, watcher } = await setup();
		await deps.db.prepare("CREATE TRIGGER no_clips BEFORE UPDATE OF stream_uid ON clips BEGIN SELECT RAISE(ABORT, 'disk full'); END").run();
		expect((await watcher(`/videos/${videoId}/clips`, clip("0:10", "0:20"))).status).toBe(500);
		expect(deps.stream.deleted).toEqual(["clip-1"]);
		expect(await rows(deps)).toBe(0);
	});
	it("isn't shown or checked with Stream while it waits, and goes if Stream was never asked within ten minutes", async () => {
		const { deps, gameId, videoId, watcher } = await setup();
		const reserve = (at: string, label: string) => deps.db.prepare(`INSERT INTO clips (team_id, video_id, label, start_seconds, end_seconds, status, created_by, created_at)
			VALUES (?, ?, ?, 0, 10, 'processing', 1, ?)`).bind(deps.team.id, videoId, label, at).run();
		await reserve(ago(11 * 60_000), "Left behind");
		await reserve(ago(60_000), "On its way");
		expect(await (await watcher(`/games/${gameId}`)).text()).not.toContain("Left behind");
		await runSync(deps);
		const left = await deps.db.prepare("SELECT label FROM clips WHERE team_id = ?").bind(deps.team.id).all<{ label: string }>();
		expect(left.results.map((r) => r.label)).toEqual(["On its way"]);
	});
});
