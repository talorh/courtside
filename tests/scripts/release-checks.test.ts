import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { buildFor, buildsDeployArgs, busyComputer, busyOnSite, databasesFromConfig, MAINTENANCE_QUIET_MINUTES, OPEN_STREAMS_SQL, rebuildHint, sameAsLive, SEGMENTS_SQL, siteFromConfig, skipsStaging, STAGING_REF, stagingDiffArgs, stagingProblem, UPLOADING_SQL, withLastParts } from "../../scripts/release-checks.mjs";
import { createTestDb } from "../helpers/d1-sqlite.ts";

const now = new Date("2026-10-30T08:00:00Z"); // 7pm local, game night
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe("npm run release's checks", () => {
	const DEPLOY = `export const DEPLOY = { accountId: "a1", zoneId: "z1", worker: "wolves", d1Name: "wolves", d1Id: "d1", bucket: "wolves-originals",
		staging: { d1Name: "wolves-staging", d1Id: "d2", bucket: "wolves-staging" } };`;

	it("reads the site the config deploys to (deploy.config.ts), and its secrets file", () => {
		expect(siteFromConfig(DEPLOY)).toEqual({ name: "wolves", accountId: "a1", d1Id: "d1", bucket: "wolves-originals", secretsFile: ".secrets.production.json" });
		// The repository's own file is read the same way, placeholders and all, until the install fills it in.
		expect(siteFromConfig(readFileSync("deploy.config.ts", "utf8")).secretsFile).toBe(".secrets.production.json");
		expect(() => siteFromConfig("export const DEPLOY = {};")).toThrow(/couldn't read/);
	});

	it("knows the one database whose migrations must be applied before a deploy: the live site's, never staging's", () => {
		expect(databasesFromConfig(DEPLOY)).toEqual([{ name: "wolves", accountId: "a1", d1Id: "d1" }]);
	});

	it("refuses to run the browser suite on a busy computer (its camera timings need a quiet one)", () => {
		expect(busyComputer(1.2, 8)).toBeNull();
		expect(busyComputer(8, 8)).toBeNull();
		expect(busyComputer(9.5, 8)).toBe("the computer is busy (load 9.5 on 8 cores): the browser suite's camera timings need it quiet, so wait for whatever's running to finish");
	});

	it("refuses while a phone is streaming or sending its recording, or an upload is going", () => {
		expect(busyOnSite({ streams: [{ gameId: 12, lastLiveAt: minutesAgo(3) }], uploads: [], now })).toEqual(["game 12 was live 3 min ago"]);
		expect(busyOnSite({ streams: [], uploads: [{ id: 25, gameId: 12, createdAt: minutesAgo(70), lastPartAt: minutesAgo(1) }], now }))
			.toEqual(["video 25 (game 12) sent a part 1 min ago"]);
		expect(busyOnSite({ streams: [], uploads: [{ id: 26, gameId: 3, createdAt: minutesAgo(2), lastPartAt: null }], now }))
			.toEqual(["video 26 (game 3) started uploading 2 min ago"]);
		expect(busyOnSite({ streams: [], uploads: [], joins: [{ id: 5, gameId: 2, triedAt: minutesAgo(2) }], now })).toEqual(["video 5 (game 2) is being joined (tried 2 min ago)"]);
		expect(busyOnSite({ streams: [], uploads: [], joins: [{ id: 5, gameId: 2, triedAt: minutesAgo(40) }, { id: 6, gameId: 3, triedAt: null }], now })).toEqual([]);
	});
	it("counts a stream set up just now that isn't live yet (an external app waiting for its first picture), not one set up long ago", () => {
		expect(busyOnSite({ streams: [{ gameId: 12, lastLiveAt: null, createdAt: minutesAgo(2) }], uploads: [], now })).toEqual(["game 12's stream was set up 2 min ago"]);
		expect(busyOnSite({ streams: [{ gameId: 12, lastLiveAt: null, createdAt: minutesAgo(90) }], uploads: [], now })).toEqual([]);
		expect(OPEN_STREAMS_SQL).toMatch(/created_at AS createdAt/);
	});

	it("looks at every team's streams and uploads, not one team's (a release mustn't cut into another team's game)", () => {
		for (const sql of [OPEN_STREAMS_SQL, UPLOADING_SQL]) {
			expect(sql).not.toMatch(/team_id/);
			expect(sql).not.toContain("?");
		}
		expect(OPEN_STREAMS_SQL).toMatch(/status = 'open'/);
		// A stopped stream's input is switched off: what's left is its recording's upload, which UPLOADING_SQL watches.
		expect(OPEN_STREAMS_SQL).toMatch(/end_requested_at IS NULL/);
		expect(UPLOADING_SQL).toMatch(/status = 'uploading'/);
	});

	it("behind the maintenance page (--maintenance) waits only 2 quiet minutes, as nobody can start anything, but still refuses a part that just arrived", () => {
		expect(MAINTENANCE_QUIET_MINUTES).toBe(2);
		const uploads = [{ id: 25, gameId: 12, createdAt: minutesAgo(70), lastPartAt: minutesAgo(1) }];
		expect(busyOnSite({ streams: [], uploads, now, quietMinutes: MAINTENANCE_QUIET_MINUTES })).toEqual(["video 25 (game 12) sent a part 1 min ago"]);
		const older = [{ id: 25, gameId: 12, createdAt: minutesAgo(70), lastPartAt: minutesAgo(3) }];
		expect(busyOnSite({ streams: [{ gameId: 12, lastLiveAt: minutesAgo(5) }], uploads: older, now, quietMinutes: MAINTENANCE_QUIET_MINUTES })).toEqual([]);
		expect(busyOnSite({ streams: [], uploads: older, now })).toEqual(["video 25 (game 12) sent a part 3 min ago"]);
	});

	it("goes ahead once everything has been quiet for 15 minutes (a stream set up but never live, an upload left behind)", () => {
		expect(busyOnSite({
			streams: [{ gameId: 12, lastLiveAt: null }, { gameId: 3, lastLiveAt: minutesAgo(16) }],
			uploads: [{ id: 20, gameId: 11, createdAt: minutesAgo(3000), lastPartAt: minutesAgo(2900) }, { id: 21, gameId: 4, createdAt: minutesAgo(20), lastPartAt: null }],
			now,
		})).toEqual([]);
	});

	it("reads a carried-on recording's open later segments too, and not a finished or deleted video's", async () => {
		const db = createTestDb();
		const run = (sql: string) => db.prepare(sql).run();
		for (const id of [7, 8, 9]) await run(`INSERT INTO games (id, team_id, starts_at, competition, opponent) VALUES (${id}, 'b12.1-2026', '2026-10-30T18:40', 'Practice match', 'TBC')`);
		for (const [id, status, deleted] of [[40, "uploading", null], [41, "processing", null], [42, "uploading", "2026-10-30T07:00:00Z"]] as const) {
			await run(`INSERT INTO videos (id, team_id, game_id, status, r2_key, r2_upload_id, original_name, original_bytes, delete_after, created_at, deleted_at)
				VALUES (${id}, 'b12.1-2026', ${id - 33}, '${status}', 'k${id}', 'up${id}', 'n', 0, 'd', '${minutesAgo(60)}', ${deleted ? `'${deleted}'` : "NULL"})`);
			await run(`INSERT INTO recording_segments (team_id, video_id, n, r2_key, r2_upload_id, created_at) VALUES ('b12.1-2026', ${id}, 2, 'k${id}.2', 'up${id}.2', 'now')`);
		}
		await run("INSERT INTO recording_segments (team_id, video_id, n, r2_key, r2_upload_id, created_at) VALUES ('b12.1-2026', 40, 3, 'k40.3', NULL, 'now')");
		expect((await db.prepare(SEGMENTS_SQL).all()).results).toEqual([{ id: 40, gameId: 7, createdAt: minutesAgo(60), r2Key: "k40.2", r2UploadId: "up40.2" }]);
		expect(SEGMENTS_SQL).not.toContain("?");
	});

	it("takes a recording's newest part from any of its segments, so a carried-on stream's later parts count", async () => {
		const parts: Record<string, Array<{ uploaded: string }> | null> = {
			"k25/up25": [{ uploaded: minutesAgo(50) }], "k25.2/up25.2": [{ uploaded: minutesAgo(2) }, { uploaded: minutesAgo(9) }],
			"k26/up26": null, "k27.2/up27.2": [{ uploaded: minutesAgo(4) }],
		};
		const listParts = async (key: string, id: string) => parts[`${key}/${id}`] ?? null;
		const uploads = await withLastParts(
			[{ id: 25, gameId: 12, createdAt: minutesAgo(70), r2Key: "k25", r2UploadId: "up25" }, { id: 26, gameId: 3, createdAt: minutesAgo(30), r2Key: "k26", r2UploadId: "up26" }],
			[{ id: 25, gameId: 12, createdAt: minutesAgo(70), r2Key: "k25.2", r2UploadId: "up25.2" }, { id: 27, gameId: 4, createdAt: minutesAgo(80), r2Key: "k27.2", r2UploadId: "up27.2" }],
			listParts,
		);
		expect(uploads).toEqual([
			{ id: 25, gameId: 12, createdAt: minutesAgo(70), lastPartAt: minutesAgo(2) },
			{ id: 26, gameId: 3, createdAt: minutesAgo(30), lastPartAt: null },
			{ id: 27, gameId: 4, createdAt: minutesAgo(80), lastPartAt: minutesAgo(4) },
		]);
		expect(busyOnSite({ streams: [], uploads, now })).toEqual(["video 25 (game 12) sent a part 2 min ago", "video 27 (game 4) sent a part 4 min ago"]);
	});

	it("needs a changelog line of the deploy's own", () => {
		expect(sameAsLive("Roster: one-off duties kept", "Roster: one-off duties kept")).toBe(true);
		expect(sameAsLive("Go live: says when it's starting", "Roster: one-off duties kept")).toBe(false);
		expect(sameAsLive(null, null)).toBe(false);
	});
});

describe("staging first, then live (everything is tried on staging before it goes live)", () => {
	const head = "a".repeat(40), staged = "b".repeat(40);

	it("records what npm run staging put there as a ref the worktree and main share, never pushed", () => {
		expect(STAGING_REF).toBe("refs/courtside/staging");
	});

	it("releases the commit that was on staging, or one with only docs, tests or notes changed since", () => {
		expect(stagingProblem({ staged: head, head, inHistory: true, changed: [] })).toBeNull();
		expect(stagingProblem({ staged, head, inHistory: true, changed: ["docs/spec.md", "LICENSE", "README.md", "AGENTS.md", "INSTALL.md", "tests/app/landing.test.ts"] })).toBeNull();
		expect(stagingProblem({ staged, head, inHistory: true, changed: ["infra/r2-cors.json", "maintenance/src/index.ts"] })).toBeNull();
	});

	it("refuses when nothing's recorded, staging ran another line of work, or something the site runs changed since", () => {
		expect(stagingProblem({ staged: null, head, inHistory: false, changed: [] })).toMatch(/nothing is recorded as on staging: npm run staging first/);
		expect(stagingProblem({ staged, head, inHistory: false, changed: [] })).toMatch(/staging runs bbbbbbb, which isn't part of this commit's history/);
		const changed = ["src/app/landing.ts", "docs/spec.md", "CHANGELOG.md", "public/app.css", "migrations/0031_x.sql", "cloudflare.config.ts", "package.json"];
		expect(stagingProblem({ staged, head, inHistory: true, changed }))
			.toBe("6 files the site runs changed since staging (src/app/landing.ts, CHANGELOG.md, public/app.css, migrations/0031_x.sql, cloudflare.config.ts, ...): put aaaaaaa on staging (npm run staging) and try it there");
	});

	it("counts the changelog, the scripts and the config as the site's (the changelog shows on the site; Builds runs a script)", () => {
		for (const path of ["CHANGELOG.md", "scripts/deploy-from-builds.mjs", "package-lock.json", "vite.config.ts", "src/index.ts"]) expect(skipsStaging(path), path).toBe(false);
		for (const path of ["docs/runbooks/staging.md", "tests/e2e/help.e2e.mjs", "AGENTS.md", "todo.md", "README.md", "INSTALL.md"]) expect(skipsStaging(path), path).toBe(true);
		expect(skipsStaging("public/AGENTS.md")).toBe(false);
	});
	it("lists a file moved out of the site under its old name too, so moving src/ into docs/ still needs staging", () => {
		expect(stagingDiffArgs("abc", "def")).toEqual(["diff", "--name-only", "--no-renames", "abc", "def"]);
	});
	it("says how to build main again with this cf: by the Worker's tag", () => {
		expect(rebuildHint("ef10")).toBe("cf builds create ef10 --branch main");
	});
});

describe("deploying from main through Workers Builds", () => {
	const commit = "aada4b379e6ae7437808f13ee2d2e88911b947ce";
	const pushedAt = Date.parse("2026-10-26T05:40:00Z");
	const build = (status: string, outcome: string | null, hash = commit, created = "2026-10-26T05:40:05Z") =>
		({ build_uuid: "b1", status, build_outcome: outcome, created_on: created, build_trigger_metadata: { commit_hash: hash } });

	it("Builds deploys main with the newest changelog line as the message and the commit as the tag", () => {
		expect(buildsDeployArgs({ newest: "Behind the scenes: updates go out from Cloudflare", commit, branch: "main" }))
			.toEqual(["deploy", "--message", "Behind the scenes: updates go out from Cloudflare", "--tag", "aada4b3"]);
	});

	it("Builds deploys nothing from another branch, without the commit, or without a changelog line", () => {
		expect(() => buildsDeployArgs({ newest: "x", commit, branch: "work" })).toThrow(/only main/);
		expect(() => buildsDeployArgs({ newest: "x", commit, branch: "" })).toThrow(/only main/);
		expect(() => buildsDeployArgs({ newest: "x", commit: "", branch: "main" })).toThrow(/commit/);
		expect(() => buildsDeployArgs({ newest: null, commit, branch: "main" })).toThrow(/CHANGELOG/);
	});

	it("follows the pushed commit's build until it has deployed or failed", () => {
		expect(buildFor([], commit, pushedAt)).toEqual({ state: "waiting" });
		expect(buildFor([build("queued", null)], commit, pushedAt)).toEqual({ state: "waiting", uuid: "b1" });
		expect(buildFor([build("initializing", null)], commit, pushedAt)).toEqual({ state: "waiting", uuid: "b1" });
		expect(buildFor([build("running", null)], commit, pushedAt)).toEqual({ state: "running", uuid: "b1" });
		expect(buildFor([build("stopped", "success")], commit, pushedAt)).toEqual({ state: "deployed", uuid: "b1" });
		expect(buildFor([build("stopped", "fail")], commit, pushedAt)).toEqual({ state: "failed", uuid: "b1", outcome: "fail" });
		expect(buildFor([build("stopped", "cancelled")], commit, pushedAt)).toEqual({ state: "failed", uuid: "b1", outcome: "cancelled" });
	});

	it("ignores other commits' builds, and this commit's builds from before the push (a retry builds afresh)", () => {
		expect(buildFor([build("stopped", "success", "0".repeat(40))], commit, pushedAt)).toEqual({ state: "waiting" });
		expect(buildFor([build("stopped", "fail", commit, "2026-10-26T05:33:10Z")], commit, pushedAt)).toEqual({ state: "waiting" });
		const older = { ...build("stopped", "fail", commit, "2026-10-26T05:40:02Z"), build_uuid: "b0" };
		expect(buildFor([older, build("running", null)], commit, pushedAt)).toEqual({ state: "running", uuid: "b1" });
	});
});
