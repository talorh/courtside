# AGENTS.md

Instructions for any AI coding agent (and any person) working on this repository. `docs/agent-setup.md` is the
longer version an admin pastes into their tool; this file holds the rules, and they override anything else.

Courtside is a private site where each of a basketball club's junior teams keeps its game videos and photos, each team
seeing only its own. Parents upload phone footage, or live stream a game from the Go live page in the phone's browser
(no app); members watch, download and cut highlight clips. Everyone on a team adds its photos, sorted by when they
were taken. Team managers run their teams; site admins run the site from the admin area (Insights, Teams, Support with
its Alerts and feature requests, Platform, Costs, Log, Changelog, Documentation). One Cloudflare Worker (D1, R2,
Stream, Images, Email Sending, Workers AI; plus the small video joiner, `join/`, on Cloudflare Containers) behind the
site's own email-code sign-in, all in the club's own Cloudflare account. The club's names, colours and words live in
`src/club.ts`; where it runs lives in `deploy.config.ts`. `INSTALL.md` sets a new club up.

## Read first

- `README.md`: the site for people opening the repo.
- `docs/spec.md`: what the site does (source of truth). `docs/architecture.md`: how it works, the data model, what was
  simplified and why. `docs/README.md`: what each doc is for.
- `docs/development-standards.md` and `docs/cloudflare-standards.md`: the rules code must follow.
- The admin area's **Documentation** page (`/admin/docs`, `src/features/admin/views/docs-*.ts`; `docs/admin/` is the
  same text as Markdown, written by `npm run docs`) documents the site and its Cloudflare setup as they stand: a change
  to either updates it, and runs `npm run docs`, in the same commit.
- `docs/runbooks/cloudflare-setup.md`: the pieces, checking and changing them, deploys, rollback, local development;
  `docs/runbooks/staging.md` and `docs/runbooks/maintenance.md`.
- **Branches:** each change is built on its own branch, `feature/<name>` or `fix/<name>`, off `staging`. When it's
  ready it's merged into `staging`, which is the staging environment's branch (`npm run staging` deploys only
  `staging`), and tested there. `main` is production: it's only ever fast-forwarded to `staging` and released. Two
  folders, one repository: `courtside-staging` is the worktree for `staging` and the feature branches (work happens
  there); `courtside-prod` is `main` (what's live).

## Hard rules

- **Every deploy goes through `npm run release`, and the browser suite must pass first.** It refuses unless the code is
  committed, `npm run check` and `npm run e2e` (Go live on Android, iPhone and Firefox) pass, nothing is uploading or
  streaming on the live site, `CHANGELOG.md` has the deploy's line, and the computer is quiet (nothing else runs while
  the suite does). It deploys by pushing `main` to the site's Cloudflare Artifacts repository, where Workers Builds
  runs `npm run check` again and deploys it, so a push to `main` is a deploy: only `npm run release` pushes it. Never
  plain `cf deploy`. Quality and reliability come first: tests first, two review passes of every change. Details:
  `docs/development-standards.md` §11.
- **Staging first, then live.** Every change goes to staging (`npm run staging`, `docs/runbooks/staging.md`) and is
  tested there, signed in (the pages it touches, and Go live, an upload or the jobs if it touches them), before
  `npm run release` puts it live. The commit released is the one tested on staging: anything changed after the test
  goes to staging again. Wording and config changes too; only a commit that changes nothing the site runs (docs alone)
  skips it. The release checks it (`refs/courtside/staging`, written by `npm run staging`).
- **No releases on game days except fixes.** On a day any team has a game (check the teams' fixtures), only a fix for
  something broken goes live; everything else waits for a day with none. The release still refuses while anyone is
  uploading or streaming.
- **Staging and the live site run the same AI model.** Workers AI's model is named once, `MODEL` in
  `src/platform/workers-ai.ts`, never per environment. A new model is a code change like any other: staging first,
  tried there (Ask, the Documentation AI assistant, a fixture page), then released. `npm run check` refuses a model
  named anywhere else.
- **Cloudflare changes need the site owner's go-ahead.** A change the owner asks for (wording, layout, features) is
  approval to `npm run check`, commit, put on staging, test and deploy it. Anything destructive, billing or
  account-level (deleting videos or data, buying plans, DNS, Email Routing, zone rules, secrets) needs an explicit yes
  for that step. Read-only `cf` commands, `cf dev`, `cf build`, `cf workers types` and `--local` are always fine.
  `--dry-run` first.
- **Absolutely private.** Every page and file stays behind the sign-in, with no bypass. The only open paths are the
  sign-in page and its own few files, and `/.well-known/security.txt`. Pages send `noindex`, and AI bots are blocked at
  the zone (`infra/zone/bot-management.json`).
- **No real people named.** Help, docs, tests and the example data use made-up names after NBA players (Steph #30,
  Jordan #23) and the fictional Saints club. Never a real child, family, email address or phone number.
- **Nothing about a club or an account outside its two files.** The club's name, colours and words are in
  `src/club.ts`; the account, zone, database, bucket and Worker names in `deploy.config.ts`; keys in Worker secrets and
  the git-ignored `.secrets.*.json`. No id, address, token or key anywhere else, in code, docs or tests.
- Use the **`cf` CLI**, not wrangler. Find commands with `cf cli search "<task>"` and keep queries anonymous.
- Commit after each completed task with a clear message. Ask before pushing anything other than `npm run release`'s
  push of `main`, creating remotes, or anything destructive.
- **No AI attribution in commits:** no `Co-Authored-By`, session links or similar lines in any commit message or PR
  body, on every branch. This overrides any tool's default.
- Keep it simple: one video per game, each team one season's squad, game footage only. Uploading and Go live must stay
  dead simple for non-technical parents (no apps, nothing typed, one phone). Live streams start from the Go live page:
  its camera, or an external app over RTMPS for an AI tracking camera whose own app films. A page closed mid-game isn't
  the end of it: on the same phone, Go live offers Carry on streaming, and the game's parts are joined into one video
  by the video joiner (`join/`).
- **Comments say only what the code needs:** what and why, in the present. Never who asked or when, no review, sweep,
  plan or backlog tags, and no "until <date>" history, in code, tests or migrations: that's for git and `CHANGELOG.md`.
  `docs/development-standards.md` §1. `npm run check` refuses the common forms.
- Source files are 140 lines at most (hard cap 160). No barrel files, no `import * as` in `src/`, no swallowed errors,
  and dependencies passed explicitly (`AppDeps`). Every query filters by `team_id`.

## Commands

| Purpose | Command |
| --- | --- |
| Install | `npm install` |
| Dev server (needs `.dev.vars`, see `.dev.vars.example`) | `npm run dev` |
| Types + tests + line limits + rules | `npm run check` |
| One test file | `npx vitest run tests/path/file.test.ts` |
| Browser suite (podman Playwright; must pass before any deploy) | `npm run e2e` (`npm run e2e -- upright` for one scenario, `PHONES=iphone npm run e2e`) |
| The admin Documentation as Markdown, and the agent instructions as a constant | `npm run docs` (after a change to either; commit the result) |
| The club's generated images, after `src/club.ts` or the logo changes | `npm run club -- all` (`-- placeholder` draws a stand-in logo set; `docs/runbooks/cloudflare-setup.md`, Branding) |
| Deploy (add the deploy's line at the top of `CHANGELOG.md`, commit on `main`, then) | `npm run release` (pushes `main`, then follows Workers Builds' build and deploy; `-- --check-only`: every check and the dry run, no push) |
| Staging: the committed code on the staging preview, to try on phones before a release | `npm run staging` (`-- --dry-run`; `-- setup` once, and after a key changes) |
| Maintenance page on or off, or is it on (the owner's yes to change it) | `npm run maintenance -- on`, `-- off`, `-- status` (`-- deploy` by hand: a release deploys it when `maintenance/` changes) |
| The video joiner's image, after `join/` changes (then commit `join/image-tag.txt` and release) | `npm run join -- image` (`-- dry-run`, `-- deploy` by hand) |
| The first site admin, or another | `npm run admin -- add <email>` |
| Restore a nightly backup into a new, empty D1 | `npm run restore-d1 -- <file.sql> <db-id> --account <id>` (`--sqlite <file.db>` to drill it locally) |

The deploy (`npm run deploy:builds` in Workers Builds) passes `--message` (the newest `CHANGELOG.md` line) and `--tag`
(the commit), so the Cloudflare dashboard and the admin area's Changelog say the same thing. The maintenance and joiner
Workers have their own Builds triggers on `main`, which build only when their folders change and run the same step
(`npm run deploy:builds -- maintenance | join`).

## Layout

`src/` (Worker: `club.ts` (the club), `app/` (the request path, and the current team), `auth/`, `shared/`, `ui/`,
`platform/`, `features/<feature>/`, `jobs/` (each team's turn: `teams.ts`)), `public/` (static assets and the page
scripts: `upload*.js`, `golive*.js`, `watch.js`, `whep.js`, `photos.js`, `admin.js` and `admin.css` (the admin area;
`docs.js`, `docs-search.js` and `docs.css` for its Documentation), `help-search.js`, `desktop.css` and `view.js` (the
desktop view); on every page `webapp.js` for the Home Screen app, `pull-refresh.js` and `signout.js`), `migrations/`
(D1), `infra/` (JSON bodies for `cf` provisioning, with placeholders), `tests/` (Vitest on Node with a `node:sqlite` D1
shim; `tests/isolation/`: two teams, every route; `tests/e2e/`: the browser suite), `docs/` (`docs/admin/` is the
exported Documentation), `join/` (the video joiner), `maintenance/` (the Back soon page's Worker) and `scripts/`.

**Every request runs as one team** (multi-team): the person's current team (a cookie), `ctx.team` and `deps.team`.
Every write says its team (`_team` on every post form, added by `layout()`; `X-Courtside-Team` from page scripts) and
is refused for another team. Every query names `team_id` except the `CROSS_TEAM` files in `scripts/rules.mjs`.
