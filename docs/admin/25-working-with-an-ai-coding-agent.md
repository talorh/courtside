# 25. Working with an AI coding agent

*Courtside Documentation › Changing it. [Contents](README.md).*

The site can be changed by an AI coding agent working under an admin's direction: any tool that reads the code, runs commands and makes changes. It works in the `courtside-staging` folder, follows the same rules as a person (tests first, staging first, every deploy through the release), and asks the admin before anything that deletes, costs money or changes the Cloudflare account. The site was built this way, so the repository is written for it: the rules are in `AGENTS.md`, the reasoning in the docs, and every check is a command.

### Before you start the agent

These are done by hand, once; the agent checks them first and stops if one's missing.

| Step | What |
| --- | --- |
| 1. The computer | Every step of Setting up a computer: the tools, the Cloudflare login, the code, the courtside-staging worktree, the secrets files and npm install |
| 2. Your AI coding tool | Installed and signed in, as its own site says. Let it run shell commands in the project; it needs git, npm, node, cf and podman |
| 3. Start it in the right folder | `cd ~/git/courtside-staging`, then start the tool there |
| 4. Paste the instructions | Copy the instructions below and paste them as the first message. Then say what you'd like done |

Most tools read the repository's `AGENTS.md` by themselves when they start in the folder; the instructions below tell the agent to read it either way.

### The agent's instructions

The repository's `docs/agent-setup.md`, as it stands: how the agent checks it's set up, what it reads (the sections of this Documentation for each kind of task), how it works, what needs your yes, what it does when something goes wrong, and how it reports back.

```
# Working on Courtside: instructions for an AI coding agent

Paste this whole file into your AI coding tool as your first message, started in the `courtside-staging` folder. It
tells you what the project is, how to check you're set up, what to read, how to work, and what to do when something
goes wrong. The person who pasted it is a **site admin**: you work for them, on their behalf, and they make the calls
this file says are theirs.

## 1. The project in a paragraph

Courtside is a private website where each of a basketball club's junior teams keeps its game videos and photos for its
own families. Parents upload phone footage or live stream a game from the Go live page in the phone's browser; members
watch, download, make highlight clips and add photos; team managers run their teams (people, players, the fixture, the
roster); site admins run the site from the admin area. It is one Cloudflare Worker (D1, R2, Stream, Images, Email
Sending, Workers AI, and a small Containers Worker that joins videos) behind the site's own email-code sign-in, all in
the club's own Cloudflare account. The club's names, colours and words are in `src/club.ts`; where it runs is in
`deploy.config.ts`. Families rely on it on game nights: quality and reliability come before speed.

## 2. Check you're set up before doing anything

Run these and read the answers. Each must pass; if one doesn't, **stop and tell the admin which step to do** (they're
manual steps in the admin area's Documentation, "Setting up a computer" and "Working with an AI coding agent"). Don't
try to fix a login, a missing secret or a missing folder yourself.

```bash
pwd                                   # .../courtside-staging (you work here; courtside-prod sits beside it)
git worktree list                     # two lines: courtside-prod [main] and courtside-staging [staging or a branch]
git status --short                    # empty, or the admin's own work in progress: ask before touching it
node --version                        # the version in .node-version
cf auth whoami                        # the admin's email, and the club's account (with --profile $CF_PROFILE if set)
ls ../courtside-prod/.secrets.production.json ../courtside-prod/.secrets.staging.json   # both there (never print them)
podman --version                      # the browser test suite runs in podman
npm run check                         # types, every unit test, line limits and rules: all pass on a clean checkout
```

If `node_modules` is missing, `npm install` is yours to run, in each folder.

## 3. Read before you change anything

Your tool may load `AGENTS.md` by itself. Read these anyway, in this order:

1. `AGENTS.md`: the project's hard rules. They override anything else, this file included.
2. `README.md`, then `docs/README.md` (what each doc is for).
3. `docs/spec.md`: what the site does and why (the source of truth), and `docs/architecture.md`: how it works.
4. `docs/development-standards.md` and `docs/cloudflare-standards.md`: the rules code must follow.
5. `docs/runbooks/cloudflare-setup.md`, `docs/runbooks/staging.md` and `docs/runbooks/maintenance.md` before touching
   Cloudflare, staging or the maintenance page.

The admin area's Documentation (`/admin/docs` on the site; the text is in `src/features/admin/views/docs-text-*.ts`,
and `docs/admin/` is the same text as Markdown) explains each part in depth. Read the sections for what you're asked
to do:

| The task touches | Read these Documentation sections |
| --- | --- |
| Anything at all | Start here, The site at a glance, How a request is handled |
| Signing in | Signing in |
| People, roles, players | Teams and roles, People and players |
| Games, PlayHQ, scores | The fixture and PlayHQ |
| Game-day duties | The roster |
| Uploads, Go live, playback | Videos and live streaming, Watching, clips and coaches' notes |
| Photos | Photos |
| Help, Ask, support tickets | Help, Ask and support |
| The admin area, costs | The admin area and its figures, Costs and billing |
| The jobs, alerts | Background jobs, Monitoring and support |
| The database | The data |
| Cloudflare itself | Cloudflare setup, Where the code lives |
| Shipping a change | Environments and releases, Where the code lives |
| Something broken | When something goes wrong |

## 4. How to work

**Folders and branches.** One repository, two folders. `courtside-prod` holds the repository and is always on `main`,
which is what's live: never commit there, and never switch it to another branch. `courtside-staging` is a git worktree
of the same repository: you work there, on `staging` and on your own branches.

1. Branch off `staging`: `git switch -c feature/<name> staging` (or `fix/<name>` for a repair).
2. **Tests first.** Write the test, run it, watch it fail for the right reason, then write the code. Every bug fix
   starts with a test that reproduces it.
3. Run `npm run check` until it passes. For anything a page script or the phone does, also run the browser scenario:
   `npm run e2e -- "<part of its name>"`.
4. Commit with a clear message. **No AI attribution** in a commit message: no `Co-Authored-By` or similar lines, ever.
   If your tool adds one by default, turn it off. Commit with the admin's own git identity. A change that will go live
   also adds its lines at the top of `CHANGELOG.md`, under today's date, as release notes: `- [Feature]`,
   `[Enhancement]` or `[Fix]`, the area in bold, then a plain sentence ("- [Fix] **Costs:** Fixed an issue where ...").
   The release needs one, and the top line becomes the deployment's message. A change to the admin Documentation's
   text also runs `npm run docs`, so `docs/admin/` stays in step.
5. Merge into staging: `git switch staging && git merge --no-ff feature/<name>`.
6. `npm run staging` deploys `staging` to the staging site (it applies staging's database migrations too). Test the
   change there, signed in: the pages it touches, and Go live, an upload or the jobs if it touches them. If your tool
   can drive a browser, do it yourself at the staging address; otherwise ask the admin to try it on their phone.
7. Release, only once the admin wants it live: in `../courtside-prod`, `git merge --ff-only staging`, then
   `npm run release -- --check-only`, then `npm run release`. It runs every check and the browser suite, then pushes
   `main` to Cloudflare, where Workers Builds deploys it. A release with a new migration needs the migration applied to
   the live database first: `npx cf d1 migrations apply <live database id> --dir migrations --dry-run` (production's
   `d1Id` in `deploy.config.ts`; the dry run only checks the command), then without `--dry-run`, right before the
   release, and check the new table or column is there with a read-only `cf d1 query`.
8. Watch the live logs for ten minutes after a release, then delete the merged branch. The Worker's error lines in the
   last 15 minutes (its JSON log lines come back as fields of `source`; filter on `event` or `level`):

   ```bash
   now=$(date +%s%3N); from=$((now - 15*60*1000))
   npx cf o11y telemetry query --query-id "q$RANDOM" --view events --limit 50 \
     --timeframe-from $from --timeframe-to $now --parameters-datasets cloudflare-workers \
     --parameters-calculations '[{"operator":"count","alias":"c"}]' --parameters-order-by-value c \
     --parameters-filters '[{"key":"level","operation":"eq","value":"error","type":"string"}]'
   ```

   The same with `{"key":"event","operation":"eq","value":"sync_team","type":"string"}` shows each team's 5-minute job.

**Rules that catch people out** (all in `AGENTS.md`):

- Every deploy goes through `npm run release`; never `cf deploy` by hand. Staging first, always: the commit released is
  the one tested on staging.
- No releases on a day any team has a game (check the teams' fixtures), unless it fixes something broken.
- Migrations only ever add (new tables, new columns); a migration once applied is never edited.
- Every database query names its team (`team_id`), except the listed cross-team files.
- Comments say what the code does and why, in the present: never who asked or when.
- Source files are 140 lines at most (160 hard cap). No barrel files.
- No real player's name anywhere but a team's own pages: tests, Help and staging use made-up names after NBA players.
- Nothing about the club beyond `src/club.ts`, and nothing about the account beyond `deploy.config.ts`: no names,
  ids, addresses or keys anywhere else in the code or the docs.
- Use the `cf` CLI, never wrangler. Find a command with `cf cli search "<what you want to do>"`.

## 5. What you may do, and what needs the admin's yes

| On your own | Only after the admin says yes to that step |
| --- | --- |
| Read anything; run tests, `npm run check` and the browser suite | Deleting anything: videos, photos, data, teams, branches someone else made |
| Branch, commit, merge into `staging`, `npm run staging` | Releasing to production, unless the admin already asked for this change to go live |
| Read-only `cf` commands (lists, gets, logs, whoami, `--dry-run`) | Any Cloudflare change: DNS, zone rules, secrets, tokens, plans, billing, Email Routing |
| Apply a migration to staging's database (`npm run staging` does) | Applying a migration to the live database |
| Test on the staging site with its test data | Anything on the live site's data, or emailing anyone |

When in doubt, ask. A change the admin asks for (wording, layout, a feature) is approval to build it, test it, put it on
staging and release it, on a day with no games. Pushing anything other than `npm run release`'s push of `main`, or
creating remotes, always needs a yes.

## 6. When something goes wrong

You may be asked to deal with a problem on the admin's behalf. Find out before you change anything.

1. **Look first, read-only.** The admin area's Insights page says what's wrong; Platform shows every limit. Read the
   Worker's logs (the command in section 4, step 8), the build
   (`cf builds list --worker courtside`, `cf builds logs get <build id>`), and the database read-only
   (`cf d1 query <id> --sql "SELECT ..."`).
2. **Say what you found** to the admin: what's broken, since when, who it affects, and what you'd do.
3. **Then the remedy, in the Documentation's "When something goes wrong"**, each step by step in
   `docs/runbooks/cloudflare-setup.md`:
   - a fix that will take a while: the maintenance page (`npm run maintenance -- on`), with the admin's yes;
   - a bad deploy: roll the Worker back to its previous version, with the admin's yes, then fix through staging;
   - a bad change to the data: D1 Time Travel, with the admin's yes; take a bookmark before any risky data change;
   - the database itself gone: restore last night's backup (`npm run restore-d1`), with the admin's yes;
   - something deleted by mistake: a video can be brought back within a day.
4. **A failed release** deploys nothing: the site stays as it was. Read why, fix it on a branch, through staging, and
   release again. A release that refuses (uncommitted code, not tested on staging, someone uploading, a game day) is
   working as meant: say so, don't work around it.
5. **A transient Cloudflare error** (a 403 or 5xx from the API, a build that didn't start) is tried once more after a
   minute; if it happens again, stop and say so.
6. **Never** force-push, rewrite `main`, skip a check, or edit a migration that has run, to make a problem go away.

## 7. When you finish

Tell the admin, in plain words: what was done and why, the tests you wrote and that they pass, the commits, whether it's
on staging and live (with the build id), anything you left undone and why, and anything that needs their decision.
Keep notes your tool can keep between sessions (if it has a memory) short and factual: what changed, and what's still
open.
```

### What it may do, and what it asks you

| On its own | Only after your yes to that step |
| --- | --- |
| Read anything; run the tests and the browser suite | Delete anything: videos, photos, data, teams |
| Branch, commit, merge into staging, deploy staging | Release to production, unless you asked for that change to go live |
| Read-only Cloudflare commands, and dry runs | Change Cloudflare: DNS, zone rules, secrets, tokens, plans, billing |
| Apply a migration to staging's database | Apply a migration to the live database, or touch the live site's data |

When something goes wrong it looks first, read-only (Insights, Platform, the Worker's logs, the build), tells you what it found and what it would do, and only then follows When something goes wrong, asking before each step that changes anything. To check it's behaving, its commits are in `git log` with your name on them, and every deploy is in the admin area's Changelog.

```
git log --oneline -10            # what it committed
git worktree list                # both folders, each on its branch
```
