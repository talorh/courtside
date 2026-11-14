# Runbook: the Cloudflare setup

What the site runs on in Cloudflare; how to check each piece; how to change it; how to roll back or restore; local
development; the video joiner; and the club's branding. `INSTALL.md` walks a new club through making all of it, in
order, with an AI coding agent; this is the reference each of its steps points to. The ids and names of a club's own
setup live in `deploy.config.ts` (never here), and its keys in Worker secrets and the git-ignored `.secrets.*.json`.

Rules: the site owner's go-ahead for anything that changes Cloudflare, `--dry-run` first, read-only `cf` any time
(`docs/cloudflare-standards.md`). `cf` shows different commands depending on the folder it's run from; discover them
with `cf cli search "<task>"` (anonymous: no names or ids). Never paste a secret's value into this file. A computer
with several Cloudflare logins names the one to use with `CF_PROFILE=<profile>`; the scripts pass it to `cf`.

```bash
export CLOUDFLARE_ACCOUNT_ID=<account id, deploy.config.ts>
z=<zone id, deploy.config.ts>            # the club's domain, always by id
cf auth whoami                            # your email, this account
```

## 1. The pieces

| Piece | What it is | Where it's set |
| --- | --- | --- |
| Account | The club's own, Workers Paid, with the Images and Stream bundle | Nothing to do with the site lives anywhere else |
| Domain | `CLUB.domain` (`src/club.ts`) in the zone `CLUB.zone`. Recommended, a domain of its own (the two the same): registered through Cloudflare Registrar or an existing zone, auto-renew, DNSSEC on. Or a subdomain of the club's own domain, a zone already in this account that the club's website shares (On a subdomain, below) | `cf zones get -z $z` |
| Worker | `DEPLOY.worker` (`courtside` unless renamed): the custom domain only, workers.dev off, Preview URLs on (staging), crons `*/5 * * * *`, one an hour for the 3am job (`CLUB.dailyJobUtcHours`), placed in `DEPLOY.region`, observability and Issues on | `cloudflare.config.ts` |
| D1 | `<worker>` (live) and `<worker>-staging`, in the region nearest the club | `cf d1 list`; migrations in `migrations/` |
| R2 | `<worker>-originals`: uploaded videos and the nightly backups; `<worker>-staging` | `infra/r2-cors.json`, `r2-lifecycle.json`, `r2-lock.json`; `infra/staging/` |
| Stream | The account's: playback copies, clips, HD MP4s and a live input a streamed game; the customer code in `deploy.config.ts`; a signing key for playback links | Reached by REST with `STREAM_API_TOKEN` |
| Images | The `IMAGES` binding; variants `thumb` (cover 512) and `large` (scale-down 1600), both metadata none, signed links only | `infra/images-variant-*.json` |
| Workers AI | The `AI` binding (Ask Virtual Team Manager, the Documentation assistant, reading a fixture page; the AI models alert reads the catalog through it) | Nothing to provision |
| Email Sending | The `ADMIN_MAIL` binding, from `alerts@<domain>` only; its MX, SPF and DKIM records on `cf-bounce.<domain>`, added by onboarding | `cf email-sending ...` |
| Email Routing | `security@<domain>` forwarded to the site owner (named on `/.well-known/security.txt`) | `cf email-routing settings get -z $z` |
| Turnstile | Widgets `<worker> sign-in` (the domain) and `<worker> staging sign-in` (staging's address), managed, no clearance; site keys in `deploy.config.ts` | `cf turnstile widgets list`; secrets below |
| Artifacts | Repository `<worker>/<worker>`, default branch `main`: a push to it is a deploy | §4 |
| Workers Builds | Triggers on the site, the maintenance page and the joiner, branch `main` only, previews off, caching off; build `npm ci && npm run check`, deploy `npm run deploy:builds [-- maintenance \| join]`; the two small Workers build only when their folders change | §4 |
| Maintenance Worker | `<worker>-maintenance`, routed to `<domain>/*` only while maintenance is on | `docs/runbooks/maintenance.md` |
| Joiner Worker | `<worker>-join`: a Durable Object `Joiner` carrying the ffmpeg container (`standard-1`, one instance) that joins a carried-on recording's parts; the site's `JOINER` binding reaches it | §7 |
| Staging | The same Worker as a Preview, on its own database and bucket | `docs/runbooks/staging.md` |

### Secrets on the Worker

| Secret | What it unlocks | Comes from |
| --- | --- | --- |
| `STREAM_API_TOKEN` | Every Stream call | A user token with Stream Edit, this account only |
| `STREAM_KEY_ID`, `STREAM_KEY_JWK` | Signing playback links without a call each time | `cf stream keys create` |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Pre-signed upload links for the originals bucket | A user token with Workers R2 Storage Bucket Item Write on that bucket only: the access key id is the token's id, the secret is the SHA-256 of its value |
| `CF_INSIGHTS_TOKEN` | Platform's and Costs' Cloudflare figures, Cloudflare's bill on Costs, Support's Alerts' Worker errors (read only) | An account token: Account Analytics Read, the zone's Analytics Read, Security Center Insights Read, Billing Read |
| `TURNSTILE_SECRET` | Checking the sign-in page's Turnstile tokens | The widget's secret (staging's own in `.secrets.staging.json`) |

Values live in the git-ignored `.secrets.production.json` and `.secrets.staging.json`. Set with `cf workers secrets
update`. Editing a token keeps its value; rolling one gives it a new value, which breaks the site until the secret is
updated, so a token in use is never rolled. `cf accounts tokens create` is refused for the CLI login, so tokens are
made with `cf user tokens create --name <name> --policies @<git-ignored file>` or in the dashboard.

### Protection at the edge (zone rules in `infra/zone/`)

Each file carries `<domain>` and `<worker>` as placeholders: fill them in as the file is applied. Every rule matches
the site's own hostname alone (`http.host eq "<domain>"`), so the same files do for a zone the site shares.

| Protection | How |
| --- | --- |
| DDoS | L3/4 always on; the HTTP DDoS managed ruleset at its default |
| WAF managed rules | `waf-managed.json`: the Cloudflare Managed Free Ruleset, made explicit |
| Custom WAF rules | `waf-custom-rules.json`: only GET, HEAD and POST; a managed challenge on page loads for anyone without the site's session cookie, apart from WhatsApp's link previews (a shared link shows the site's name) |
| Rate limiting | `rate-limit-rules.json`: 60 POST or `/api/` requests in 10 s from one address, then blocked 10 s |
| Bots | `bot-management.json`: AI bots blocked, JavaScript detections off, Bot Fight Mode off (it can challenge the upload script) |
| HTTPS | `redirect-rules.json`: HTTP to HTTPS 301, and the zone's Always Use HTTPS setting on as well; HSTS with preload from the zone (`security-header.json`) and from the Worker |
| Browser Cache TTL | 0 (Respect Existing Headers), so a deploy's new scripts aren't held for hours by phones; on a subdomain, `cache-rules.json` (browsers keep the site's own headers) in place of the zone's setting |
| Web Analytics, email obfuscation | Off: every page is behind the sign-in, and their scripts would be blocked by the CSP |
| Mail | Root SPF `v=spf1 include:_spf.mx.cloudflare.net ~all` (Email Routing only), DMARC `p=reject; sp=reject` with reports to DMARC Management (`dns-spf.json`, `dns-dmarc.json`), Email Sending's own records on `cf-bounce` |

### On a subdomain of the club's domain

A domain of its own is recommended (`INSTALL.md` section 8 says why and what changes). When `CLUB.domain` is a
subdomain of `CLUB.zone`, the zone is the club's, shared with its website, and:

| What | On a subdomain |
| --- | --- |
| The zone | Must be in this account: a Worker's custom domain takes a hostname in a zone of its own account, and a subdomain as a zone of its own is Enterprise only. `zoneId` is the club's zone's. The hostname must have no DNS record yet |
| Rules (`infra/zone/`) | Each matches the site's hostname alone. Added beside the club's: a phase's update replaces all its rules, so get the phase's rules, keep every one whose description doesn't start with `<worker>:`, add the file's, and send the whole list. The Free plan has five custom rules and one rate-limiting rule a zone: no room, ask |
| Zone-wide settings | Left as the club has them: `security_header` (the Worker sends HSTS itself), `always_use_https` (the redirect rule covers the hostname), `browser_cache_ttl` (`cache-rules.json` instead), bot management (the club's call), DNSSEC (the club's) |
| Email Sending | The subdomain onboarded as its own sending domain: `cf-bounce.<domain>`, SPF, DKIM and DMARC on it |
| Email Routing | The subdomain added under the zone's Email Routing settings, then a literal rule for `security@<domain>` (catch-all is the apex's only). SPF and DMARC from `infra/zone/` on the subdomain's names, one of each |
| Platform, Costs | The zone's request count is the whole zone's (Platform says so); no domain fee in Costs; the account's other charges by use are shared between the teams |

### Cloudflare's own notifications

Monthly spend past a threshold (two, say US$50 and US$100); the Worker has a new issue; an HTTP DDoS attack; the
domain's certificate events; an abuse report. Emailed to the owner. These work when the Worker itself is down.

## 2. Checking it

```bash
cf workers get <worker>                             # domain, subdomain off, previews on, observability
cf workers secrets list --worker <worker>           # the seven secrets
cf d1 list; cf r2 buckets list
cf r2 buckets cors get <worker>-originals; cf r2 buckets lifecycle get <worker>-originals; cf r2 buckets locks get <worker>-originals
cf rulesets entrypoint get http_request_firewall_custom -z $z   # and _managed, http_ratelimit, http_request_dynamic_redirect, http_request_cache_settings (a subdomain)
cf bot-management get -z $z
for s in email_obfuscation security_header browser_cache_ttl always_use_https min_tls_version; do cf zones settings get $s -z $z; done
cf dns records list -z $z; cf email-routing settings get -z $z
cf stream keys list; cf turnstile widgets list; cf alerting policies list
cf workers scripts search --name <worker>           # the Worker's tag, for the builds
cf builds list --worker <worker tag> --per-page 5
cf workers deployments list --worker <worker>
```

Each should match `cloudflare.config.ts`, `deploy.config.ts`, `infra/` and the tables above.

## 3. Changing it

Dry run, the owner's yes, then for real; then update `infra/` (or this file) in the same commit.

```bash
d=infra/zone
cf rulesets entrypoint update http_request_firewall_managed -z $z --body "$(sed "s/<domain>/$DOMAIN/g; s/<worker>/$WORKER/g" $d/waf-managed.json)" --dry-run
cf rulesets entrypoint update http_request_firewall_custom -z $z --body "$(sed "s/<domain>/$DOMAIN/g; s/<worker>/$WORKER/g" $d/waf-custom-rules.json)" --dry-run
cf rulesets entrypoint update http_ratelimit -z $z --body "$(sed "s/<domain>/$DOMAIN/g; s/<worker>/$WORKER/g" $d/rate-limit-rules.json)" --dry-run
cf rulesets entrypoint update http_request_dynamic_redirect -z $z --body "$(sed "s/<domain>/$DOMAIN/g" $d/redirect-rules.json)" --dry-run
cf rulesets entrypoint update http_request_cache_settings -z $z --body "$(sed "s/<domain>/$DOMAIN/g; s/<worker>/$WORKER/g" $d/cache-rules.json)" --dry-run   # a subdomain only
cf bot-management update -z $z --body "$(cat $d/bot-management.json)" --dry-run   # send enable_js too: a bare update turns it on
cf zones settings edit security_header -z $z --body "$(cat $d/security-header.json)" --dry-run
cf zones settings edit browser_cache_ttl -z $z --body '{"value":0}' --dry-run
cf r2 buckets lifecycle update <worker>-originals --rules @infra/r2-lifecycle.json --dry-run
cf r2 buckets cors update <worker>-originals --rules "$(sed "s/<domain>/$DOMAIN/g" infra/r2-cors.json)" --dry-run
cf r2 buckets locks update <worker>-originals --body "$(cat infra/r2-lock.json)" --dry-run   # replaces the lock rules: --force to confirm
cf images variants create --body "$(cat infra/images-variant-thumb.json)" --dry-run
cf d1 migrations apply <d1 id> --dir migrations --dry-run    # before the release that needs it
cf workers secrets update <NAME> --worker <worker> --dry-run
```

A migration goes on the live database minutes before the release that needs it, while the live Worker still runs the
old code, so every migration is additive (`docs/development-standards.md` §5): it adds the new value, column or table
beside the old, the release reads either and writes the new, and a later migration drops the old once that release is
known good. Run `npm run release -- --check-only` first, so the gap between the migration and the deploy is short, and
take a Time Travel bookmark (§5) before a migration that rewrites rows.

A zone-level ruleset update replaces every rule in that phase, so merge with the file first (in a zone the site
shares, the club's own rules stay as they are: On a subdomain, above). The zone-wide settings above (`bot-management`,
`security_header`, `browser_cache_ttl`) are for a domain of the site's own only. The nightly backups'
lock means nothing can delete or overwrite one in its first 14 days; the lifecycle rule deletes each at 14 days.

Onboarding a new team needs nothing here: Stream, Images, D1 and R2 are shared by every team.

## 4. Deploying

Every deploy is `npm run release` from `main` in `courtside-prod` (`docs/development-standards.md` §11): it runs every
check, the browser suite, the migration and quiet-site checks and `cf deploy --dry-run`, then pushes `main` to the
Artifacts repository with a 10-minute token (`scripts/release-push.mjs`), where Workers Builds runs `npm ci && npm run
check` and `npm run deploy:builds` (the newest `CHANGELOG.md` line as the message, the commit as the tag). Never plain
`cf deploy`. Staging first, always (`docs/runbooks/staging.md`).

```bash
cf artifacts namespaces create <worker>; cf artifacts namespaces repos create <worker> --name <worker>   # once, at install
cf builds triggers list                                   # the three triggers, each on main
cf artifacts namespaces tokens create <worker> --repo <worker> --scope read --ttl 600   # a 10-minute read token, to fetch by hand
git -c http.extraHeader="Authorization: Bearer <token>" fetch https://<account id>.artifacts.cloudflare.net/git/<worker>/<worker>.git main
cf artifacts namespaces repos tokens list --namespace <worker> --name <worker> --state active   # tidy: revoke leftovers
cf builds logs <build uuid>
cf builds create <the Worker's tag> --branch main       # build main again by hand (the tag: cf workers scripts search)
```

## 5. Rolling back and restoring

For a fix that will take a while, switch the maintenance page on first (`docs/runbooks/maintenance.md`).

- **The Worker:** roll back to the previous version in the dashboard (Workers & Pages, the Worker, Deployments), which
  keeps its secrets and bindings; `cf workers deployments list --worker <worker>` shows the versions. The fix then goes
  out through `npm run release`.
- **A bad change to the data:** D1 Time Travel keeps 30 days: `cf d1 time-travel get-bookmark <DB_ID>` before any
  risky change; `cf d1 time-travel restore <DB_ID> --bookmark <it> --dry-run`, then for real.
- **The database itself gone:** `cf r2 objects get backups/d1/<worker>-YYYY-MM-DD.sql --bucket-name <worker>-originals
  --text > restore.sql`, a new database, then
  `npm run restore-d1 -- restore.sql <NEW_DB_ID> --account $CLOUDFLARE_ACCOUNT_ID`. It refuses a database that already
  has tables (the file holds the schema and `d1_migrations`); the sign-in's tables come back empty, so everyone signs
  in again with a code; it ends "counts match". Then point `deploy.config.ts` at it and release. Drill it any time
  without Cloudflare: `npm run restore-d1 -- restore.sql --sqlite drill.db`. Delete the downloaded file after: it holds
  every member's email.
- **Something deleted by mistake:** a video a person deleted keeps its media a day (`purge_after`); clear
  `deleted_at`, `deleted_reason` and `purge_after` on its row (and `deleted_at` on its game if the game went) before then.

## 6. Local development

```bash
cp .dev.vars.example .dev.vars                           # secrets only; put a generated JWK in STREAM_KEY_JWK
npm run dev:db && npm run dev:seed
npm run dev                                              # http://localhost:5173, signed in as DEV_AUTH_EMAIL
rm -rf .cloudflare/state                                 # reset local data (then re-run the migrations)
# Run the 5-minute job locally:
curl -X POST "http://localhost:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=<worker>" -H "Content-Type: application/json" -d '{"cron":"*/5 * * * *"}'
```

`.dev.vars` only supplies secrets; plain values come from `cloudflare.config.ts` in development mode. Photos added in
`cf dev` stay on this computer. `.dev.vars.example` gives every secret a stand-in (the Worker won't start with one
empty); calls to Stream fail with them and the pages carry on without. Go live's stream and recording path is tried on
staging, with real Stream, before a phone test.

## 7. The video joiner

`join/` is its own cf project (like `maintenance/`): its `cloudflare.config.ts` names the Worker `<worker>-join`, its
Durable Object `Joiner` and the container (`Dockerfile`: Alpine, ffmpeg, `server.mjs` on port 8080). The site's
`cloudflare.config.ts` binds to it, so the joiner must be deployed before a site config that names it (the live site
and the staging preview alike).

```bash
npm run join -- image        # when join/ changed: build the image (podman as docker, scripts/podman-as-docker.sh), push it to Cloudflare's registry, write its tag to join/image-tag.txt (commit it)
npm run join -- dry-run      # the joiner's tests, then cf deploy --dry-run in join/ (the image by tag: no Docker needed)
npm run join -- deploy       # the same, then cf deploy, by hand; the usual way is the release
cf containers applications list                           # the application, its image and instances
```

It's deployed from `main` by Workers Builds, like the site: its own trigger builds only when `join/`, `tests/join/` or
`scripts/deploy-from-builds.mjs` change, runs `npm ci && npm run check` and then `npm run deploy:builds -- join`
(`cf deploy` in `join/`, the newest changelog line as its message). The config names the image by tag
(`image-tag.txt`), never a Dockerfile, so the deploy needs no Docker: the image is pushed once by `npm run join --
image` wherever podman or Docker is, and the new tag is committed and released. The maintenance Worker deploys the
same way (`docs/runbooks/maintenance.md`).

**How a join goes:** the site never waits on one. A 5-minute run asks the joiner to begin (`POST /join`, answered at
once), the container's `jobs.mjs` runs it (one at a time, stopped at 40 minutes) and PUTs the joined file to R2, and a
later run finds that file and makes it the video. The file in R2 is the only proof the site trusts; a join that
failed or was lost (the container restarted) is begun again ten minutes after the last began, six times at most. The
container sleeps ten minutes after the last ask, and the site asks every run while a video waits, so it stays awake
through a join. The admin Log says `video_joined` for each (parts, size, minutes). The container's own lines
(`join_done`, `join_failed`) go to its standard output, which isn't in Workers Logs: the Cloudflare dashboard's
Containers page shows them.

**A join that failed:** Platform's "The video joiner" row and the `joiner` alert say so (urgent: a game's join gave up
after six tries; warn: the nightly self-test failed). The Log has `join_failed` with the reason, Problems a
`stream_problem` line. The game's team manager sees **Keep the first part** on the game's page and needs nobody: the
first part becomes the video, the rest is deleted, the alert clears. The segments stay in R2 under the recording's
folder (`live-<date>.2.mp4`…) until joined or kept.

## 8. Branding: the club's images

The club's colours and names come from `src/club.ts` (the pages read them: `/club.css` and the manifest are made from
it). The images are files in `public/`, replaced with the club's own at these sizes, all on white unless said:

| File | Size | Used for |
| --- | --- | --- |
| `logo.png` | 225 × 225 | The top bar, the sign-in page, a video with no frame yet |
| `icon-192.png`, `icon-512.png` | 192, 512 | The Home Screen icon (Android) |
| `icon-maskable-512.png` | 512, the mark inside the middle 60% on the bar colour | Android's maskable icon |
| `apple-touch-icon.png`, `apple-touch-icon-precomposed.png` | 180 × 180 | The Home Screen icon (iPhone) |
| `favicon.png`, `favicon.ico` | 64; 16, 32 and 48 | Browser tabs |
| `club-mark.webp` | 400 × 320, transparent | The Game break and Full time cards, and the launch screen |
| `court.webp` | 1600 × 900 | The empty player and Home: made by `npm run club -- court` from `logo.png` and the colours |
| `technical-difficulties.jpg` | 360 × 354 | A thumbnail that couldn't load |

`npm run club -- placeholder` draws a stand-in set in the club's colours for a club with no logo yet;
`npm run club -- all` makes the court and copies the mark into `src/ui/club-mark-inline.ts` and `maintenance/logo.ts`
(both generated; a test holds them to the files). Commit the lot.
