# Runbook: the maintenance page

A second Worker,
`courtside-maintenance` (`maintenance/`), that answers for the whole site while its route `saints.example/*` is on. A route
takes precedence over the site's custom domain, so it answers first; off, the route is gone and it costs nothing.
Nothing is public: everyone but admins gets the maintenance page, and admins are known by the site's own sign-in.

## What people see

- **Everyone but admins:** the club maintenance page (503, `Retry-After`, `noindex`, no scripts, nothing loaded from
 the site): "Time out! We're upgrading the site. We'll be back soon.". It checks again by itself every minute, and its Try
 again button works in the Home Screen app, which has no reload button.
- **API calls** (upload, photos, Go live): a JSON 503 with the same line, which those pages show instead of an error.
- **Admins** (signed in to the site, which the Worker asks at `/signin/whoami` with the request's cookies, and on the
 Worker's own list in `maintenance/cloudflare.config.ts`): the real site, with a yellow "Maintenance is on" strip at
 the top of each page, to check a new version before reopening. That list is its own, not the site's. While the
 site itself is down nobody gets through, admins included: there's nothing to check then but the Worker's logs.

## Commands

Switching on or off, and deploying, need the site owner's yes (AGENTS.md: Cloudflare changes); status only reads. Every `cf`
step runs as a dry run first; each line says what it did, in local time.

| Purpose | Command |
| --- | --- |
| Is it on? | `npm run maintenance -- status` |
| Switch on | `npm run maintenance -- on` (deploys the Worker with its route; the maintenance tests run first) |
| Switch off | `npm run maintenance -- off` (deploys the Worker with no route; if the route is somehow still there, deletes it through the API) |
| A new version (page wording, the admin list) | Release it: Workers Builds deploys `main` when `maintenance/` changes, keeping it on or off as it is (`scripts/deploy-from-builds.mjs maintenance`). By hand: `npm run maintenance -- deploy` (the same) |
| A release behind it | `npm run release -- --maintenance` (refuses unless it's on; 2 quiet minutes instead of 15) |

`maintenance/` is its own `cf` project (`package.json`, `vite.config.ts`, `cloudflare.config.ts`); its `node_modules`
is a git-ignored link to the repo's, made by the script. It has its own Workers Builds trigger on `main` (`docs/runbooks/cloudflare-setup.md`,
Recorded values), which builds only when `maintenance/`, its tests or the deploy script change, runs `npm ci && npm run check` and
deploys it as it stands: with its route if maintenance is on at that moment, without one if not. Switching on and off
stays a command from a computer.
`cf` picks its login by folder: `courtside-prod` and `courtside-staging` are both bound to the login that reaches Saints Team
Site (`cf auth activate <profile> <folder>`; from a folder that isn't, a deploy fails with "Authentication error").

## When to use it

- **Planned:** a deploy with migrations old code can't run on, such as the multi-team switchover
 (the design notes). Pick a weekday daytime with no game; the release still checks
 nothing is uploading or streaming.
- **An emergency:** the site is broken and a fix will take a while. Switch on with a realistic time, fix, release with
 `--maintenance`, check as an admin, switch off. It works even when the site's Worker is broken: it only calls it for
 admins.
- **From a phone, with no computer:** the dashboard, Workers & Pages, `courtside-maintenance`, Settings, Domains & Routes:
 add the route `saints.example/*` (zone saints.example) to switch on, delete it to switch off.

## Checking it

As an admin: the site with the yellow strip. As a member who isn't one: the page, light and dark, in Safari and the Home Screen app. `npm run maintenance -- status` says on.

## Rolling the maintenance Worker back

`cf workers deployments list --worker courtside-maintenance` shows its versions; `cf workers deployments create` puts one
back at 100% (run in `maintenance/`, `--dry-run` first). The same commands roll back the site's Worker (`--worker
courtside`): see `cloudflare-setup.md`, Rollback.

## Deployed and rehearsed

- 3:51am: first deploy, no route (version `b49f898d`): nothing changed for anyone.
- 3:52am: on (`--back "4am"`), the route in place; with no sign-in, `/api/uploads` still went to Access's sign-in page and
 `/` to the human check: Access stays in front, nothing public.
- 3:52am: off. **Applying no triggers left the route in place**, so the script's fallback deleted it through the API and
 status read off straight after. That fallback is how off works; keep it. On for about a minute, at an hour nobody uses
 the site.
- Still to see with eyes: the page itself as a Watch only account and as the site owner (the switchover's first step does it).
