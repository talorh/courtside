# Courtside

A private game video site for a basketball club's junior teams, running on Cloudflare.

A parent films the game on their phone and streams it live from the site's Go live page, right there in the phone's
browser with nothing to install, or uploads the video when they get home. Everyone on the team's list signs in with a
code sent to their email, watches the game live or later, downloads it, cuts highlight clips and adds photos. Team
managers run their team's fixture, people, squad and game-day roster. A site admin looks after the whole club from an
admin area with its own documentation, costs, log and alerts.

![An empty court in the club's colours, the picture a game shows before its video is ready](public/court.webp)

The whole site is one Cloudflare Worker with the platform's own storage, video, images, AI and email behind it. There
are no servers to patch, no video pipeline to run and no third-party services to pay for: a club's bill is a few dollars
a month for the plan, and the storage of its own games. Everything it needs is provisioned from one account, and a
coding agent can set it up for a club in an afternoon.

**[Set it up for your club: INSTALL.md](INSTALL.md)** · **[Documentation](docs/admin/README.md)** ·
[What it does](docs/spec.md) · [How it works](docs/architecture.md) · [Licence](LICENSE)

## What it does

| For | What they get |
| --- | --- |
| **Families** | Watch every game live (about a second behind the court) or afterwards, in the browser or full screen on a TV. Download the HD video. Cut highlight clips and tag the players in them. Star favourites. See, add and download the team's photos, newest first. Ask for a video, clip or photo to be removed. Sign in once a month with an email code, no password. |
| **Whoever films** | Tap Go live on their phone, point it at the court, and families are watching. Pause for the break and the stream shows a Game break card. A locked phone or a closed page doesn't end the game: Resume camera and Carry on streaming pick it up, and the parts are joined into one video. Or record on the phone and upload later, over a weak signal, with the upload carrying on where it left off. |
| **Coaches** | Everything a filmer gets, plus private notes on each game that only coaches see. |
| **Team managers** | The fixture (by hand, from a PlayHQ link, from any public fixture page read by AI, or from a spreadsheet), with final scores filled in by themselves. The people and their roles, the squad with numbers, a game-day roster with a ready-made WhatsApp message, the line under each game's title, and a Help page that answers questions for their team. |
| **Site admins** | Insights, Teams, Support tickets with alerts that only raise when something needs doing, Platform limits, Costs with Cloudflare's own bill reconciled, one Log of everything, the Changelog, and the Documentation, with an AI assistant that answers from it. |

Everything is private. Every page and file sits behind the sign-in; nothing about a child or a family is ever public,
and the site holds no names but the ones a team manager types. The made-up Saints club and players named after NBA
stars stand in for real people throughout the code, the tests and these docs.

## Why Cloudflare

The site is small because the platform does the heavy lifting, and each piece is the one Cloudflare built for the job:

| Need | Cloudflare | What that means for a club |
| --- | --- | --- |
| The site itself | **Workers**, placed beside the database | One deploy, no servers, fast from anywhere a phone roams |
| The data | **D1** | One SQLite database for every team, with 30 days of Time Travel to undo a mistake |
| Uploaded videos | **R2** | Phones upload straight to the bucket in parts over pre-signed links; nothing passes through the Worker |
| Live streaming and playback | **Stream** | WebRTC in from the phone's browser, WebRTC out to families within a second, HD copies, clips and downloads, all signed |
| Joining a game streamed in parts | **Containers** | A tiny Worker runs ffmpeg for a minute when a game needs it, and sleeps the rest of the time |
| Photos | **Images** | Private, resized, served through signed links |
| Help and fixtures | **Workers AI** | A helper that answers from the team's own Help page, and a reader for any fixture page |
| Sign-in codes and alerts | **Email Sending** | From the club's own domain, with SPF, DKIM and DMARC in place |
| Keeping bots out | **Turnstile**, the zone's **WAF** and rate limits | A person asks for a code; scripts don't |
| Shipping changes | **Artifacts** and **Workers Builds** | A push to `main` is checked again on Cloudflare and deployed, with the changelog line as its message |

The running cost is the Workers Paid plan and the Images and Stream bundle, about US$10 a month, plus Stream's storage
of the club's games. A team that keeps a season of games costs about US$30 a month at steady state, and the admin
area's Costs page shows each team's share against a budget, from Cloudflare's own bill.

## Getting started

- **A club:** [INSTALL.md](INSTALL.md) is written for an AI coding agent to follow with you. It asks for your club's
  name, colours and logo, your domain (new or already on Cloudflare) and your email, then provisions everything in your
  own Cloudflare account and deploys the site. The club's names and colours live in one file, `src/club.ts`; where it
  runs lives in `deploy.config.ts`.
- **A developer:** [docs/admin/24-setting-up-a-computer.md](docs/admin/24-setting-up-a-computer.md) is the local
  setup; the short form is below. [AGENTS.md](AGENTS.md) has the rules every change follows.

```bash
npm install
cp .dev.vars.example .dev.vars        # stand-in secrets for local development
npx cf d1 migrations apply courtside --local --dir migrations
npm run dev                           # http://localhost:5173, signed in as the development address in deploy.config.ts
npm run check                         # types, every unit test, line limits and rules
npm run e2e                           # the browser suite: Go live on Android, iPhone and Firefox, in podman
```

## Documentation

The admin area carries its own Documentation, 29 sections from what the site is to what to do when something goes
wrong, and the same text is exported here as Markdown so it can be read without a sign-in:

- **[The Documentation](docs/admin/README.md)**, including the deployment guide,
  [Environments and releases](docs/admin/26-environments-and-releases.md), the
  [Cloudflare setup](docs/admin/03-cloudflare-setup.md) and
  [When something goes wrong](docs/admin/27-when-something-goes-wrong.md).
- [docs/spec.md](docs/spec.md): what the site does and why, page by page. The source of truth.
- [docs/architecture.md](docs/architecture.md): how it works, with diagrams: a request's path, uploads, live
  streaming, photos, the jobs, the data model, and what was turned down.
- [docs/development-standards.md](docs/development-standards.md) and
  [docs/cloudflare-standards.md](docs/cloudflare-standards.md): the rules the code and the Cloudflare setup follow.
- [docs/runbooks/](docs/runbooks/): the Cloudflare setup, staging and the maintenance page, step by step.
- [docs/child-safety.md](docs/child-safety.md): the site against the Child Safe Standards used in Australian junior
  sport.
- [docs/agent-setup.md](docs/agent-setup.md): the instructions an admin pastes into an AI coding agent to work on the
  site, and [AGENTS.md](AGENTS.md), the rules.

## How a change ships

Every change is built on a branch off `staging`, tested first (the unit tests, and the browser suite for anything a
phone does), merged into `staging` and deployed there with `npm run staging`, and tried signed in on real phones. Then
`main` is fast-forwarded and `npm run release` runs every check again, refuses while anyone is uploading or streaming,
and pushes `main` to Cloudflare Artifacts, where Workers Builds checks it once more and deploys it. Never on a game day
unless it fixes something broken. The details are in
[Environments and releases](docs/admin/26-environments-and-releases.md).

## What's where

| Folder | What |
| --- | --- |
| `src/club.ts`, `deploy.config.ts` | The club, and where it runs: the only two files that name either |
| `src/` | The Worker: `app/` the request path, `auth/` the sign-in, `features/<feature>/` each part of the site, `platform/` the Cloudflare clients, `jobs/` the 5-minute and 3am jobs, `ui/` the layout |
| `public/` | The pages' scripts and styles, the fonts, and the club's images |
| `migrations/` | The D1 schema |
| `infra/` | The provisioning bodies `cf` applies: R2 rules, Images variants, the zone's protections |
| `join/` | The video joiner: a Worker, a Durable Object and the container that runs ffmpeg |
| `maintenance/` | The Back soon page's Worker |
| `tests/` | Vitest on Node with a `node:sqlite` stand-in for D1; `tests/e2e/` the browser suite; `tests/isolation/` two teams through every route |
| `scripts/` | The release, staging, maintenance, joiner, docs and club commands |
| `docs/` | Everything above |

## Licence

[Apache 2.0](LICENSE).
