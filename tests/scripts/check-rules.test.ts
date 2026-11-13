import { describe, expect, it } from "vitest";
// @ts-expect-error: a Node script (plain JS), tested here on its own.
import { COMMENT_DIRS, commentProblems, isCodeFile, LOC_ROOTS, scriptProblems, sourceProblems } from "../../scripts/rules.mjs";

describe("the rules npm run check enforces", () => {
	it("covers the video joiner's folder too: its plain Node .mjs files keep to the line caps and the comment rules", () => {
		expect(LOC_ROOTS).toEqual(["src", "public", "maintenance", "join"]);
		expect(COMMENT_DIRS).toContain("join");
		expect(["pipeline.mjs", "index.ts", "watch.js"].map(isCodeFile)).toEqual([true, true, true]);
		expect(["worker.d.ts", "test-a.mp4", "Dockerfile"].map(isCodeFile)).toEqual([false, false, false]);
	});
	it("keeps the ones it had: no barrels, no import * as, SQL in repositories with its team", () => {
		expect(sourceProblems("src/a.ts", 'export { x } from "./b.ts";\n')).toEqual(["src/a.ts: re-exports from another file (no barrel files)"]);
		expect(sourceProblems("src/a.ts", 'import * as b from "./b.ts";\n')).toEqual(["src/a.ts: uses import * as"]);
		expect(sourceProblems("src/a.ts", 'db.prepare("SELECT 1 FROM games")')).toEqual(["src/a.ts:1: SQL outside a *-repository.ts or src/jobs/", "src/a.ts:1: query without team_id"]);
		expect(sourceProblems("src/features/teams/teams-repository.ts", 'db.prepare("SELECT id FROM teams")')).toEqual([]);
	});

	it("names Workers AI's model only in platform/workers-ai.ts, so staging and the live site run the same one", () => {
		expect(sourceProblems("src/features/x.ts", 'ai.run("@cf/meta/some-model", {})')).toEqual(["src/features/x.ts:1: names a Workers AI model (only platform/workers-ai.ts may: import MODEL)"]);
		expect(sourceProblems("src/platform/workers-ai.ts", 'const MODEL = "@cf/google/gemma-4-26b-a4b-it";')).toEqual([]);
	});

	it("spells every post form method=\"post\", so the layout puts the team on it", () => {
		expect(sourceProblems("src/v.ts", 'html`<form method="post" action="/a"><form method="get"><form class="x">`')).toEqual([]);
		for (const form of [`<form METHOD='POST' action="/a">`, '<form method="POST">', "<form method=post>", '<form action="/a" method="${m}">']) {
			expect(sourceProblems("src/v.ts", `html\`${form}\``), form).toEqual([`src/v.ts:1: a form's method must be written method="post" or method="get"`]);
		}
		expect(sourceProblems("src/v.ts", 'html`<button formmethod="post">`')).toEqual(["src/v.ts:1: formmethod (a post must come from its form, which carries the team)"]);
	});

	it("has every log line from a team's work say which team, except the site-wide ones", () => {
		const line = 'console.error(JSON.stringify({ event: "video_failed", videoId: 1, error: String(err) }));';
		expect(sourceProblems("src/features/videos/processing-service.ts", line)).toEqual(["src/features/videos/processing-service.ts:1: a log line without teamId (video_failed)"]);
		expect(sourceProblems("src/features/videos/processing-service.ts", line.replace("videoId: 1", "teamId: deps.team.id, videoId: 1"))).toEqual([]);
		for (const siteWide of ["src/jobs/backup-db.ts", "src/jobs/sweep-orphans.ts"]) expect(sourceProblems(siteWide, line)).toEqual([]);
		expect(sourceProblems("src/jobs/sync-videos.ts", 'console.log(JSON.stringify({ event: "sync_videos", teams: 3 }));')).toEqual([]);
	});

	it("lets only the admins' mail use the email port, so the site can't email anyone else", () => {
		const imports = 'import { createEmail } from "../../platform/email.ts";\n';
		expect(sourceProblems("src/features/support/support-service.ts", imports)).toEqual(["src/features/support/support-service.ts: uses the email port (only features/admin/admin-mail.ts may)"]);
		expect(sourceProblems("src/features/support/support-service.ts", "await deps.email.send({ to, subject, text });")).toEqual(["src/features/support/support-service.ts:1: uses the email port (only features/admin/admin-mail.ts may)"]);
		expect(sourceProblems("src/features/admin/admin-mail.ts", `${imports}await deps.email.send({ to, subject, text });`)).toEqual([]);
		expect(sourceProblems("src/app/deps.ts", 'import { createEmail } from "../platform/email.ts";\n')).toEqual([]);
	});

	it("lets page scripts post only through the helpers that send the team (and Go live's and the player's posts to Stream)", () => {
		for (const ok of ["public/upload-net.js", "public/ask.js", "public/golive-whip.js", "public/whep.js"]) {
			expect(scriptProblems(ok, 'fetch(u, { method: "POST" })')).toEqual([]);
		}
		expect(scriptProblems("public/photos.js", "fetch(u, { method: 'post', body })")).toEqual(["public/photos.js:1: posts without the team: use api() or apiForm() (upload-net.js)"]);
		expect(scriptProblems("public/x.js", "navigator.sendBeacon('/api/x', b)")).toEqual(["public/x.js:1: posts without the team: use api() or apiForm() (upload-net.js)"]);
		expect(scriptProblems("public/x.js", "new XMLHttpRequest()")).toEqual(["public/x.js:1: posts without the team: use api() or apiForm() (upload-net.js)"]);
		expect(scriptProblems("public/stream-sdk.js", 'new XMLHttpRequest();x={method:"POST"}')).toEqual([]);
	});
});

describe("comments say only what the code needs (development standards §1)", () => {
	it("flags a comment or test name that says who asked or when, and leaves what the code needs alone", () => {
		const flagged = [
			'// The Log (Sam, 1 Nov 2026: "more entries")', '/** Hide scores (spoilers, backlog B9). */', "// Every write (multi-team, Phase 2)",
			"-- Kept two days until 1 Nov 2026.", '\tit("adds members (review R7)", () => {', "// One a run (sweep 3).", "// Members, since 28 Oct 2026.",
		];
		const fine = [
			"// Ask Virtual Team Manager: one question in, one answer out.", '\tit("reads right with no name to ask: no Sam, no B12.1", () => {',
			"// Test clock: Thu 15 Oct 2026, 11am local.", "/** 31/10/2026, Sat 31 Oct 2026 → '2026-10-31'. */", "// The reviews are in docs/reviews/.",
		];
		expect(commentProblems("x.ts", flagged.join("\n"))).toHaveLength(flagged.length);
		expect(commentProblems("x.ts", fine.join("\n"))).toEqual([]);
	});
});
