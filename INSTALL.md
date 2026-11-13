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
- **A domain of its own for the site** (recommended): one you'll register through Cloudflare Registrar (the agent can
  do it, about US$14 a year), or one already on Cloudflare as a zone in this account, or one elsewhere whose nameservers
  you can point at Cloudflare. A domain of its own keeps the site's security rules, email and costs apart from
  everything else the club runs. If the club would rather put it on a subdomain of its own domain
  (`videos.yourclub.org.au`), it can, when that domain is already on Cloudflare: section 8 says what that looks like.
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
| The league season's phases, as its fixtures name them (grading 1, the crossover, grading 2, then the season proper) | `seasonPhases` | Grading phase 1, Crossover game, Grading phase 2, Championship season |
| Your uniforms, home first: two or more, or one for a reversible singlet (the match day message says which to wear and which to pack) | `uniforms` | Navy, White |
| A cheer to sign off the welcome email | `cheer` | Go Saints! |
| Your time zone, and the two UTC hours that are 3am there across the year | `timeZone`, `dailyJobUtcHours` | Australia/Melbourne; 16 and 17 |
| The month your season starts | `seasonStartMonth` | 10 |
| The English you write | `english` | Australian |
| Your currency, for the Costs page | `currency` | AUD, Australian dollars, 1.42 to the US dollar |
| Four colours: the deep bar colour, the button colour, its darker ink, its pale tint; and a dark-mode set | `colors` | The example file shows the shape |
| Where your state body's child safety standards are | `childSafety` | A name and a link |
| Your domain: one of its own (recommended), or a subdomain of the club's domain (section 8) | `domain` | saints.example; or videos.yourclub.org.au |
| The Cloudflare zone it's in: the domain itself, or for a subdomain the club's domain | `zone` | saints.example; or yourclub.org.au |
| Your logo files, or "draw one" | `public/` | logo.png and club-mark.webp |
| Your email, for the first site admin, the account's alerts and the Back soon page's own list | `npm run admin`, Cloudflare notifications, `maintenance/cloudflare.config.ts` `ADMIN_EMAILS` | you@yourclub.org |
| The region nearest your club | `deploy.config.ts` `region` | aws:ap-southeast-2 |
| A name for the Worker, if not `courtside` | `deploy.config.ts` `worker` | courtside |

## 5. What the agent does

Each step names the section of `docs/runbooks/cloudflare-setup.md` with the exact commands. Every `cf` command runs as
a dry run first, then for real after your yes. Read-only commands need no yes.

1. **The club** (`src/club.ts`): fills in your answers, then `npm run check` to be sure everything still passes with
   your names. If you have no logo, `npm run club -- placeholder`; otherwise your files go in `public/` at the sizes the
   runbook's Branding section lists. Then `npm run club -- all` for the court picture and the launch screen's copy, and
   `npm run docs` so the Documentation carries your names. Your email goes in `ADMIN_EMAILS` in
   `maintenance/cloudflare.config.ts` too (comma-separated for several): the people the Back soon page lets through to
   the real site while maintenance is on. It's the page's own list, kept apart from the site's admins table so it works
   when the database doesn't; with the example address left there, nobody gets through.
2. **The domain** (§1): registers it through Cloudflare Registrar, or adds the existing zone, with DNSSEC on. Records
   the zone id in `deploy.config.ts`. On a subdomain, nothing to register: the club's zone's id (section 8).
3. **The databases** (§1, §3): D1 `courtside` (live) and `courtside-staging`, in the region nearest you; applies
   `migrations/` to both; records both ids.
4. **The buckets** (§1, §3): R2 `courtside-originals` and `courtside-staging`, with the CORS, lifecycle and lock
   rules from `infra/` (the domain filled in); an R2 token scoped to the originals bucket for the phones' pre-signed
   uploads.
5. **Stream** (§1): a signing key for playback links, and a token with Stream Edit for uploads, clips and live inputs;
   records the account's customer code in `deploy.config.ts`.
6. **Turnstile** (§1): a widget for the site and one for staging's address; the site keys go in `deploy.config.ts`.
7. **Email** (§1; on a subdomain, section 8): Email Sending onboarded for the domain (its DNS records added), the sender `alerts@<domain>`;
   Email Routing forwarding `security@<domain>` to you; the SPF and DMARC records from `infra/zone/`.
8. **The zone's protections** (§3; on a subdomain, section 8): the WAF rules, rate limit, redirects, security headers and bot settings from
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

## 8. If you'd rather use a subdomain

We recommend a domain of its own (section 1). If the club would rather the site lived at, say,
`videos.yourclub.org.au`, it can, as long as `yourclub.org.au` is already a zone on Cloudflare. The site then shares
that zone with the club's website, so it takes care to change nothing of the club's. This is what's different.

**What it needs**

- **The club's domain in the site's Cloudflare account.** A Worker can only take a hostname in a zone of its own
  account, and making the subdomain a zone of its own is an Enterprise feature. If the club's domain is in someone
  else's account (a web designer's, say), either the site goes in that account, with you as a member, or the domain
  moves into the club's account first.
- **A name nothing uses yet.** A Worker's custom domain can't take a hostname that already has a DNS record (a CNAME,
  say). Pick one the club's website doesn't use.
- **The two settings:** in `src/club.ts`, `domain: "videos.yourclub.org.au"` and `zone: "yourclub.org.au"`; in
  `deploy.config.ts`, `zoneId` is `yourclub.org.au`'s zone id.

**What the agent does differently** (section 5's steps)

- **The domain (step 2):** nothing to register. DNSSEC is the club's choice for its own domain, and is left as it is.
- **Email (step 7):** Email Sending onboards `videos.yourclub.org.au` as a sending domain of its own (its `cf-bounce`,
  SPF, DKIM and DMARC records go on the subdomain). Email Routing adds the subdomain under its Settings, then the rule
  forwarding `security@videos.yourclub.org.au`. The SPF and DMARC from `infra/zone/` go on the subdomain's names
  (`videos.yourclub.org.au` and `_dmarc.videos.yourclub.org.au`), one record of each: where onboarding already made one,
  it's edited to match, never doubled. The club's own mail records on `yourclub.org.au` aren't touched.
- **The zone's protections (step 8):** the zone is the club's.
  - Every rule in `infra/zone/` matches the site's own hostname alone (`http.host eq "<domain>"`), so it can't touch
    the club's website. Each is added beside the club's own rules, never in place of them: updating a phase's rules
    replaces all of them, so the agent reads the phase's rules first and sends them back with the site's added.
  - On the Free plan a zone has five custom rules and one rate-limiting rule. The site uses two and one. If the club's
    zone has no room, the agent stops and asks: the club may change its plan or its own rules, or go without the site's
    rate limit (the site's own sign-in limits still hold).
  - The zone-wide settings stay as the club has them. HSTS: the site's Worker sends its own header on every answer.
    Always Use HTTPS: the site's redirect rule covers its hostname. Browser Cache TTL: the site's cache rule
    (`cache-rules.json`) keeps phones from holding an old script, in its place. Blocking AI bots: the site's pages are
    already `noindex` and behind its sign-in, so it's only changed if the club wants it for its whole domain.
  - After the first deploy, `curl -sI https://videos.yourclub.org.au/signin.js` shows the file's own `Cache-Control`,
    not hours. If it shows hours, the club's zone setting is winning, and the agent asks the club about it.

**What it means afterwards**

- **Platform's request count is the whole zone's,** the club's website included, and it says so.
- **Costs carry no domain fee,** as the club pays for its domain anyway. But Costs' Actual shares out every charge by
  use on the account's bill other than watching and R2, so if the club's website also runs in this account and is
  billed by use (another Worker, another bucket), that lands in the teams' costs. A domain and an account of its own
  keep those figures clean.
- **Whoever runs the site has a seat in the account the club's website is in.** Give each person only the role they
  need.
- **The site's own addresses are on the subdomain:** `alerts@videos.yourclub.org.au` sends, and
  `security@videos.yourclub.org.au` reaches you.
