# Installing Courtside for your club

This guide is written for an AI coding agent to follow with you. You answer its questions and say yes to each step
that changes your Cloudflare account; it does the rest. It takes an afternoon. If you'd rather do it by hand, the same
steps are here in order, and `docs/runbooks/cloudflare-setup.md` has each command.

When it's done, the whole site runs on Cloudflare and nothing else: the Worker, its database, storage, video, images,
AI and email, the code itself in Cloudflare Artifacts, and the deploys through Workers Builds. GitHub is only where
Courtside is published; your club's copy of the code lives in your own Cloudflare account.

## 1. What you need first

- **A Cloudflare account** on the Workers Paid plan (US$5 a month) with the Images and Stream bundle (US$5 a month),
  billing set up. You'll be the account's owner; add anyone else who'll run the site as a member.
- **A domain**: one you'll register through Cloudflare Registrar (the agent can do it), or one already on Cloudflare
  as a zone in this account, or one elsewhere whose nameservers you can point at Cloudflare.
- **A computer**, Linux or a Mac, that you'll set up in section 2.
- **Your club's logo** as a square PNG on white (any size from 512 px up) and, if you have one, the mark alone on a
  transparent background. The agent makes every size the site needs from them. No logo yet is fine: a stand-in is drawn
  in your colours.
- **An AI coding agent**: any tool that reads files and runs commands in a folder. Section 3 is how to start it.

## 2. Getting the computer ready

Run these yourself, once. The agent checks them before it starts and stops if one is missing, so it's quicker to do
them first.

```bash
# Node 22 (.node-version has the exact release the site is tested with), from your system's own packages
sudo dnf install -y nodejs22                                       # Fedora
# brew install node@22 && brew link --overwrite node@22            # a Mac
# Debian and Ubuntu package an older Node. Take the official build from nodejs.org instead: download the
# Linux tar.xz for your machine from https://nodejs.org/en/download, check it against the SHASUMS256.txt
# published beside it, unpack it into ~/.local and put ~/.local/bin on your PATH. Nothing is piped into a shell.
node --version

# git, podman (the browser tests run Playwright in a container), Python with Pillow and ImageMagick (the club's images)
sudo dnf install -y git podman python3-pillow ImageMagick          # Fedora
# sudo apt install -y git podman python3-pil imagemagick            # Debian or Ubuntu
# brew install git podman python pillow imagemagick && podman machine init && podman machine start   # a Mac

# Cloudflare's command line, and your login (it opens the browser; approve the command line there)
npm install -g cf
cf auth login
cf auth whoami                 # your email, and your club's account
cf cli search "list zones"     # how to find any cf command: describe the task, never a name or an id
```

If the computer already has a Cloudflare login for another account, make a named one for the club and tell the
scripts about it: `cf auth create club` and `export CF_PROFILE=club` (put it in your shell's profile).

Then the code. Clone Courtside from GitHub into a folder called `courtside-prod`, and make the second folder the
scripts expect, a git worktree called `courtside-staging` for the work:

```bash
mkdir -p ~/git && cd ~/git
git clone <this repository's address, from the Code button on GitHub> courtside-prod
cd courtside-prod && npm install
git branch staging main && git worktree add ../courtside-staging staging
cd ../courtside-staging && npm install && npm run check      # types, every test, the line limits and the rules: all green
```

## 3. Starting the agent

Open your AI coding tool in the `courtside-staging` folder. Most tools read the repository's `AGENTS.md` by themselves
when they start there; it holds the rules the agent follows (tests first, dry runs first, your yes before anything
that changes your account, nothing about your club or your account outside two files). Then paste this as your first
message:

> Set up Courtside for my club. Follow INSTALL.md in this repository step by step: read AGENTS.md and
> docs/agent-setup.md first, check the computer is ready (section 2), ask me everything in section 4 before you change
> anything, then do each step in section 5 in order. Show me every `cf` command as a dry run and wait for my yes before
> anything that changes my Cloudflare account. Never print a secret or a token. When you're done, go through section 6
> with me.

The agent may ask you to do a few things only you can: approve a login in the browser, pay for the domain, or add a
card. Everything else it does itself, telling you what it's about to run.

After the install, the same agent is how the site is looked after: `docs/agent-setup.md` is the longer brief for it,
and the admin area's Documentation has a section, Working with an AI coding agent, that an admin can copy from.

## 4. What the agent asks you

Everything about the club goes in one file, `src/club.ts`, and everything about where it runs in `deploy.config.ts`.
The agent fills both from your answers:

| It asks | Goes in | Example |
| --- | --- | --- |
| The site's name, as the top bar and the Home Screen icon say it | `siteName` | Courtside, or your own |
| The club's name, as its teams are named on Home | `name` | Saints |
| The short name, for the top bar and the singlet: a plural nickname works best | `nickname` | Saints |
| How fixtures (PlayHQ, club sites) name your teams | `fixtureName` | Saints |
| Your home stadium | `homeVenue` | Saints Stadium |
| Local rival clubs, as fixtures name them | `rivals` | Westside, Bayside |
| The league your teams play in | `league` | VJBL |
| Your uniforms, home first: two or more, or one for a reversible singlet (the match day message says which to wear and which to pack) | `uniforms` | Navy, White |
| A cheer to sign off the welcome email | `cheer` | Go Saints! |
| Your time zone, and the two UTC hours that are 3am there across the year | `timeZone`, `dailyJobUtcHours` | Australia/Melbourne; 16 and 17 |
| The month your season starts | `seasonStartMonth` | 10 |
| The English you write | `english` | Australian |
| Your currency, for the Costs page | `currency` | AUD, Australian dollars, 1.42 to the US dollar |
| Four colours: the deep bar colour, the button colour, its darker ink, its pale tint; and a dark-mode set | `colors` | The example file shows the shape |
| Where your state body's child safety standards are | `childSafety` | A name and a link |
| Your domain | `domain` | saints.example |
| Your logo files, or "draw one" | `public/` | logo.png and club-mark.webp |
| Your email, for the first site admin and the account's alerts | `npm run admin`, Cloudflare notifications | you@yourclub.org |
| The region nearest your club | `deploy.config.ts` `region` | aws:ap-southeast-2 |
| A name for the Worker, if not `courtside` | `deploy.config.ts` `worker` | courtside |

## 5. What the agent does

Each step names the section of `docs/runbooks/cloudflare-setup.md` with the exact commands. Every `cf` command runs as
a dry run first, then for real after your yes. Read-only commands need no yes.

1. **The club** (`src/club.ts`): fills in your answers, then `npm run check` to be sure everything still passes with
   your names. If you have no logo, `npm run club -- placeholder`; otherwise your files go in `public/` at the sizes the
   runbook's Branding section lists. Then `npm run club -- all` for the court picture and the launch screen's copy, and
   `npm run docs` so the Documentation carries your names.
2. **The domain** (§1): registers it through Cloudflare Registrar, or adds the existing zone, with DNSSEC on. Records
   the zone id in `deploy.config.ts`.
3. **The databases** (§1, §3): D1 `courtside` (live) and `courtside-staging`, in the region nearest you; applies
   `migrations/` to both; records both ids.
4. **The buckets** (§1, §3): R2 `courtside-originals` and `courtside-staging`, with the CORS, lifecycle and lock
   rules from `infra/` (the domain filled in); an R2 token scoped to the originals bucket for the phones' pre-signed
   uploads.
5. **Stream** (§1): a signing key for playback links, and a token with Stream Edit for uploads, clips and live inputs;
   records the account's customer code in `deploy.config.ts`.
6. **Turnstile** (§1): a widget for the site and one for staging's address; the site keys go in `deploy.config.ts`.
7. **Email** (§1): Email Sending onboarded for the domain (its DNS records added), the sender `alerts@<domain>`;
   Email Routing forwarding `security@<domain>` to you; the SPF and DMARC records from `infra/zone/`.
8. **The zone's protections** (§3): the WAF rules, rate limit, redirects, security headers and bot settings from
   `infra/zone/`, each applied with the domain filled in.
9. **A read-only token** (Secrets) for the admin area's Platform and Costs pages: account analytics, the zone's
   analytics, Security Center insights and billing read.
10. **The secrets** (Secrets): every key above set on the Worker with `cf workers secrets update`, and kept in the
    git-ignored `.secrets.production.json` and `.secrets.staging.json` in `courtside-prod` (linked into
    `courtside-staging`) for the scripts. Nothing printed.
11. **Where the code lives** (§4): an Artifacts namespace and repository named for the Worker, and Workers Builds
    triggers on `main` for the site, the maintenance page and the joiner, each running `npm ci && npm run check` and
    then `npm run deploy:builds`. From here on the club's code is in its own account, and a push of `main` is a deploy.
12. **The joiner** (§7): `npm run join -- image` to build and push the ffmpeg container's image (podman), then
    `npm run join -- deploy`.
13. **The first deploy** (`docs/runbooks/staging.md`, §4): commits your config on a branch, merges it into `staging`,
    `npm run staging -- setup` and `npm run staging` put the site on staging, you sign in there and try it, then in
    `courtside-prod` `git merge --ff-only staging` and `npm run release` put it live. `npm run release` pushes `main`
    to Artifacts, where Workers Builds checks it and deploys it.
14. **You** (`npm run admin`): `npm run admin -- add <your email>` makes you the first site admin. Sign in with the
    code it emails you, and the admin area's Teams page onboards your first team.
15. **Cloudflare's own alerts** (§1): notifications for a spend past a threshold, a new Worker issue and an HTTP DDoS
    attack, emailed to you. These work even when the site doesn't.

## 6. Checking it's right

With the agent, after the last step:

- Sign in on a phone as the admin, and as a team manager of the first team (add yourself to its list with a second
  address). The top bar shows your club's name and colours; the Home Screen icon is your logo.
- Go live on a test game for two minutes, with a second phone watching. End game; the video appears in Watch games
  within about 25 minutes. Delete the test video from the game's page afterwards.
- Upload a short video. Add a photo. Cut a clip.
- The admin area's Platform page shows every piece green, and Costs reads Cloudflare's bill.
- The admin area's Documentation reads right for your club, and `docs/admin/` matches it (`npm run docs`).

## 7. Keeping it generic in your copy

Your club's details belong in `src/club.ts`, `deploy.config.ts`, the images in `public/` and the git-ignored secrets
files, and nowhere else. The tests describe the example Saints club and keep passing however you fill the config in,
so `npm run check` stays green and later improvements to Courtside can be merged into your copy from GitHub, then
released the usual way.
