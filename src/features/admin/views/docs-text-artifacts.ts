// The Documentation page's section on where the code lives and how it's built: Cloudflare Artifacts and Workers Builds.
import { html } from "../../../shared/html.ts";
import { code, type DocSection, table } from "./docs-blocks.ts";
import { worktreesDiagram } from "./docs-diagrams-git.ts";
import { codeFlowDiagram } from "./docs-diagrams-more.ts";

export const artifacts = (): DocSection => ({ id: "artifacts", title: "Where the code lives", body: html`
<p>The code the site deploys from is a git repository hosted by Cloudflare itself, on <b>Cloudflare Artifacts</b>, inside
the club's own account, guarded by the same login that runs the site. The project itself is published on GitHub, and
the club keeps its own copy wherever it likes; what reaches Artifacts is only ever ${code("main")}, pushed by the release.
<b>Workers Builds</b> watches that repository and turns a push to its main branch into a deploy.</p>
${codeFlowDiagram()}
${table(["What", "Where"], [
		["The repository", html`Namespace and repository both the Worker's name, ${code("courtside")}, default branch ${code("main")}`],
		["Its address", html`${code("https://<account id>.artifacts.cloudflare.net/git/courtside/courtside.git")}: the release pushes to it by address, with a token made for the moment`],
		["In the dashboard", "Compute, Artifacts: the repository and its branches; Workers & Pages, courtside, Deployments: each build and what it deployed"],
		["From the command line", html`${code("cf artifacts namespaces repos list --namespace courtside")}; ${code("cf builds list --worker <the Worker's tag>")} (the tag from ${code("cf workers scripts search --name courtside")}); ${code("cf builds logs <build id>")}`],
	])}
<h3>On a computer: one repository, two folders</h3>
${worktreesDiagram()}
<p>A computer that works on the site has one clone of the repository and two folders. ${code("courtside-prod")} is the clone
itself (it holds the ${code(".git")} folder) and stays on ${code("main")}, what's live, so it's always clear what the release
will push. ${code("courtside-staging")} is a git worktree of the same repository, where ${code("staging")} and every
${code("feature/")} and ${code("fix/")} branch are worked on. Both share one set of commits and branches, so nothing moves
between them by push or pull: ${code("main")} in ${code("courtside-prod")} is simply fast-forwarded to ${code("staging")} for a
release. Setting up a computer shows how to make them; Environments and releases how a change moves through them.</p>
${table(["Folder", "Branch", "Holds", "Used for"], [
		[code("courtside-prod"), code("main"), html`The repository (${code(".git")}), the secrets files, its own ${code("node_modules")}`, html`${code("npm run release")} and nothing else`],
		[code("courtside-staging"), html`${code("staging")}, or a ${code("feature/")} or ${code("fix/")} branch`, html`A worktree: its own files and ${code("node_modules")}, ${code(".dev.vars")}, links to the secrets files`, html`All the work: tests, ${code("npm run dev")}, ${code("npm run staging")}`],
	])}
<h3>Getting at the code</h3>
<p>Artifacts takes no passwords and no long-lived keys. Each fetch or push uses a token made for the moment: the release
makes a write token that lasts ten minutes and revokes it straight after, and a person fetching by hand makes a read
token the same way (${code("cf artifacts namespaces tokens create courtside --repo courtside --scope read --ttl 600")}). The
token reaches git through the environment, never on a command line or in a config file, so nothing is left on a computer
that could push later. Only ${code("main")} is ever pushed, and only by the release; it's never forced, so a commit on
Cloudflare that a computer doesn't have refuses the push.</p>
<h3>What Workers Builds does</h3>
${table(["Setting", "Value", "Why"], [
		["Watches", html`${code("main")} only; other branches build nothing`, "Staging is deployed from the computer; only production goes through Builds"],
		["Build command", code("npm ci && npm run check"), "The same checks the release ran, again on Cloudflare: types, every unit test, the line limits and the rules"],
		["Deploy command", code("npm run deploy:builds"), "Deploys with the newest changelog line as the deployment's message and the commit as its tag, so the dashboard and the Changelog page agree"],
		["Deploys with", html`The token ${code("courtside-workers-builds")}`, "A token that can deploy this Worker and nothing else; the Worker's secrets stay as they are, as a deploy sends none"],
		["Build caching", "Off", "Each build starts clean, so a stale cache can't make a build pass that shouldn't"],
		["Also deploys", html`${code("courtside-maintenance")} and ${code("courtside-join")}, each from its own trigger on ${code("main")}`, "Each builds only when its folder, its tests or the deploy step change, runs the same checks and deploys with the same message and tag; the maintenance page is deployed on or off as it is"],
	])}
<p>The release follows the build to its end and only calls the deploy done when the live deployment carries the
changelog line. A build that fails deploys nothing: the site stays as it was, the release says what failed, and the fix
goes through staging and the release again. If a build needs running again by hand,
${code("cf builds create <trigger id> --branch main")} does it; the trigger id is in the Cloudflare runbook. Builds can't run the browser tests, which need
phones and cameras, so the release runs them before it pushes.</p>
<h3>If a computer is lost</h3>
<p>What's live is never lost with it: the repository on Artifacts has every commit of ${code("main")}, and a new computer
clones it with a read token and carries on (Setting up a computer). Only ${code("main")} is pushed, so work not yet
released (on ${code("staging")} or a branch) is on that computer alone: release it, or at least merge it into
${code("staging")}, before a computer is retired.</p>`});
