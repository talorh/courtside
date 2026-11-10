import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

const page = async () => (await makeClient(createTestDeps())("/admin/docs")).text();

describe("the admin area's Documentation", () => {
	it("is a page of its own under More, with its stylesheet, a contents list and every section it links to", async () => {
		const html = await page();
		expect(html).toContain("<title>Admin: Documentation · Courtside</title>");
		expect(html).toMatch(/<a href="\/admin\/docs" aria-current="page">(?:(?!<\/a>).)*<span>Documentation<\/span>/s);
		expect(html).toContain('<link rel="stylesheet" href="/docs.css">');
		const items = [...html.matchAll(/<li><a href="#([a-z]+)"><span class="num">(\d+)\.<\/span> ([^<]+)<\/a><\/li>/g)];
		const contents = items.map((m) => m[1]);
		expect(contents).toEqual(["start", "overview", "cloudflare", "artifacts", "requests", "signin", "teams", "people", "fixture", "roster", "video",
			"watching", "photos", "home", "help", "privacy", "fairuse", "admin", "tasks", "jobs", "data", "monitoring", "costs", "setup", "agent", "releases", "recovery",
			"code", "glossary", "decisions"]);
		// Numbered 1 to 29 through the groups, the number on each heading too.
		expect(items.map((m) => Number(m[2]))).toEqual(contents.map((_, i) => i + 1));
		for (const [i, id] of contents.entries()) {
			expect(html, id).toMatch(new RegExp(`<section class="panel docsec" id="${id}" aria-labelledby="${id}-h"><p class="docs-crumb">Documentation › [^<]+</p><h2 id="${id}-h"><span class="docs-num">${i + 1}\\.</span> `));
		}
		// Laid out as a documentation site: the contents in groups with a search box, one section at a time (docs.js) with
		// the contents behind a button on a phone, On this page for a wide screen, and cards to the sections either side.
		expect(html).toContain('<script type="module" src="/docs.js"></script>');
		expect(html).toContain('<button class="btn quiet toc-toggle" type="button" aria-expanded="false" aria-controls="toc-list">');
		expect(html).toContain('<input type="search" id="docs-q" placeholder="Search" aria-label="Search the documentation" autocomplete="off">');
		expect(html).toContain('<ol class="docs-results" id="docs-results" hidden aria-label="Search results"></ol>');
		expect(html.match(/<section class="toc-group"><h3>([^<]+)<\/h3>/g)?.map((m) => m.replace(/<[^>]+>/g, ""))).toEqual(["Getting started", "The platform", "How it works", "Running it", "Changing it", "Reference"]);
		expect(html).not.toContain("Everything on one page");
		expect(html).toContain('<aside class="docs-outline" aria-label="On this page" hidden><h2>On this page</h2><ol id="docs-outline"></ol></aside>');
		expect(html).toContain('<p class="docs-crumb">Documentation › Running it</p><h2 id="jobs-h"><span class="docs-num">20.</span> Background jobs</h2>');
		expect(html).toContain('<nav class="docs-pn" aria-label="Neighbouring sections"><span></span><a class="next" href="#overview"><small>Next</small><b>2. The site at a glance</b></a></nav>');
		expect(html).toContain('<a class="prev" href="#artifacts"><small>Previous</small><b>4. Where the code lives</b></a><a class="next" href="#signin"><small>Next</small><b>6. Signing in</b></a>');
		expect(html).toContain('<a class="prev" href="#glossary"><small>Previous</small><b>29. Glossary</b></a></nav>');
	});

	it("covers the Cloudflare setup as it stands: the account, its resources, the edge and the secrets by name only", async () => {
		const html = await page();
		for (const words of ["deploy.config.ts", "courtside-originals", "courtside-maintenance", "courtside/courtside", "Workers Builds", "alerts@saints.example",
			"Rate limiting", "Human check", "STREAM_API_TOKEN", "CF_INSIGHTS_TOKEN", "courtside-staging"]) expect(html, words).toContain(words);
	});

	it("draws its diagrams as SVG a screen reader can name, coloured by classes, each with its own arrowhead", async () => {
		const html = await page();
		const figures = [...html.matchAll(/<svg viewBox="[^"]+" width="\d+" height="\d+" role="img" aria-labelledby="dg-([a-z]+)-t dg-\1-d"/g)].map((m) => m[1]);
		expect(figures).toEqual(["system", "placement", "codeflow", "worktrees", "request", "signin", "lifecycle", "people", "fixturein", "playhqsync", "airead", "scores",
			"rosterfill", "rosterchange", "upload", "live", "join", "clip", "photo", "removal", "ask", "ticket", "admindata", "costflow", "five", "nightly", "data", "alerts",
			"environments", "release", "branches", "recovery"]);
		for (const id of figures) {
			expect(html, id).toMatch(new RegExp(`<title id="dg-${id}-t">[^<]+</title><desc id="dg-${id}-d">[^<]{40,}</desc>`));
			expect(html.split(`<marker id="ah-${id}"`).length, id).toBe(2);
		}
		// The Content Security Policy allows no inline style.
		expect(html).not.toMatch(/\sstyle="/);
	});

	it("says where the Worker runs and why, and how branches, staging and Workers Builds fit together", async () => {
		const html = await page();
		// Placement: Cloudflare's data centre nearest AWS's Sydney region, beside D1; not AWS, and nothing extra to pay.
		expect(html).toContain("<h3>Where the Worker runs</h3>");
		expect(html).toContain("aws:ap-southeast-2");
		expect(html).toMatch(/nothing runs on AWS/i);
		expect(html).toMatch(/costs nothing extra/i);
		// Branches and builds: feature/ and fix/ off staging, staging deployed as the preview, main fast-forwarded, Builds deploys.
		// Environments: how a staging deploy differs from a production one, side by side.
		expect(html).toContain("<h3>Environments</h3>");
		expect(html).toContain('<th scope="col">Staging deploy</th><th scope="col">Production deploy</th>');
		for (const words of ["cf previews deploy staging", "npm run staging -- setup", "Applied to staging's database by the command itself", "Not on a day a team plays"]) {
			expect(html, words).toContain(words);
		}
		expect(html).toContain("<h3>Branches</h3>");
		expect(html).toContain("<h3>Builds</h3>");
		for (const words of ["feature/", "fix/", "fast-forwarded", "npm run staging", "npm run release", "npm ci &amp;&amp; npm run check", "refs/courtside/staging"]) {
			expect(html, words).toContain(words);
		}
	});

	it("explains the fixture: PlayHQ's feed, reading any page with Workers AI, spreadsheets, and the checks that keep it in step", async () => {
		const html = await page();
		expect(html).toContain('<h2 id="fixture-h"><span class="docs-num">9.</span> The fixture and PlayHQ</h2>');
		for (const words of ["api.playhq.com/graphql", "discoverTeamFixture", "Origin: https://www.playhq.com", "not PlayHQ's official API",
			"@cf/google/gemma-4-26b-a4b-it", "JSON mode", "30,000 characters", "temperature 0", "Never make up a game",
			"6:40pm", "Not on PlayHQ any more", "every 8 hours", "every hour", "six weeks after", "60 days", "FINAL", "3 days after tip-off",
			"Check now", "No video for these games", "the same day and time, or the same day against the same opponent", "playhq_fixtures"]) {
			expect(html, words).toContain(words);
		}
	});

	it("explains the roster: the slots each game needs, how they're shared out fairly, and what changes them", async () => {
		const html = await page();
		expect(html).toContain('<h2 id="roster-h"><span class="docs-num">10.</span> The roster</h2>');
		for (const words of ["Monday to Sunday", "two scorers", "Generate roster", "Roster's pick", "Scorers only this week", "No video this week",
			"Time off the roster", "fewest duties", "within one of each other", "squared", "second game", "swap", "roster_slots", "roster_families",
			"roster_duties", "roster_weeks", "WhatsApp", "Export to Excel"]) {
			expect(html, words).toContain(words);
		}
	});

	it("explains people and players, watching and clips, Home and removal requests, and Help, Ask and support", async () => {
		const html = await page();
		const sections: Record<string, string[]> = {
			people: ["Add a person", "Let them sign in", "Who's using the site", "hidden membership", "View as", "at most 10 players", "setup checklist", "Get every HD copy ready", "clip_players"],
			watching: ["New for 21 days", "Carry on from", "Every download is logged", "media_downloads", "50 clips at most", "STREAM_API_TOKEN", "exactly Coach", "coach_notes", "video_views"],
			photos: ["DateTimeOriginal", "2560 px", "three at once", "named as it downloads", "one zip", "all or none"],
			home: ["from templates", "public/desktop.css", "1024px", "30 days", "pulled down to refresh", "Notifications", "removal_requests", "photo_removal_requests"],
			help: ["Each person sees only what they do", "@cf/google/gemma-4-26b-a4b-it", "20 questions a member a day", "never stored", "Contact support", "Waiting for you", "support_messages"],
		};
		for (const [id, words] of Object.entries(sections)) {
			const body = html.split(`id="${id}" aria-labelledby`)[1]!.split('<section class="panel docsec"')[0]!;
			for (const w of words) expect(body, `${id}: ${w}`).toContain(w);
		}
	});

	it("explains Carry on streaming and the video joiner wherever they belong, naming Cloudflare Containers", async () => {
		const html = await page();
		const sections: Record<string, string[]> = {
			overview: ["courtside-join", "Cloudflare Containers"],
			cloudflare: ["Cloudflare Containers", "standard-1", "4 GiB of memory", "8 GB of disk", "sleeps after ten quiet minutes", "JOINER"],
			video: ["<h3>If the page closes mid-game</h3>", "<h3>How the parts become one video</h3>", "Carry on streaming", "Cloudflare Containers", "about ten minutes longer",
				"golive-kept.js", "recording_segments", "Keep the first part", "tried again every ten minutes", "read back from R2", "video_joined"],
			jobs: ["<th scope=\"row\">Joins</th>", "<th scope=\"row\">The video joiner</th>", "two small test files", "join given up on after six tries"],
			admin: ["<th scope=\"row\">Video joiner</th>"],
			monitoring: ["<th scope=\"row\">The video joiner</th>", "Not answering its nightly test"],
			costs: ["<th scope=\"row\">Containers (the video joiner)</th>", "25 GiB-hours"],
			code: ["<th scope=\"row\"><code>join</code></th>", "Dockerfile"],
			glossary: ["<th scope=\"row\">Container</th>", "<th scope=\"row\">Durable Object</th>", "Cloudflare Containers"],
		};
		for (const [id, words] of Object.entries(sections)) {
			const body = html.split(`id="${id}" aria-labelledby`)[1]!.split('<section class="panel docsec"')[0]!;
			for (const w of words) expect(body, `${id}: ${w}`).toContain(w);
		}
		// The system picture shows the joiner beside the site's other pieces.
		expect(/aria-labelledby="dg-system-t[\s\S]*?<\/figure>/.exec(html)?.[0]).toContain("courtside-join");
	});

	it("explains the admin area: each page's figures and where they come from, how Costs works them out, and what sets each alert", async () => {
		const html = await page();
		expect(html).toContain('<h2 id="admin-h"><span class="docs-num">18.</span> The admin area and its figures</h2>');
		for (const words of ["CROSS_TEAM", "view_weeks", "platform_alerts", "sign_in_events", "CF_INSIGHTS_TOKEN", "courtside-insights-read", "cost_views",
			"over an hour old", "exchange_rates", "Frankfurter", "$1.42", "costs-prices.ts", "by the days each ran", "three games with a video", "$200",
			"server_errors", "email_months", "clearing point"]) {
			expect(html, words).toContain(words);
		}
	});

	it("maps every table the migrations make in The data's diagram", async () => {
		const sql = readdirSync("migrations").map((f) => readFileSync(`migrations/${f}`, "utf8")).join("\n");
		const tables = new Set([...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)].map((m) => m[1]!.replace(/_new$/, "")).filter((t) => !t.endsWith("_backup")));
		const map = /<figure class="dg"><div class="dgscroll"><svg[^>]*aria-labelledby="dg-data-t[\s\S]*?<\/figure>/.exec(await page())?.[0] ?? "";
		const shown = new Set([...map.matchAll(/>(\w+)<\/text>/g)].map((m) => m[1]));
		expect([...tables].filter((t) => !shown.has(t))).toEqual([]);
	});

	it("sets up a computer by hand, step by step, then hands over to an AI coding agent with its instructions to copy", async () => {
		const html = await page();
		const setup = html.split('id="setup" aria-labelledby')[1]!.split('<section class="panel docsec"')[0]!;
		for (const words of ["cf auth login", "CF_PROFILE", "git worktree add ../courtside-staging staging",
			"courtside-prod</code></pre>",
			".secrets.production.json", "podman"]) expect(setup, words).toContain(words);
		const agent = html.split('id="agent" aria-labelledby')[1]!.split('<section class="panel docsec"')[0]!;
		expect(agent).toContain('<button class="btn primary" type="button" data-copy="agent-md">Copy the instructions</button>');
		expect(agent).toContain('<pre class="docs-cmd docs-agent" id="agent-md"><code># Working on Courtside: instructions for an AI coding agent');
		for (const words of ["AI coding agent", "AGENTS.md", "When something goes wrong", "courtside-staging"]) expect(agent, words).toContain(words);
		expect(html).toContain('<script type="module" src="/copy.js"></script>');
		const releases = html.split('id="releases" aria-labelledby')[1]!.split('<section class="panel docsec"')[0]!;
		for (const words of ["A change, start to finish", "git merge --ff-only staging", "Working in two folders", "The stash is shared too"]) {
			expect(releases, words).toContain(words);
		}
	});

	it("carries the fair use policy, with the code's own limits beside each line", async () => {
		const html = await page();
		expect(html).toContain('<h2 id="fairuse-h"><span class="docs-num">17.</span> Fair use</h2>');
		for (const words of ["One video a game, up to 30 GB", "50 clips a game, each 3 seconds to 5 minutes", "10 MB a photo", "Every download is logged with who took it", "a clip or a photo, each photo in a zip too",
			"10 an hour and 20 a day each", "20 questions a day; 5 tickets and 20 replies a day", "$200", "31 December of the year its season ends"]) {
			expect(html, words).toContain(words);
		}
	});

	it("walks through the 5-minute job and the 3am job step by step, with each step's limits and the checks' thresholds", async () => {
		const html = await page();
		expect(html).toContain("<h3>The 5-minute job</h3>");
		expect(html).toContain("<h3>The 3am job</h3>");
		for (const words of ["the quiet teams take turns, 12 a run", "Processing to ready", "Final scores", "one budget of 200 calls", "Under 400 minutes",
			"Six failed runs in a row", "No run for 26 hours", "backups/d1/courtside-&lt;date&gt;.sql", "no key table (teams, members, games, players) emptied",
			"At most 20 deletes a night", "80,000 warns, 95,000 is urgent", "4 GB of the 10 it can hold warns"]) {
			expect(html, words).toContain(words);
		}
	});

	it("opens with a new admin's guide, covers Artifacts and Workers Builds, and ends with a glossary", async () => {
		const html = await page();
		expect(html).toContain('<h2 id="start-h"><span class="docs-num">1.</span> Start here</h2>');
		for (const words of ["<h3>The admin area, page by page</h3>", "<h3>The routine</h3>", "<h3>The rules that matter</h3>", "<th scope=\"row\">Insights</th>", "<th scope=\"row\">Log</th>",
			"which view each signed-in device uses", "mobile against desktop"]) {
			expect(html, words).toContain(words);
		}
		expect(html).toContain('<h2 id="artifacts-h"><span class="docs-num">4.</span> Where the code lives</h2>');
		for (const words of ["courtside/courtside.git", "--scope read --ttl 600", "<code>npm ci &amp;&amp; npm run check</code>", "courtside-workers-builds", "<h3>If a computer is lost</h3>"]) {
			expect(html, words).toContain(words);
		}
		expect(html).toContain('<h2 id="glossary-h"><span class="docs-num">29.</span> Glossary</h2>');
		// The sections a new admin asked for: the tasks, privacy, costs and setting up a computer.
		for (const words of ["<th scope=\"row\">Onboard a team</th>", "<th scope=\"row\">Delete a team tonight</th>", "<h3>What the site can't do</h3>",
			"<th scope=\"row\">Images and Stream bundle</th>", "<h3>How Costs works it out</h3>", "--scope read --ttl 600", "git worktree add"]) {
			expect(html, words).toContain(words);
		}
		for (const word of ["Worker", "Binding", "D1", "Migration", "R2", "Stream", "Turnstile", "WAF", "Artifacts", "Workers Builds", "Preview", "Cron", "Tombstone", "Release"]) {
			expect(html, word).toContain(`<th scope="row">${word}</th>`);
		}
	});

	it("documents today's site, not its history: no past dates or design discussions", async () => {
		const html = await page();
		const text = html.slice(html.indexOf('<div class="docs">')).replace(/<[^>]+>/g, " ");
		expect(text).not.toMatch(/\b20\d\d\b/);
		for (const words of ["Sam's call", "Sam:", "turned down"]) expect(text, words).not.toContain(words);
	});
});
