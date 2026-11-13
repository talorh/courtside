import { readDeploy } from "./deploy-config.mjs";

// npm run release's checks, as plain functions (tests/scripts/release-checks.test.ts): which site the config deploys
// to, whether anything is uploading or streaming on it, and whether the changelog has a line for this deploy.

// A part goes up about every 25 seconds while a phone films or uploads, and the 5-minute run notes a live picture: this
// long with neither means nothing is going on.
export const QUIET_MINUTES = 15;
// Behind the maintenance page (npm run release -- --maintenance) nobody can start an upload or a stream, so only a part
// already on its way to R2 (they go straight there) is waited for.
export const MAINTENANCE_QUIET_MINUTES = 2;

// What the quiet check reads, in every team (other teams are coming; one team's filter would let a
// release go out in the middle of another team's game). A stopped stream (its input switched off) is left out: Stream
// can go on calling it connected, and its recording's upload is what's left, which the uploads check watches.
export const OPEN_STREAMS_SQL = "SELECT game_id AS gameId, last_live_at AS lastLiveAt FROM live_streams WHERE status = 'open' AND end_requested_at IS NULL";
export const UPLOADING_SQL = `SELECT id, game_id AS gameId, r2_key AS r2Key, r2_upload_id AS r2UploadId, created_at AS createdAt FROM videos
	WHERE status = 'uploading' AND deleted_at IS NULL AND r2_upload_id IS NOT NULL`;
// A carried-on recording whose parts are being joined (the 5-minute job and the joiner): a deploy mid-join would be
// tried again, but it's left to finish.
export const JOINING_SQL = `SELECT v.id, v.game_id AS gameId, v.join_tried_at AS triedAt FROM videos v
	WHERE v.status = 'processing' AND v.stream_uid IS NULL AND v.deleted_at IS NULL
	AND EXISTS (SELECT 1 FROM recording_segments s WHERE s.team_id = v.team_id AND s.video_id = v.id)`;

/** The account, database, Worker and secrets file the site deploys to (deploy.config.ts, as text). */
export function siteFromConfig(text) {
	const d = readDeploy(text);
	return { name: d.worker, accountId: d.accountId, d1Id: d.d1Id, bucket: d.bucket, secretsFile: ".secrets.production.json" };
}

/** Every database a deploy must have migrated first: the live site's (staging's is migrated by npm run staging). */
export function databasesFromConfig(text) {
	const d = readDeploy(text);
	return [{ name: d.worker, accountId: d.accountId, d1Id: d.d1Id }];
}

const ago = (iso, now) => `${Math.round((now.getTime() - Date.parse(iso)) / 60_000)} min ago`;

/**
 * What a deploy mustn't cut into: an upload or a live recording that sent a part in the last `quietMinutes` (15; 2
 * behind the maintenance page), or started that recently and has sent none yet, or a live picture the 5-minute run saw
 * in that time, or a join of a recording's parts tried in that time. `streams`: open live streams ({ gameId, lastLiveAt });
 * `uploads`: uploading videos ({ id, gameId, createdAt, lastPartAt }); `joins`: videos with parts to join ({ id, gameId,
 * triedAt }). The reasons; none: quiet.
 */
export function busyOnSite({ streams, uploads, joins = [], now, quietMinutes = QUIET_MINUTES }) {
	const recent = (iso) => typeof iso === "string" && now.getTime() - Date.parse(iso) < quietMinutes * 60_000;
	return [
		...streams.filter((s) => recent(s.lastLiveAt)).map((s) => `game ${s.gameId} was live ${ago(s.lastLiveAt, now)}`),
		...uploads.filter((u) => recent(u.lastPartAt ?? u.createdAt))
			.map((u) => `video ${u.id} (game ${u.gameId}) ${u.lastPartAt ? "sent a part" : "started uploading"} ${ago(u.lastPartAt ?? u.createdAt, now)}`),
		...joins.filter((j) => recent(j.triedAt)).map((j) => `video ${j.id} (game ${j.gameId}) is being joined (tried ${ago(j.triedAt, now)})`),
	];
}

/** Why the browser suite shouldn't run now, or null: the pretend camera's timings (WebKit) slip when the computer is busy
 * with something else, so a release waits for a quiet one. `load`: the 1-minute load average; `cores`: how many. */
export const busyComputer = (load, cores) => (load > cores
	? `the computer is busy (load ${load.toFixed(1)} on ${cores} cores): the browser suite's camera timings need it quiet, so wait for whatever's running to finish`
	: null);

/** What npm run staging last put on staging (scripts/staging.mjs writes it once the deploy has worked): a ref in the
 * repo the worktree and main share, which release reads and no push sends. */
export const STAGING_REF = "refs/courtside/staging";

// What changes nothing the site runs, so needn't go to staging again (AGENTS.md): docs and notes, tests, provisioning
// bodies, and the maintenance Worker (deployed by its own script). The changelog does: the site shows it.
const SKIPS_STAGING = [/^docs\//, /^tests\//, /^infra\//, /^maintenance\//, /^(README|AGENTS|INSTALL|LICENSE|todo)(\.md)?$/];
export const skipsStaging = (path) => SKIPS_STAGING.some((re) => re.test(path));

/**
 * Why this commit can't go live yet, staging-wise, or null (everything goes to staging
 * and is tried there before it goes live). `staged`: the commit on staging (null: none recorded); `inHistory`: it's this
 * commit or one before it; `changed`: the files changed between them.
 */
export function stagingProblem({ staged, head, inHistory, changed }) {
	if (!staged) return "nothing is recorded as on staging: npm run staging first, and try it there";
	if (!inHistory) return `staging runs ${staged.slice(0, 7)}, which isn't part of this commit's history: put ${head.slice(0, 7)} on staging (npm run staging) and try it there`;
	const site = changed.filter((path) => !skipsStaging(path));
	if (!site.length) return null;
	const shown = `${site.slice(0, 5).join(", ")}${site.length > 5 ? ", ..." : ""}`;
	return `${site.length} ${site.length === 1 ? "file" : "files"} the site runs changed since staging (${shown}): put ${head.slice(0, 7)} on staging (npm run staging) and try it there`;
}

/** The newest changelog line is what the live site already runs, so this deploy has no line of its own yet. */
export const sameAsLive = (newest, liveMessage) => newest !== null && newest === liveMessage;

/**
 * Workers Builds' deploy (scripts/deploy-from-builds.mjs): only a push to main, which only npm run release makes, with
 * the newest changelog line as the message and the commit as the tag. `cf` args; throws instead of deploying anything else.
 */
export function buildsDeployArgs({ newest, commit, branch }) {
	if (branch !== "main") throw new Error(`Builds deploys only main, not "${branch}"`);
	if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`no commit to tag the deploy with ("${commit}")`);
	if (!newest) throw new Error("CHANGELOG.md has no lines");
	return ["deploy", "--message", newest, "--tag", commit.slice(0, 7)];
}

const WAITING = new Set(["queued", "initializing"]);

/** The newest build of `commit` started since `pushedAt` (ms; a retry builds afresh), and how far it has got. */
export function buildFor(builds, commit, pushedAt) {
	const b = builds
		.filter((x) => x.build_trigger_metadata?.commit_hash === commit && Date.parse(x.created_on) >= pushedAt)
		.sort((x, y) => Date.parse(y.created_on) - Date.parse(x.created_on))[0];
	if (!b) return { state: "waiting" };
	if (b.status !== "stopped") return { state: WAITING.has(b.status) ? "waiting" : "running", uuid: b.build_uuid };
	return b.build_outcome === "success" ? { state: "deployed", uuid: b.build_uuid } : { state: "failed", uuid: b.build_uuid, outcome: b.build_outcome };
}
