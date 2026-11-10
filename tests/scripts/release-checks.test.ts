import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain JS script (scripts/), tested here on its own.
import { buildFor, buildsDeployArgs, busyComputer, busyOnSite, databasesFromConfig, MAINTENANCE_QUIET_MINUTES, OPEN_STREAMS_SQL, sameAsLive, siteFromConfig, skipsStaging, STAGING_REF, stagingProblem, UPLOADING_SQL } from "../../scripts/release-checks.mjs";

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
		for (const path of ["docs/runbooks/staging.md", "tests/e2e/help.e2e.mjs", "AGENTS.md"]) expect(skipsStaging(path), path).toBe(true);
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
