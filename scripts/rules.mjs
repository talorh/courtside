// The mechanical development standards (docs/development-standards.md §1, §5, §8), one file at a time, so a test can
// feed them a file: no barrel re-exports and no `import * as` in src/, SQL only in repositories and jobs, every query
// names team_id, every post form spelled one way (the layout adds its team), and page scripts post only through the
// helpers that send the team. scripts/check-rules.mjs runs them over the repo.

// Queries that aren't for one team, each for a reason: the nightly backup copies whole tables; teams, the site's admins
// and a person's memberships are site-wide by nature; which team owns a game, video, clip or photo is
// asked across teams to offer a switch; and the admin area counts across every team (Platform, Insights, the Log, its
// navigation's counts). Every other query names its team.
const CROSS_TEAM = new Set([
	"src/jobs/backup-db.ts", "src/features/teams/teams-repository.ts", "src/auth/admins-repository.ts",
	"src/auth/memberships-repository.ts", "src/features/teams/owner-repository.ts", "src/features/admin/platform-repository.ts",
	"src/features/admin/alerts-repository.ts", "src/features/admin/support-desk-repository.ts", "src/features/admin/desk-figures-repository.ts", "src/features/admin/admin-log-repository.ts",
	"src/features/admin/insights-repository.ts", "src/features/admin/admin-nav-repository.ts",
	"src/features/admin/activity-admin-repository.ts", "src/features/admin/server-errors-repository.ts", "src/features/admin/problems-repository.ts",
	// The sign-in: a person's sessions and codes, before any team is known.
	"src/auth/session-repository.ts", "src/auth/sign-in-codes-repository.ts", "src/auth/device-view-repository.ts",
	// The jobs' reads across every team at once (which teams are busy; what every team's records know of, for the sweep).
	"src/jobs/all-teams-repository.ts",
	// The Friday check's read of every team's weekend games.
	"src/features/admin/game-day-repository.ts",
	// The month's emails, for the allowance alert.
	"src/features/admin/email-count-repository.ts",
	// The Documentation AI assistant's questions a day, by admin.
	"src/features/admin/docs-ask-repository.ts",
	// The Costs page's figures, and Health's: what every team stores and does, for site admins.
	"src/features/admin/costs-repository.ts", "src/features/admin/costs-bill-repository.ts", "src/features/admin/health-repository.ts",
]);

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** Problems in a src/ TypeScript file. */
export function sourceProblems(path, text) {
	const problems = [];
	if (/^export\s+(\*|\{[^}]*\})\s+from\s/m.test(text)) problems.push(`${path}: re-exports from another file (no barrel files)`);
	if (/^import\s+\*\s+as\s/m.test(text)) problems.push(`${path}: uses import * as`);
	const sqlAllowed = path.endsWith("-repository.ts") || path.startsWith("src/jobs/");
	// Each prepare("…"), prepare(`…`) call: its SQL text up to the closing quote.
	for (const m of text.matchAll(/\.prepare\(\s*(["`])([\s\S]*?)\1/g)) {
		const line = lineOf(text, m.index);
		if (!sqlAllowed) problems.push(`${path}:${line}: SQL outside a *-repository.ts or src/jobs/`);
		const sql = m[2];
		// A query built from shared fragments (${COLUMNS}, ${ACTIVE}) is checked where the fragment is written.
		if (!CROSS_TEAM.has(path) && !/team_id/.test(sql) && !/\$\{/.test(sql)) problems.push(`${path}:${line}: query without team_id`);
	}
	// layout() adds the team to every <form … method="post">, so a post form spelled any other way would go without it.
	for (const m of text.matchAll(/<form\b[^>]*>/gi)) {
		if (/method/i.test(m[0]) && !/\smethod="(post|get)"/.test(m[0])) {
			problems.push(`${path}:${lineOf(text, m.index)}: a form's method must be written method="post" or method="get"`);
		}
	}
	for (const m of text.matchAll(/formmethod/gi)) problems.push(`${path}:${lineOf(text, m.index)}: formmethod (a post must come from its form, which carries the team)`);
	// Only the admins' mail may email: it writes to the admins table's people, a new team's welcome to the
	// team manager its members list names, and a support ticket's emails to its own team manager or the admin it's given
	// to, and nobody else.
	if (!EMAIL_ALLOWED.has(path)) {
		if (/from\s+"[^"]*platform\/email\.ts"/.test(text)) problems.push(`${path}: uses the email port (only features/admin/admin-mail.ts may)`);
		for (const m of text.matchAll(/\bemail\.send\(/g)) problems.push(`${path}:${lineOf(text, m.index)}: uses the email port (only features/admin/admin-mail.ts may)`);
	}
	// Every log line from a team's request or job names the team, so one team's trouble can be found in Workers Logs.
	for (const m of text.matchAll(/console\.\w+\(JSON\.stringify\(\{ event: "(\w+)"[^\n]*/g)) {
		if (!SITE_WIDE_LOGS.has(path) && !SITE_WIDE_EVENTS.has(m[1]) && !/\bteamId\b/.test(m[0])) {
			problems.push(`${path}:${lineOf(text, m.index)}: a log line without teamId (${m[1]})`);
		}
	}
	// Workers AI's model is named once, in platform/workers-ai.ts, so staging and the live site can't run different ones.
	if (path !== "src/platform/workers-ai.ts") {
		for (const m of text.matchAll(/["'`]@cf\//g)) problems.push(`${path}:${lineOf(text, m.index)}: names a Workers AI model (only platform/workers-ai.ts may: import MODEL)`);
	}
	return problems;
}

// The email port's own file, where deps are built, the one service that may send, and the sign-in code's email (to an
// address a visitor typed, only once auth/sign-in-service.ts has found it on a team's list or the admins table).
const EMAIL_ALLOWED = new Set(["src/platform/email.ts", "src/app/deps.ts", "src/features/admin/admin-mail.ts", "src/auth/sign-in-mail.ts", "src/features/admin/counted-email.ts"]);

// Log lines that aren't any one team's: the backup and the clean-up cover every team. sync_videos is the whole 5-minute
// run's total (each team's own is sync_team). The sign-in's lines say teamId: null themselves (auth/).
const SITE_WIDE_LOGS = new Set(["src/jobs/backup-db.ts", "src/jobs/sweep-orphans.ts"]);
const SITE_WIDE_EVENTS = new Set(["sync_videos"]);

// The page scripts that post: upload-net.js's api() and apiForm(), and Ask, send the team (X-Courtside-Team); Go live and
// the live player post to Stream, not the site; signing out (signout.js) ends the person's session, which is no
// team's, and the admin area's Documentation AI assistant (docs-ask.js) is the admins', on a page with no team.
// stream-sdk.js is Stream's own player, as Cloudflare ships it.
const POSTS_ALLOWED = new Set(["public/upload-net.js", "public/ask.js", "public/golive-whip.js", "public/whep.js", "public/stream-sdk.js", "public/signout.js", "public/docs-ask.js"]);

// A comment says what the code needs, never who asked or when (development standards §1): no name with a date or a
// quote, no review, sweep, scrub, backlog or plan tags, and no history of what was so until or since a date.
const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const HISTORY = [
	new RegExp(`\\b[A-Z][a-z]+, \\d{1,2} ${MONTH}\\w* 20\\d\\d`), /\b[A-Z][a-z]+, \d{1,2} \w+ 20\d\d: "/, /\((?:[\w-]+ )?(?:review|sweep|scrub)\b/i, /\bbacklog B\d/i, /\bPhase \d/,
	new RegExp(`\\b(?:until|since) (?:about )?\\d{1,2} ${MONTH}\\w* 20\\d\\d`),
];
const COMMENT = /(?:^|\s)(?:\/\/|\/\*+|\*|--)\s(.*)$|\b(?:it|describe)\("([^"]*)"/;

/** Comments (and test names) that say who asked for something or when, in any file of code, tests or migrations. */
/** The folders whose source files keep to the line caps (check-loc.mjs): the site, its page scripts, the Back soon page
 * and the video joiner. Tests, docs, migrations and scripts aren't counted. */
export const LOC_ROOTS = ["src", "public", "maintenance", "join"];
/** Every folder of code, tests, scripts and migrations, for the comment rules (check-rules.mjs). */
export const COMMENT_DIRS = ["src", "public", "scripts", "tests", "migrations", "maintenance", "join"];
/** A file the line caps apply to: TypeScript or JavaScript (the joiner's plain Node .mjs too), not a declaration file. */
export const isCodeFile = (name) => /\.(ts|js|mjs)$/.test(name) && !name.endsWith(".d.ts");

export function commentProblems(path, text) {
	return text.split("\n").flatMap((line, i) => {
		const m = COMMENT.exec(line);
		const said = m && (m[1] ?? m[2]);
		return said && HISTORY.some((r) => r.test(said)) ? [`${path}:${i + 1}: a comment or test name says who asked or when (development standards §1)`] : [];
	});
}

/** Problems in a public/ page script. */
export function scriptProblems(path, text) {
	if (POSTS_ALLOWED.has(path)) return [];
	return [...text.matchAll(/method\s*:\s*["'`]post["'`]|sendBeacon|XMLHttpRequest/gi)]
		.map((m) => `${path}:${lineOf(text, m.index)}: posts without the team: use api() or apiForm() (upload-net.js)`);
}
