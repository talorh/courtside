# 24. Setting up a computer

*Courtside Documentation › Changing it. [Contents](README.md).*

Reading the site's figures needs nothing but an admin's sign-in. Changing the site needs a computer (Linux or a Mac: the scripts use bash and podman) with the code, the tools and a Cloudflare login. These steps are done by hand, once, in this order; Working with an AI coding agent picks up from the end of them. A club setting the site up for the first time follows the repository's `INSTALL.md` instead, which ends here.

### 1. A seat in the Cloudflare account

The account's owner adds your email as a member of the club's Cloudflare account. Your Cloudflare login is then the key to everything else: the dashboard, the `cf` command line, and the deploys.

### 2. The tools

| Tool | Why | How |
| --- | --- | --- |
| Node 22 (.node-version has the exact release the site is tested with) | The Worker's tools, tests and scripts run on it | The system's own package: nodejs22 on Fedora, node@22 from Homebrew on a Mac. Where the system's Node is older, the official build from nodejs.org, checked against its published checksum and unpacked into ~/.local. Never a script piped into a shell |
| git | The code, its branches and the second folder | The system's own package |
| podman | The browser test suite runs Playwright in a container, and the release won't run without it | On Fedora, sudo dnf install podman; on a Mac, brew install podman, then podman machine init and podman machine start |
| The `cf` command line | Cloudflare's own CLI: staging deploys, the release's tokens, reading the account | `npm install -g cf` (with sudo where npm's global folder needs it). The project's own copy in node_modules is what the scripts run |

### 3. Log in to Cloudflare

Logging in opens the browser to sign in to Cloudflare and approve the command line; then check it answers with your email and the club's account. A computer that works with several Cloudflare accounts makes a named profile instead and tells the scripts about it with `CF_PROFILE`.

```
cf auth login
cf auth whoami
# Or, with several accounts on this computer:
cf auth create club && export CF_PROFILE=club
```

### 4. Get the code

Clone the club's own repository (its copy of Courtside, wherever it keeps it) into a folder named for the Worker with `-prod` on the end. The release pushes `main` to a second place, the Cloudflare Artifacts repository in the account (Where the code lives), with a token it makes for the moment: there's nothing to set up for that.

```
mkdir -p ~/git && cd ~/git
git clone <the club's repository> courtside-prod
```

### 5. The second folder: a git worktree

`courtside-prod` stays on `main`, what's live. The work happens in a second folder, `courtside-staging`, a worktree of the same repository: it shares every commit and branch, but has its own files on its own branch.

```
cd ~/git/courtside-prod
git branch staging main
git worktree add ../courtside-staging staging
git worktree list
```

### 6. The secrets files

The owner gives you `.secrets.production.json` and `.secrets.staging.json` (git ignores them; the install made them). They go in `courtside-prod`, readable by you alone, and are linked into `courtside-staging` so there's one copy of each. The release's quiet-site check and staging's setup read them; never print them or commit them.

```
cd ~/git/courtside-prod
chmod 600 .secrets.production.json .secrets.staging.json
ln -s ../courtside-prod/.secrets.production.json ../courtside-prod/.secrets.staging.json ../courtside-staging/
```

### 7. Install, and run the site locally

In each folder, `npm install`. In `courtside-staging`, `.dev.vars` from its example with a local signing key (the README has the one-line command that makes it), the local database's migrations, then the dev server, where you're signed in as the address `deploy.config.ts` names for development. The dev values are stand-ins, so real Stream and R2 don't work locally; staging is where those are tried.

```
cd ~/git/courtside-staging
npm install
cp .dev.vars.example .dev.vars
npm run dev:db && npm run dev:seed
npm run dev
```

Then `npm run check` in that folder: types, every unit test, the line limits and the rules. It passes on a fresh checkout, and it's the first thing an agent runs.
