import { CLUB } from "../../../club.ts";
// The Documentation page's section on the two environments and how a change reaches each: the branches, a change from
// start to finish, the two folders, releases and builds.
import { html } from "../../../shared/html.ts";
import { cmd, code, type DocSection, table } from "./docs-blocks.ts";
import { branchesDiagram, environmentsDiagram, releaseDiagram } from "./docs-diagrams-ops.ts";

export const releases = (): DocSection => ({ id: "releases", title: "Environments and releases", body: html`
<p>There are two environments, running the same code. Every change is tried on staging before it goes live.</p>
${table(["", "Production", "Staging"], [
		["Address", `${CLUB.domain}`, "staging-courtside.<subdomain>.workers.dev"],
		["What it is", "The courtside Worker", "A preview of the same Worker, with an orange strip on every page"],
		["Database", html`D1 ${code("courtside")}`, html`D1 ${code("courtside-staging")}, test data only`],
		["Bucket", html`R2 ${code("courtside-originals")}`, html`R2 ${code("courtside-staging")}, emptied after 7 days`],
		["Stream, Images, AI, email", "The account's", "Shared, with staging's things labelled and swept within a week; its emails go only to admins"],
		["Jobs", "Every 5 minutes, and 3am", "The 5-minute job, run by hand from Platform; the 3am job never runs"],
	])}
<h3>Environments</h3>
<p>Staging is the same Worker deployed as a Worker Preview of ${code("courtside")}, told it's staging at build time, so
it uses its own database, bucket, Turnstile widget and keys, and labels anything it puts in the shared Stream and Images.
The two are deployed differently: staging straight from the computer in a minute, production only through the release.</p>
${table(["", "Staging deploy", "Production deploy"], [
		["Command", code("npm run staging"), code("npm run release")],
		["From", html`The ${code("staging")} branch, committed`, html`${code("main")}, fast-forwarded to ${code("staging")}`],
		["Checked first", html`${code("npm run check")}: types, unit tests, line limits`, "Everything in Releases below, the browser tests included"],
		["Migrations", html`Applied to staging's database by the command itself`, "Must already be on the live database; the release refuses otherwise"],
		["How it's deployed", html`${code("cf previews deploy staging")} from the computer, then the commit is recorded as ${code("refs/courtside/staging")}`, "Pushed to Cloudflare Artifacts; Workers Builds checks it again and deploys it"],
		["Keys", html`Staging's own, set once with ${code("npm run staging -- setup")} and kept on the preview`, "The Worker's own secrets, untouched by a deploy"],
		["Changelog", "Not needed", "The deploy's line at the top, which becomes the deployment's message"],
		["When", "Any time, as often as needed", "Not on a day a team plays, unless it fixes something broken; never while anyone is uploading or streaming"],
		["Who sees it", "Admins and the test accounts, signed in", "Every team"],
	])}
${environmentsDiagram()}
${releaseDiagram()}
<h3>Branches</h3>
<p>One repository, two working folders: one for ${code("staging")} and the branches, one for ${code("main")}. A change
is built on its own branch, ${code("feature/<name>")} or ${code("fix/<name>")}, off ${code("staging")}, its tests
written first. When it's ready it's merged into ${code("staging")}, the staging environment's branch, and
${code("npm run staging")} puts that branch on the staging site: it checks the code, applies staging's migrations,
deploys the preview and records the commit it deployed as ${code("refs/courtside/staging")}. ${code("main")} is production.
Nothing is committed on it directly: it's only ever fast-forwarded to ${code("staging")} for a release, so what goes
live is exactly what was tried. A merged branch is deleted.</p>
${branchesDiagram()}
<h3>A change, start to finish</h3>
<p>Every change takes the same path, in the ${code("courtside-staging")} folder until the release. A branch's name says what
it is: ${code("feature/<name>")} for something new, ${code("fix/<name>")} for a repair.</p>
${cmd(`cd ~/git/personal/courtside-staging
git switch -c feature/<name> staging     # a branch off staging
# the test first, watched failing; then the code
npm run check                            # types, every unit test, the line and rule checks
npm run e2e -- "<scenario>"              # a page script or the phone: its browser scenario
git commit -am "What changed, in plain words"   # with its CHANGELOG.md line at the top, if it'll go live
git switch staging && git merge --no-ff feature/<name>
npm run staging                          # staging's migrations, then the preview, then refs/courtside/staging
# try it on the staging site, signed in, on a phone
cd ../courtside-prod
git merge --ff-only staging              # main becomes exactly what was tried
npm run release -- --check-only          # every check and a dry run, nothing pushed
npm run release                          # the browser suite, then main to Artifacts, then Workers Builds
cd ../courtside-staging && git branch -d feature/<name>`)}
<p>A release with a new migration needs it on the live database first, right before:
${code("npx cf d1 migrations apply <live database id> --dir migrations --dry-run")}, then the same without
${code("--dry-run")}. Migrations only ever add, and one that has run is never edited.</p>
<h3>Working in two folders</h3>
<ul class="docs-points">
<li><b>One repository.</b> ${code("courtside-prod")} holds it (its ${code(".git")} folder); ${code("courtside-staging")} is a
worktree of it, made with ${code("git worktree add")}. Commits, branches and ${code("refs/courtside/staging")} are shared, so a
branch merged in one folder is there in the other at once, with nothing to push or pull between them.</li>
<li><b>Each folder has its own files:</b> its own branch checked out, ${code("node_modules")}, ${code(".dev.vars")} and
local database. The secrets files live in ${code("courtside-prod")} and are linked into ${code("courtside-staging")}.</li>
<li><b>${code("courtside-prod")} stays on ${code("main")}</b> and is never committed on: it's only fast-forwarded. Git won't
check one branch out in both folders, which keeps ${code("main")} out of the working folder.</li>
<li><b>The stash is shared too</b>, so set work aside with a commit on its branch rather than ${code("git stash")}.</li>
<li><b>Only ${code("main")} leaves the computer</b>, pushed by the release. Work not yet released lives only here, so
it's released, or at least merged into ${code("staging")}, before a computer is retired.</li></ul>
<h3>Releases</h3>
<p>${code("npm run release")} runs every check in turn and stops at the first that fails: the code is committed on
${code("main")}, staging ran this commit (or one that differs only in docs, tests or notes), the type checks and unit
tests pass, the browser tests pass on Android, iPhone and Firefox, every migration is on every database, nobody has
uploaded or streamed on the live site for 15 minutes, the changelog's newest line isn't what the site already runs,
and a dry-run deploy works. No release lands on a day a team plays unless it fixes something broken.</p>
<h3>Builds</h3>
<p>Nothing is built on a computer and uploaded. The release pushes ${code("main")} to the site's own repository on
Cloudflare Artifacts, ${code("courtside/courtside")}, with a write token that lasts ten minutes. Workers Builds watches that
repository's main branch only: for each push it runs ${code("npm ci && npm run check")} on Cloudflare, then
${code("npm run deploy:builds")}, which deploys with the newest changelog line as the deployment's message and the
commit as its tag, so the Cloudflare dashboard and the admin area's Changelog say the same thing. The release follows
the build to the end and won't call it done unless the live deployment carries that line. Builds can't run the browser
tests (they need phones and cameras), which is why the release runs them before it pushes. A deploy sends no secrets:
they stay on the Worker. Staging is deployed from the computer by ${code("npm run staging")}, not by Builds.</p>`});
