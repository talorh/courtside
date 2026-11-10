# Cloudflare standards

The rules for how this repo uses Cloudflare, alongside `docs/development-standards.md` (which wins where they
disagree, unless a rule here says otherwise). The commands and ids are in `docs/runbooks/cloudflare-setup.md`.

## Plan limits

- **No Enterprise-only features.** Check a feature's plan availability before designing around it. Prefer what
 the Free plan includes; self-serve paid add-ons (Stream, Workers Paid) are acceptable.
- Everything the site uses is in the club's Cloudflare account, and the `saints.example` zone is the site's own. Nothing
 to do with the site goes in any other account.

## Tooling

- Use the **`cf` CLI** (v1 beta) for everything: scaffolding, dev, types, D1 migrations, provisioning, deploy.
 Don't use `wrangler` or the dashboard unless `cf` has no command for the job; if so, record it in the runbook.
- Discover commands with `cf cli search "<task>"`, then `<command> --help`. Keep search text anonymous: no
 names, emails, domains or IDs.
- Every mutating `cf` command is run with `--dry-run` first, then for real. Record resulting IDs in
 `docs/runbooks/cloudflare-setup.md`.
- Nothing is created, changed or deployed on Cloudflare without the site owner's explicit go-ahead for that step.
- Worker config lives in `cloudflare.config.ts` (`cf/config`), not `wrangler.jsonc`. Regenerate runtime types
 with `npm run typecheck` (runs `cf workers types`) after changing bindings.

## Workers

- Pin `compatibilityDate`; bump it deliberately and note why.
- Enable `observability` and set `redactQueryString: true`, because pre-signed and signed URLs carry credentials
 in query strings. Keep `issues` on too: Cloudflare then emails the site owner when the Worker starts failing in a new way, the
 one alert that works when the Worker itself is down. Only log at error level what's really an error: each error line
 counts as one of the Worker's failures.
- Keep `workersDev` off, as a `*.workers.dev` address would be a second way in. Preview URLs are on only for staging,
 which runs the same sign-in as the live site.
- Don't keep request state in module-level variables. Isolates are reused across requests. Build dependencies
 per request in `src/index.ts` and pass them down.
- Keep requests small. The account has Workers Paid, but the request body limit is still 100 MB and the cron keeps its 45-call budget
 (`platform/fetch-budget.ts`). Big media never passes through the Worker: use pre-signed R2 URLs and Stream pulling
 from URLs. Photos are the exception, at 10 MB at most and a few MB in practice: they pass through to be checked on
 the way in and named on the way out.
- `ctx.waitUntil` is for exactly two writes a page needn't wait for, a member's last seen and a server error's count
 (`deps.defer`, set in `src/index.ts`; `afterwards` in `app/handle-request.ts`): the page is answered first and the
 write finishes after it. Each catches its own failure and logs it, never throws. Nothing else runs past a request; the
 jobs and the tests have no `defer`, so there the same writes are awaited.
- Cron handlers must be idempotent and safe to re-run. A failed run throws, so it shows as failed (and six in a row
 raise a ticket for the admins).
- **Deploys come from `main` only**: `npm run release` pushes it to the Artifacts repo `courtside/courtside`, and Workers
 Builds checks and deploys it (development standards §11). Never `cf deploy` by hand.
- **Staging is a Worker Preview** of the same Worker (`npm run staging`), on its own database and bucket.
 Previews run no cron triggers and take no domain; `workers.dev` itself stays off.
- **The site Worker has no Durable Object of its own**: a Worker that implements one gets no Preview URLs, and staging
 is a Preview. Anything that needs one lives in a second Worker the site binds to across Workers (the joiner).

## Containers

- One container, the video joiner (`join/`): a Durable Object (`Joiner`) in its own Worker, `courtside-join`, carrying an
 Alpine image with ffmpeg and four small Node programs. Instance type `standard-1` (1/2 vCPU, 4 GiB, 8 GB disk: a join
 holds the parts and the joined file on disk at once), one instance,
 placed wherever Cloudflare has room (Oceania alone is refused as limited capacity), asleep after 10 idle minutes: a game joins by stream copy in minutes (two 589 MB parts in under three, measured). Workers
 Paid includes 25 GiB-hours of memory, 375 vCPU-minutes and 200 GB-hours of disk a month; the nightly self-test's ten
 awake minutes use about 20 of the 25 GiB-hours, and an awake hour beyond the allowance costs about US$0.04.
- It holds no data, has no database, secrets, route or domain, and knows nothing of teams: the site hands it links good
 for an hour (the segments to read, one object to write) and nothing else. Staging shares it, as it shares Stream and
 Images.
- Nothing in operation depends on a developer's computer: joins, retries, the alert and the nightly self-test run in
 Cloudflare, and the Worker deploys from `main` through Workers Builds when `join/` changes, like the site and the
 maintenance Worker. Only its image is built on a computer (podman here, `scripts/podman-as-docker.sh`), pushed to
 the registry and named by tag, so no deploy needs Docker.
- Nothing is deleted until the joined file is in R2 and has been read back; a join that fails six times stops trying
 and hands the team manager Keep the first part, so no game waits on an admin.

## Sign-in

- The site's own sign-in is the gate: an email code, then a session
 cookie whose token is hashed in D1 (`src/auth/`). The Worker runs before static assets (`assets.runWorkerFirst`) and
 serves them through the `ASSETS` binding, so nothing on the hostname is open but the sign-in page's own files. No
 Zero Trust app is in front of the hostname or of staging's previews.
- Authorization (member? which role?) is decided in the Worker from D1 on every request, never from the session
 alone or user-editable data.
- The human-check WAF rule tells a signed-in visitor by the `courtside_session` cookie (`infra/zone-courtside-app/
 waf-custom-rules.json`); the rate limit on posts covers the sign-in's forms.

## Edge security

- The zone keeps Cloudflare's always-on DDoS protection (L3/4 and the HTTP DDoS managed ruleset at default
 sensitivity). Never lower it or add skip rules for this hostname.
- The WAF managed ruleset stays deployed (the Free Managed Ruleset, or Cloudflare Managed + OWASP on Pro+). Custom
 rules and rate limiting are kept as JSON in `infra/` and applied with `cf rulesets...`, never hand-edited in
 the dashboard without updating the JSON.
- Zone-level rules that replace a phase entrypoint must be merged with the existing entrypoint first (an update
 replaces every rule in that phase).
- HTTPS only: the zone's Always Use HTTPS setting and a redirect rule both send HTTP to HTTPS, and HSTS with preload
 comes from the zone and the Worker. The minimum TLS version stays at the zone default, 1.0.

## D1

- Schema changes go through numbered files in `migrations/`, created with `cf d1 migrations create` and applied
 with `cf d1 migrations apply` (`--local` for dev). Never edit an applied migration.
- Use bound parameters only (`prepare(...).bind(...)`). Never build SQL with string concatenation.
- Use `batch` for multi-statement writes that must succeed together.
- Every query filters by `team_id`. Index the columns used for filtering and sorting.

## R2

- Buckets are private. No `r2.dev` domain and no public custom domain.
- CORS allows only `https://saints.example`, only the methods needed (`PUT`, `GET`, `HEAD`), and exposes `ETag` for
 multipart uploads (`infra/r2-cors.json`).
- Pre-signed URLs expire within 6 hours: the parts a phone uploads, and the original Stream pulls. Members never
 download from R2 (downloads are Stream's HD MP4, on 1-hour links). The S3 credentials are a dedicated R2 token
 limited to this bucket.
- Retention is enforced by a bucket lifecycle rule as well as the cron job: every object 30 days after upload,
 unfinished uploads after 7, and the nightly database backups (`backups/d1/`) after 14 days.

## Stream

- Every video uses `requireSignedURLs: true`. Tokens are RS256 JWTs signed with a Stream signing key and expire
 within 6 hours. Download tokens add `downloadable: true`.
- Uploads set `scheduledDeletion` to the video's deletion date (the end of 31 December of the year its team's season
 ends, `footageDue`) when that's more than 31 days away, as Stream needs at least 30; closer than that, the daily
 retention job deletes it.
- Stream is reached through its REST API (`src/platform/stream-*.ts`), not a binding, with its own token,
 `courtside-stream-clips`: Stream Edit only (the API calls it Stream Write), on Courtside only; the runbook lists
 its scope. Stream began in an account of its own, so its account is configured apart from the
 Worker's; since the move they're the same one.

## Images

- Photos are kept in Cloudflare Images through the Worker's Images binding (`IMAGES`, `bindings.images`): no API
 token or secret. It's in Courtside's Images and Stream bundle (100,000 images stored and 100,000 deliveries a
 month).
- Every photo is uploaded private (`requireSignedURLs: true`), with `{ teamId }` in its metadata and the member's id
 as its creator. Pages show it only through links the binding signs (account key `default`), good for 6 hours.
- Two variants, `infra/images-variant-thumb.json` (cover, 512 × 512) and `images-variant-large.json` (scale-down,
 1600 × 1600), both `metadata: "none"` and `neverRequireSignedURLs: false`. Cloudflare's own `public` variant isn't
 used. A variant is created with `cf images variants create --body …`, `--dry-run` first.
- A stored image is 10 MB at most. Images has no scheduled deletion: the 5-minute job deletes photos past their date,
 and the daily sweep removes images no row needs.

## Email Sending

- Through the Worker's binding (`ADMIN_MAIL`, `bindings.sendEmail`), which only sends from `alerts@saints.example`, on
 saints.example's own records (`cf-bounce.saints.example`). No token or secret.
- Only `features/admin/admin-mail.ts` sends, and only to the site's admins or a team manager about their own team,
 read from D1 when it sends. Workers Paid includes 3,000 emails a month, far more than the site sends.

## Workers AI

- Through the Worker's binding (`AI`), for Ask Virtual Team Manager and reading a fixture page. Questions are never stored,
 and each member gets 20 a day.

## Secrets

- Secrets are declared with `bindings.secret` and set with `cf workers secrets update` or
 `cf deploy --secrets-file <git-ignored file>`. They're never committed, logged or rendered.
- API tokens get the minimum permissions and are listed in the runbook with their scope: `courtside-stream-clips`
 (Stream Edit), the R2 token for pre-signed links (this bucket only), and `courtside-insights-read`.
- Editing a token keeps its value; rolling one gives it a new value, which breaks the site until the secret is updated,
 so a token in use is never rolled.
