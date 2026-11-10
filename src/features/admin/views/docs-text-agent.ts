// The Documentation page's section on working with an AI coding agent: the steps done by hand first, the agent's own
// instructions (docs/agent-setup.md, shown here as it is in the repository through the generated agent-setup-text.ts,
// with a Copy button: public/copy.js), and
// what it may do alone.
import { html } from "../../../shared/html.ts";
import { AGENT_SETUP } from "./agent-setup-text.ts";
import { cmd, code, type DocSection, table } from "./docs-blocks.ts";

export const agent = (): DocSection => ({ id: "agent", title: "Working with an AI coding agent", body: html`
<p>The site can be changed by an AI coding agent working under an admin's direction: any tool that reads the code, runs
commands and makes changes. It works in the ${code("courtside-staging")} folder, follows the same rules as a person
(tests first, staging first, every deploy through the release), and asks the admin before anything that deletes, costs
money or changes the Cloudflare account. The site was built this way, so the repository is written for it: the rules
are in ${code("AGENTS.md")}, the reasoning in the docs, and every check is a command.</p>
<h3>Before you start the agent</h3>
<p>These are done by hand, once; the agent checks them first and stops if one's missing.</p>
${table(["Step", "What"], [
		["1. The computer", "Every step of Setting up a computer: the tools, the Cloudflare login, the code, the courtside-staging worktree, the secrets files and npm install"],
		["2. Your AI coding tool", "Installed and signed in, as its own site says. Let it run shell commands in the project; it needs git, npm, node, cf and podman"],
		["3. Start it in the right folder", html`${code("cd ~/git/courtside-staging")}, then start the tool there`],
		["4. Paste the instructions", "Copy the instructions below and paste them as the first message. Then say what you'd like done"],
	])}
<p>Most tools read the repository's ${code("AGENTS.md")} by themselves when they start in the folder; the instructions
below tell the agent to read it either way.</p>
<h3>The agent's instructions</h3>
<p>The repository's ${code("docs/agent-setup.md")}, as it stands: how the agent checks it's set up, what it reads (the
sections of this Documentation for each kind of task), how it works, what needs your yes, what it does when something
goes wrong, and how it reports back.</p>
<div class="docs-copy"><button class="btn primary" type="button" data-copy="agent-md">Copy the instructions</button><span class="small">Then paste them into your AI coding tool.</span></div>
<pre class="docs-cmd docs-agent" id="agent-md"><code>${AGENT_SETUP}</code></pre>
<h3>What it may do, and what it asks you</h3>
${table(["On its own", "Only after your yes to that step"], [
		["Read anything; run the tests and the browser suite", "Delete anything: videos, photos, data, teams"],
		["Branch, commit, merge into staging, deploy staging", "Release to production, unless you asked for that change to go live"],
		["Read-only Cloudflare commands, and dry runs", "Change Cloudflare: DNS, zone rules, secrets, tokens, plans, billing"],
		["Apply a migration to staging's database", "Apply a migration to the live database, or touch the live site's data"],
	])}
<p>When something goes wrong it looks first, read-only (Insights, Platform, the Worker's logs, the build), tells you
what it found and what it would do, and only then follows When something goes wrong, asking before each step that
changes anything. To check it's behaving, its commits are in ${code("git log")} with your name on them, and every deploy
is in the admin area's Changelog.</p>
${cmd("git log --oneline -10            # what it committed\ngit worktree list                # both folders, each on its branch")}`});
