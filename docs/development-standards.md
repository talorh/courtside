# Development standards

The rules the code in this repo follows. Each one was taken from the code as it stood, names the files it comes from, and is
kept current as the code moves on. Every rule is a **must**. Code found breaking one is fixed, or listed as work to do
until it is; the rule still stands. Code comments point at these sections by number (§1 to §11), so the numbers stay
put. The Cloudflare platform rules are in `docs/cloudflare-standards.md`.

## 1. Layout and naming

- Worker code lives in `src/`, in these folders only: `app/` (entry, config, deps, router, responses, errors),
 `auth/`, `shared/`, `ui/`, `platform/`, `features/<feature>/`, `jobs/`. Entry point: `src/index.ts`.
- Browser code lives in `public/` (static, no build). Database changes live in `migrations/`. Provisioning JSON
 lives in `infra/`. One-off and check scripts live in `scripts/`. Tests live in `tests/`.
- A feature folder (`src/features/games/`, `videos/`, `roster/` …) holds `<name>-routes.ts`, `<name>-service.ts`,
 `<name>-repository.ts` and `views/<name>-page.ts`. A feature has only the layers it needs (`players/` is one
 repository).
- File names are `kebab-case.ts`. Types and interfaces are `PascalCase`; functions and variables `camelCase`;
 module constants `UPPER_SNAKE_CASE` (`MAX_MEMBERS` in `members-service.ts`, `LIVE_PART_SIZE` in
 `browser-live-service.ts`, `STORAGE_CACHE_MS` in `platform/storage-cache.ts`).
- Source files in `src/`, `public/`, `maintenance/` and `join/` (the video joiner's plain Node `.mjs` too) are 140 lines
 at most, 160 as a hard cap (`scripts/check-loc.mjs`, run by `npm run check`; the folders are `LOC_ROOTS` in
 `scripts/rules.mjs`). Tests, docs, migrations, scripts, `.d.ts` files and the vendored `public/stream-sdk.js` are not
 counted. A file over the cap is split by responsibility (as `playhq-service.ts`, `playhq-repository.ts` and
 `playhq-alert.ts` are), never by line range.
- No barrel files (`index.ts` re-exports), and no `import * as` in `src/`. Every import names the file that owns
 the symbol.
- Relative imports end in `.ts` and type-only imports use `import type` (`tsconfig.json`: `verbatimModuleSyntax`,
 `allowImportingTsExtensions`). No path aliases.
- **Comments say only what the code needs**: what something does and why, in the present tense, where that isn't
 plain from the code. Never who asked for it or when: no "<name>, <date>:...", no quoted requests, no review,
 sweep, scrub, backlog or plan tags ("(review R7)", "(sweep 3)", "(multi-team, Phase 3)", "(v3 Phase 1)"), and no
 history. The same goes for test names, test
 comments and migration notes. That history lives in git, `CHANGELOG.md` and the review notes. A date stays only
 where the code needs it (a test's clock, a date format's example). `npm run check` refuses it.

## 2. Dependencies and composition

- Everything a handler, service or job uses comes in through `AppDeps` (`src/app/deps.ts`): `db`, `config`,
 `stream`, `originals`, `presigner`, `tokens`, `clipper`, `live`, `playhq`, `ai`, `images`, `email`, `cloudflare`, `now`;
 a team's request or job step gets `TeamDeps`, which adds its `team`. `buildDeps` is the only place real clients are
 made; `src/index.ts` calls it once per request and once per cron run, the cron with a budgeted `fetch`.
- The time is always `deps.now`. Code under `src/` never calls `new Date` for "now" except `buildDeps`.
- Module-level state is limited to three caches, each commented with why: the Stream storage answer, plain Stream
 tokens and photos' signed links (`src/index.ts` → `platform/storage-cache.ts`, `platform/stream-tokens.ts`,
 `platform/hosted-images.ts`). Nothing else holds state between requests.
- Repository functions take `db: D1Database` and `teamId: string` as their first two parameters
 (`notes-repository.ts`, `games-repository.ts`). Services take `deps: AppDeps` (or `db`, `teamId` when they only
 touch D1, as `games-service.ts` `pickerGames`).
- Config is read once in `src/app/config.ts`: every required value is in the `REQUIRED` map and a missing one
 throws `ConfigError`. Code never reads `env` outside `src/index.ts`, `config.ts` and `deps.ts`.
- Runtime dependencies are `zod`, `jose` and `aws4fetch` only (`package.json`). A new one needs the site owner's yes.
 Versions are release numbers (a range in `package.json`, the exact one in `package-lock.json`, which `npm ci`
 installs), never a dist-tag like `latest`.
- **Software ages out, so every plan checks.** When planning any change, find out whether anything the site uses is
 deprecated or near its end of life: Node (`.node-version`), the npm packages (`npm install`'s deprecation notices,
 `npm outdated`, an `engines` range that leaves our Node behind), Playwright's image, the joiner's base image
 (`join/Dockerfile`), the Workers compatibility date, the Workers AI model, and any Cloudflare API or `cf` command
 marked deprecated. Say so in the plan, with the date its support ends and the update recommended, so it's surfaced
 and goes on the todo with the site owner's yes, never found at the deadline (Node 22, say, whose support ends on
 30 April 2027).

## 3. Requests, routes and responses

- Every request goes through `handleRequest` (`src/app/handle-request.ts`) in this order: the same-origin check on any
 method other than GET/HEAD, the launch spinner and the sign-in's own pages and files (before any sign-in:
 `features/signin/`, `app/static-files.ts`), the session cookie (`auth/session.ts`), static files (the `ASSETS`
 binding), who's asking (`auth/viewer.ts`: memberships and admin in one trip), the current team (`app/current-team.ts`), the admin
 area (`/admin`, site admins only, with its own router: `app/admin-router.ts`), the site's own pages (Which team?,
 switching, View as), no team (Which team?, the admin area for an admin, or the 403 "not on a team's list" page), the
 guard on writes (`app/team-guard.ts`), the membership and the closed-team rule (`app/team-context.ts`), route match,
 role check, handler. `docs/architecture.md` draws it.
- **The current team** (multi-team): addresses don't name a team, so each request runs as one membership of the
 person's current team, from the `team` cookie (or an admin's session-only `admin_team`). Handlers get it as
 `ctx.team` and `deps.team` (`TeamDeps`); nothing reads a team from the config.
- **Every write says its team.** Every post form is written `method="post"` (lower case, double quotes) so `layout`
 can add `_team` to it, and every page script write goes through `api`, `apiForm` or `ask.js`, which send
 `X-Courtside-Team` (rules in `scripts/rules.mjs`). A form for any team but the current one is refused before anything
 happens; a page script's write runs as its page's team when the person can open it. A new site page with a post
 form that belongs to no team (Which team?) is handled before the guard.
- Routes are registered per feature with `registerXRoutes(router)` and listed in `src/app/routes.ts`. Each route states
 its lowest role (`router.get(path, "coach", …)`); roles rank `watcher < filmer < coach < manager`
 (`auth/permissions.ts`, `hasRole`; "admin" means only the site admin, from the `admins` table). A POST allowed once a
 team's season is over says so: `router.post(path, role, handler, { closedTeams: true })`. A rule finer than rank
 (coaches only, the uploader only, the clip maker only) is checked in the handler or service (`requireCoach` in
 `notes-routes.ts`, uploader check in `upload-service.ts`).
- The router supports GET and POST only, and the first match wins (`src/app/router.ts`). A fixed path that
 shares a shape with a `:id` path is registered before it (`/fixture/playhq`, `/fixture/import` before
 `/fixture/:id`).
- Anything that changes data is a POST. The only GETs that write are idempotent and commented at the route: `/roster`,
 `/roster/week/:week/message` and `/roster/export.xlsx` (fill or clear roster weeks), `/live` (open or reuse the game's
 live input), the game page (marks it opened for "New"), and the downloads, `/videos/:id/download/hd` and
 `/clips/:id/download`, with their JSON forms for an iPhone's Save, `/api/videos/:id/download/hd` and
 `/api/clips/:id/download` (ask Stream to make the MP4 if it has none yet; the game's ones also log the download).
 Every signed-in request also notes the member's Last seen, at most once an hour (`src/app/handle-request.ts`), never
 for an admin's hidden membership, which an admin's first visit to a team they aren't in makes (idempotent,
 `ensureHiddenManager`).
- Form posts end with `redirect(…?done=<key>)` (303, `src/app/respond.ts`). The page shows a fixed message for
 that key from the view's map (`FIXTURE_MESSAGES`, `ROSTER_MESSAGES`); text from the query string is never
 shown (`ui/components.ts` `notice`).
- JSON endpoints live under `/api/` and answer `{ ok: true, data }` or `{ ok: false, error: { code, message } }`
 (`jsonOk`, `jsonError` in `respond.ts`). HTML or JSON for an error is chosen by the `/api/` prefix.
- Every response carries `BASE_HEADERS` (`respond.ts`): `X-Robots-Tag: noindex, nofollow`, `nosniff`,
 `Referrer-Policy: same-origin`, HSTS, `Cache-Control: no-store` and a `Permissions-Policy` (camera and microphone
 for this site only). `handleRequest` sets the CSP on every response from `contentSecurityPolicy(config)`, which
 names only this site's Stream customer host, its own R2 account and Cloudflare Images' `imagedelivery.net` (photos'
 signed links), never a wildcard; `img-src` also takes `blob:`, the photo a member chose, drawn smaller on their
 phone. A new outside host is added there and nowhere else.
- Input is parsed at the route with zod: `parseForm(req, schema, lists)` or `parseJson(req, schema)`
 (`shared/validation.ts`), giving a 400 that names the field. Path ids use `idParam(value, what)`, giving a 404
 for anything but a positive integer. A missing or invalid field is refused; it never falls back to a default.
- Form schemas live in the service that uses them and are exported to the route (`gameFormSchema` in
 `games-service.ts`).

## 4. Errors and logging

- A failure the user should see is an `HttpError` from the helpers in `src/app/errors.ts` (`badRequest`,
 `unauthenticated`, `forbidden`, `notFound`, `conflict`), or `new HttpError(502|503, code, message)` for an
 upstream failure with user-safe words (`clips-service.ts`). Anything else becomes a 500 with a generic message
 and is logged.
- `requireX` functions throw `notFound` instead of returning null (`requireGame` in `games-service.ts`,
 `requireVideo` in `watch-service.ts`).
- A targeted write (one row by id) checks it changed exactly one row with `assertChanged(result, what)`
 (`shared/d1.ts`), or checks the row exists first in the same handler (`notes-routes.ts` delete).
- No swallowed errors. A `catch` either rethrows, turns the error into an `HttpError`, cleans up and rethrows, or
 is one of the deliberate, commented, non-fatal cases, which log and carry on:
 - activity feed writes (`activity-service.ts` `record`, event `activity_log_failed`);
 - the team manager's PlayHQ banner (`games/playhq-alert.ts`): renders nothing;
 - the admins' alerts (`admin/usage-checks.ts`, event `alert_failed`): the level is saved first, and a ticket's
 email that doesn't go is sent by the 5-minute job; a check never fails its job;
 - counting a server error for the alert (`handle-request.ts`, `server_error_count_failed`): the error page still goes;
 - Stream status on pages (`isBroadcasting`): a Stream outage never breaks a page;
 - `completeUpload` handing the copy to Stream: returns `"queued"` and the cron retries;
 - switching a live input off once the database says the stream is over (`live-service.ts` `switchOff`, event
 `live_disable_failed`): the change is recorded first, and the daily sweep deletes the input later;
 - setting up the input when the Go live page opens (`live-routes.ts`, `live_open_failed`): the page says Go live
 can't start just now instead of an error page; a page for saving a recording doesn't ask Stream at all;
 - Virtual Team Manager's AI call (`ask-service.ts`): answers "refilling the drink bottles" and logs `ask_failed`;
 - the "last seen" write after a request (`handle-request.ts`, `last_seen_failed`): the request already did its job;
 - "is a phone still streaming this?" before saving or deleting a recording (`recording-save-service.ts`,
 `upload-service.ts` `abortUpload`): a Stream hiccup reads as not streaming, as on the pages;
 - signing photos' links for a page (`photos/photo-links.ts`, `photo_links_failed`): the page says the photos can't
 be shown just now;
 - taking a photo back out of Images when its row couldn't be saved (`photos-service.ts` `addPhoto`,
 `photo_cleanup_failed`): the save's own error is still thrown, and the daily sweep removes the image;
 - labelling a new clip with its team in Stream (`platform/stream-clips.ts`, `clip_label_failed`): Stream's clip call
 keeps only the name, so a second call adds the team (and staging's label); the clip exists and its row names it
 either way;
 - asking Stream for a ready video's or clip's HD MP4 (`videos/processing-service.ts` `requestHd`, `hd_request_failed`):
 the next run (a video) or the first download (a clip) asks again when Stream has none;
 - a support ticket's emails (`support-desk-service.ts` `trySend`, `ticket_email_failed`) or an admins change
 (`admins-service.ts`, `admin_mail_failed`): saved first, then emailed. A ticket's email is sent by the 5-minute job
 (one that fails again is logged and never fails the run); an admins change stays made, and its log line says the
 email didn't go.
 A new non-fatal case gets a comment saying why it can't hurt data, and a log line.
- Batch work uses `runEach` (`shared/run-each.ts`): one item at a time, failures collected. The caller surfaces
 them; the cron throws an `AggregateError` after finishing the rest (`jobs/sync-videos.ts`). A `FetchBudgetSpent`
 error is the one exception: logged as `deferred`, picked up by the next run.
- Logs are one JSON object per line: `console.error|warn|log(JSON.stringify({ event: "snake_case_name", teamId, …ids,
 error: String(err) }))` (`handle-request.ts` `request_error`, `jobs/sync-videos.ts` `sync_team`,
 `live-routes.ts` `golive_events`). Every line from a team's request or job carries `teamId` (a rule; the site-wide
 ones are listed in `scripts/rules.mjs`). Logs never contain secrets, signed URLs, WHIP addresses or tokens.
- Platform clients throw `Error("<Service> <operation> failed (<status>)")`, adding the service's first error
 message when it sends one (`platform/stream-client.ts`, `stream-live.ts`, `stream-clips.ts`, `playhq.ts`).

## 5. Data (D1)

- Every query filters by `team_id`, with `teamId` as the first bound value. The exceptions are `CROSS_TEAM` in
 `scripts/rules.mjs`, each with its reason: the backup dump (whole tables), teams, the site's admins, a person's
 memberships across teams, which team owns an id (to offer a switch), and the admin area (Insights, the Log and its
 problems, Platform, the support desk, its navigation's counts, and the server error count). A new one needs a reason there and
 a test that it can't reach someone it shouldn't. Jobs reach every team through `runTeams` (`jobs/teams.ts`), one
 team's queries at a time.
- SQL lives only in `*-repository.ts` files and the jobs. Services and routes call repository functions.
- Rows are `snake_case`; repositories return `camelCase` types (`Game`, `Video`, `CoachNote`), mapped inside the
 repository (a `toX(row)` mapper as in `games-repository.ts`, or inline as in `notes-repository.ts`).
- Several writes that must succeed together go in one `db.batch([...])`. Repositories export statement builders
 named `…Write` for this (`playhqGameWrite`, `playhqCheckWrite`, `reviveGameWrite` in `playhq-repository.ts`);
 the service batches them.
- Nothing is left behind outside D1: Stream videos and live inputs, and photos' images in Cloudflare Images, that no
 team's rows need are removed by the daily sweep (`jobs/sweep-orphans.ts`, which reads every team's records and deletes
 nothing if one team's can't be read), and every R2 object has a lifecycle rule (`infra/r2-lifecycle.json`). New Stream
 videos, clips and live inputs and new images carry `teamId` in their metadata. The sweep refuses only when most of
 Stream (or Images) is unknown to the database; known leftovers (closed streams' inputs) never count. Nobody deletes
 Stream things by hand: the sweep re-reads what's open on the night.
- Records people delete are soft-deleted (`deleted_at`, `removed_at`) and filtered out by every read. Hard deletes
 are only for retention (`downloads`, `video_views`, purged media) and rows that never meant anything (an
 aborted upload).
- Timestamps are stored as ISO UTC text from `deps.now.toISOString`. Game times are local wall time
 strings `YYYY-MM-DDTHH:MM`, and when a photo was taken `YYYY-MM-DDTHH:MM:SS` (`shared/time.ts`); conversion,
 seasons (October to September, `seasonOf`) and retention (`seasonEndDeadline`; a team's videos and photos all go
 with its own season, `footageDue` in `teams/team-code.ts`) are only done with `shared/time.ts`.
- Migrations are numbered `NNNN_name.sql` (`migrations/0001_init.sql` onwards, one a change), never edited
 once applied, and start with a comment saying what and why. New tables have `team_id … REFERENCES teams(id)`,
 `CHECK` for every enum column, and a (partial) unique index for every "only one" rule
 (`videos_one_per_game`, `live_streams_one_open_per_game`). Changing a `CHECK` rebuilds the table (`0003`,
 `0007`, `0008`). Each migration is applied to the live database before code that needs it is deployed (`npm run
 release` checks every database the config names).
- **Migrations are additive.** The live Worker keeps running on the database for the minutes between a migration and
 the release that follows it, and a rollback leaves the data as the migration made it. So a migration never changes a
 value the live code reads or a shape it depends on in one step: it adds the new value, column or table beside the old
 (a new `CHECK` lists both), the release reads either and writes the new, and a later migration, after that release
 is known good, drops the old. The same for a rename: the new name is added and filled, the code is moved over, then
 the old goes. A migration that only adds (a table, a column with a default, an index) needs no second step. The one
 exception is a value nothing live reads or writes any more (a `CHECK` entry the code stopped writing, a rename of an
 id the code only ever reads back), which one migration can finish, written down in its comment. A migration that
 changes a stored value the live code reads in place once misread rows for ten minutes.
- Cron work is sized for one invocation's limits: batches of fixed size with `runEach` (`processing-service.ts`,
 `clips-service.ts`, `retention-service.ts`) inside the shared fetch budget, and every step is safe to re-run.
 Large writes take a few D1 round trips and bind 100 values at most per statement (`countingDb` tests).

## 6. Platform clients

- Each outside service has one file in `src/platform/` that exports a `…Port` (or named) interface and a
 `createX(config)` factory (`stream-client.ts`, `stream-live.ts`, `stream-clips.ts`, `stream-tokens.ts`,
 `r2-originals.ts`, `r2-presigner.ts`, `playhq.ts`, `workers-ai.ts`, `hosted-images.ts`, `email.ts`,
 `cloudflare-insights.ts`). Features use the interface from `AppDeps`, never the vendor API directly.
- REST clients take an optional `fetch` in their config, so the cron can pass its budget and tests a fake
 (`tests/helpers/fake-fetch.ts`).
- Every outside `fetch` has a timeout (`AbortSignal.timeout(15_000)` in every platform client and `fixture-link.ts`),
 and a reply that isn't JSON is reported with its status, never thrown as a bare parse error.
- A page fetched for reading is read up to a byte limit, never whole (`fixture-link.ts` `readUpTo`).
- Stream videos, clips and live inputs are always created with `requireSignedURLs: true`, and pages use signed
 tokens (`stream-tokens.ts`). Photos are stored in Images the same way, private, and pages use links the Images
 binding signs (`hosted-images.ts`).
- Something outside D1 can go without the site doing it (deleted by hand, R2 dropping an unfinished upload after 7
 days, the daily sweep). Removing or switching off a thing that's already gone is done, not an error, and reading
 one says "gone" (null, `"already_gone"`) rather than throwing: `stream-client.ts` and `stream-live.ts` read a 404
 that way, `r2-originals.ts` `abort` a NoSuchUpload (10024), `hosted-images.ts` `delete` an image Images no longer
 has. The feature then recovers: Go live sets up a new input
 for one Stream no longer has (`live-service.ts` `openLive`): a deleted input once broke Go live.
- Email (multi-team, Phase 5): `email.ts` over the `ADMIN_MAIL` binding (Email Sending), which only sends from
 `alerts@saints.example`. `features/admin/admin-mail.ts` is the only code allowed to use it (a rule in
 `scripts/rules.mjs`: nothing else imports the port or calls `email.send`), and it writes only to the admins table's
 people, a new team's team manager (its welcome) and a support ticket's own team manager, both from the team's members
 list, never to an address a caller gives. Subjects and addresses can't hold a line break (header injection), and
 the binding's error is thrown with its code.
- Stream's status lags: a live input can read "connected" for a minute after its phone stopped. A stream counts as
 live only once Go live has started its recording (`wasStreamed` in `live-repository.ts`).

## 7. Pages (server-rendered HTML)

- All markup is built with the `html` tagged template (`shared/html.ts`), which escapes every value. `raw` is
 only for constants written in this repo, never for anything a person typed or a service returned.
- A page is `xPage(props)` in `features/<f>/views/<x>-page.ts`, with a props interface, returning `layout(...)`
 (`ui/layout.ts`), or `adminLayout(...)` for the admin area (`features/admin/views/admin-layout.ts`, which adds
 `admin.css` and `admin.js` on admin pages only). Shared pieces are in `ui/components.ts`; icons in `ui/icons.ts`.
- The top bar comes only from the `NAV` table in `ui/layout.ts`, with the lowest role per item. A link shown by
 role uses that table.
- No inline scripts or inline styles (the CSP forbids both). Page scripts load as
 `<script type="module" src="/<name>.js">`; styles are in `public/app.css` (and the admin area's in `admin.css`).
 The one exception is the launch spinner's own `<style>` (`ui/launch-style.ts`), allowed by its hash on that page
 alone, so it never shows unstyled while `app.css` is on its way.
 Charts are SVG with presentation attributes and classes only.
- A POST action is a form with `postButton` (`ui/components.ts`), so it works without JavaScript. Every delete or
 remove asks first: its button is `confirmButton` (`ui/confirm.ts`: **Yes, delete it** or **Keep it**), and its route
 is registered with `{ confirm: true }`, which refuses a post without `confirm=yes`.
- A closed team's pages offer nothing that adds (`team.status`): its writes are refused unless the route is marked
 `closedTeams` (or is a delete), and a page that writes when it's opened doesn't.
- Site copy names the team and who to ask through `teamCopy(team)` (`features/teams/team-copy.ts`; page scripts through
 `public/team.js`), never a name or a team written in: "the site owner" only comes from B12.1's ask name.
- Wording is Australian English for non-technical parents: plain words, no dashes as punctuation, no "e.g.",
 12-hour times ("6:40pm", `shared/time.ts`), "Round" not "Rd".

## 8. Browser scripts (`public/`)

- Plain ES modules with no build, framework or npm import (`upload.js`, `golive.js`, `watch.js`, `whep.js`,
 `ask.js`). `theme.js` is the one classic script, loaded in `<head>` so the theme is set before paint.
 `stream-sdk.js` is vendored and not edited.
- One job per module (`golive-check.js`, `golive-screen.js`, `golive-rec.js`, `golive-whip.js`, `golive-pause.js`,
 `golive-saving.js` …). A module that sets something up returns a small control object (`{ stop, pause,
 resume }`).
- Scripts find their elements by id or `data-` attribute that the matching view renders.
- API calls go through `api` in `upload-net.js` (a photo's form post through `apiForm`; Ask through `ask.js`): JSON
 envelope, `redirect: "manual"` so a signed-out user is told so, and `X-Courtside-Team` from `<html data-team>` so the
 site knows which team the page was for. No other script posts to the site (a rule; `golive-whip.js` and `whep.js`
 post to Stream). An answer that needs a reload (`needsReload`: `site_updated`, `team_changed`) stops the work and
 keeps an upload's saved progress; the maintenance page's 503 is waited out with its own words.
- Network steps retry with backoff and wait for the page to be visible and online before retrying (`upload-net.js`:
 `withRetries`, and `keepTrying` for a live recording's parts). A request that can stall has a timeout where the
 browser supports one (`timeoutSignal` in `upload-net.js`: 30 s for API calls, 2 minutes for a photo, 5 minutes for a
 live recording's part, 15 s for the live picture's WHIP/WHEP offer), and a timeout is retried like a dropped
 connection. What's retried is `withRetries`' rule: a photo takes `isNetworkTrouble` (a refusal, 403 included, is never
 sent again). So every API step a phone retries must be safe to repeat: asking again after it worked answers as done
 (`completeUpload` for an upload already finished, `endLive` once stopped), never a refusal the phone would show as a
 failure.
- `localStorage` is always inside `try/catch`. A best-effort `catch` logs `console.warn("<area>: …", err)`.

## 9. Security and privacy

- Every path is behind the site's own sign-in, static files included (`runWorkerFirst`); the only open paths are
 the sign-in's own pages and files (`features/signin/`, Request access included; `app/static-files.ts`) and the launch
 spinner. Identity comes
 only from the session cookie's row (`auth/session.ts`: the token's SHA-256 in `sessions`); the local dev email
 (`DEV_AUTH_EMAIL`) works only on localhost. Codes go only to an address on a team's list or an admin's, are hashed,
 last 10 minutes and five tries, and are limited per address, per IP address and site-wide
 (`auth/sign-in-service.ts`).
- A signed-in person who isn't an active member gets the 403 page. Roles come only from the `members` table.
- Non-GET requests must come from the same origin (`handle-request.ts` `assertSameOrigin`).
- Outside pages are fetched over HTTPS only, redirects included (`fixture-link.ts` `fetchHttps`); uploads are
 checked against their declared size before anything is read or signed (`import-routes.ts`, `upload-service.ts`,
 and a photo's `Content-Length` in `photos-routes.ts`).
- Photos leave the phone already redrawn (no EXIF, so no location: `public/photos.js`), and the Worker checks each
 is a whole JPEG and strips any metadata left (`photos/jpeg.ts`) before it's stored.
- The R2 bucket's CORS allows only `https://saints.example` (`infra/r2-cors.json`).
- Secrets live in the git-ignored `.secrets.*.json` files and `bindings.secret` in `cloudflare.config.ts`; they
 are never committed, logged or sent to the browser. R2 and Stream links handed to the browser are pre-signed
 and short-lived (`r2-presigner.ts`, `stream-tokens.ts`).
- Coaches' notes are visible to coaches only (`notes-routes.ts`); that is checked on every read and write.
- The admin area is for site admins only: `handle-request.ts` answers "Page not found" to anyone else, page or post,
 before any of its routes run.
- Emails go only to the site's admins and to a team manager about their own team, from the `admins` table or the team's
 members list (`admin-mail.ts`), never to an address a caller gives.

## 10. Tests

- Vitest on Node (`vitest.config.ts`). `tests/` mirrors `src/`: `tests/features/<feature>/`, `tests/platform/`,
 `tests/shared/`, `tests/jobs/`, `tests/app/`, `tests/auth/`, `tests/ui/`, `tests/public/`.
- D1 is the `node:sqlite` shim in `tests/helpers/d1-sqlite.ts`, with every migration applied; a batch is one
 transaction, and like D1, `run` and `batch` return rows for a SELECT or `RETURNING`. It doesn't model D1's
 limits, so the biggest writes have a test with `countingDb` (`tests/helpers/counting-db.ts`) bounding trips and
 bound values (PlayHQ season import, 100-game import, a season's roster Generate).
- Ports are faked in `tests/helpers/fakes.ts` (one `Fake…` class per port, `FakeImages` for Images).
 `createTestDeps(now)` builds `AppDeps` with the clock fixed at Thu 15 Oct 2026, 11am local unless a test passes
 another date.
- Route tests drive the real router with `makeClient(deps, email)` or `makeClient(deps, { email, team, adminTeam })`
 (`tests/helpers/app.ts`), which signs in as that email, sends the team cookies and a same-origin header, and says
 its team on every write as the pages do (`_team` in a form, else the header). Data comes from `seedGame`,
 `seedVideo` (`tests/helpers/seed.ts`), `seedTeam` (one of everything for a team, `tests/helpers/two-teams.ts`) or
 direct inserts; `aDayLater` (`tests/helpers/purge.ts`) runs the next day's purge.
- **Isolation** (`tests/isolation/`): two teams with one of everything each; every route the router lists (a route
 missing from `route-table.ts` fails the suite), as every role, both ways round: pages show nothing of the other
 team's and its ids are "not found"; no write changes any of its rows or media. A new route goes in the table.
- Test names are plain-English sentences about behaviour ("a family member can make a clip but only asks for one to
 be removed").
- Every role rule has a test that the role below gets a 403. Every bug fix comes with a test that fails without it.
- Browser scripts with logic that can run outside a browser are tested directly (`tests/public/golive-upright.test.ts`).

## 11. Checks, commits and deploys

- `npm run check` (worker types, `tsc` for `src` and `tests`, Vitest, `check-loc`, `check-rules`) passes before every
 commit. `scripts/check-rules.mjs` enforces the mechanical rules: no re-exports or `import * as` in `src/`, SQL
 only in `*-repository.ts` and `src/jobs/`, `team_id` in every query (§1, §5).
- `tsconfig.json` stays `strict`, with `noUnusedLocals` and `noUnusedParameters` (tests too): type errors are fixed,
 never silenced, and code nothing uses is deleted rather than left behind.
- Commit after each finished task with a clear message, and only after `npm run check` has passed (chain it: `npm run
 check && git commit`).
- **Branches**: a change is built on `feature/<name>` or `fix/<name>`, off `staging`. `staging`
 is the staging environment's branch (`npm run staging` deploys nothing else) and `main` is production, only ever
 fast-forwarded to `staging` by `npm run release`. A change is merged into `staging` when its checks pass, tested
 there, then released. Nothing is committed straight to `main`.
- **Staging first, then live**: everything goes to staging and is tested there before it goes live. Every change is put on staging with `npm run staging` (`docs/runbooks/staging.md`: the committed code,
 its own database and bucket, behind the same sign-in) and tested there, signed in: the pages the change touches,
 on a phone size, and Go live, an upload or Platform's **Run the 5-minute job now** when it touches those. Only then
 `npm run release`, of that same commit; a change after the test goes to staging again. A commit that changes nothing
 the site runs (docs alone) is the only exception. Staging adds to the release's checks below; it replaces none.
- **Every deploy goes through `npm run release`** (`scripts/release.mjs`), never plain `cf deploy`.
 It stops at the first of these that fails, and nothing skips one:
 1. the code is committed, on `main`;
 2. staging ran this commit, or one that differs from it only in docs, tests, notes, provisioning bodies or the
 maintenance Worker (`npm run staging` records what it put there as the git ref `refs/courtside/staging`, which the
 worktree and `main` share and no push sends; the changelog counts as the site's, as the site shows it);
 3. the computer is quiet (the 1-minute load average no higher than its cores, read before the release's own work),
 as the browser suite's camera timings slip when something else is running: nothing else runs during a release;
 4. `npm run check`;
 5. the browser suite;
 6. every migration applied to every database the config names (`cf d1 migrations list`);
 7. nothing uploading or streaming on the live site, in any team, for 15 minutes (D1's open streams and uploading
 videos, and R2's own list of each upload's parts);
 8. `CHANGELOG.md` has a newest line that isn't what the live site already runs;
 9. `cf deploy --dry-run`.

 Then it pushes the commit to `main` in the site's Cloudflare Artifacts repo (`courtside/courtside`), where Workers Builds
 runs `npm ci && npm run check` and deploys it (`npm run deploy:builds`) with that line as `--message` and the commit
 as `--tag`, and release follows that build until it has deployed. A push to
 `main` is a deploy, so only release pushes it, and only from `main`.

 `--maintenance` is the one variation: a release behind the maintenance page (`docs/runbooks/maintenance.md`). It
 refuses unless the page is on, and waits 2 quiet minutes rather than 15, as nobody can start an upload or a stream
 behind it; every other step runs. The maintenance Worker itself (`maintenance/`) deploys only through
 `npm run maintenance`, its tests and a dry run first. There have been no exceptions since the move
 to Courtside; the move's own steps (the rehearsals, retiring the original copy, the first deploy
 there) were the only ones, each after `npm run check` and `npm run e2e`.
- **The browser suite must pass before any deploy** (`npm run e2e`, `tests/e2e/`). It runs the real
 pages and `public/` scripts on Chromium as an Android phone, WebKit as an iPhone (no element full screen, as on game
 night) and Firefox, in the podman Playwright 1.56.1 image, against a stand-in for the site's API and storage, with a
 second browser answering the live picture. The pages carry the site's own Content Security Policy, so a script it
 would block fails there too. It began as the tests that found the game-night bug and covers:
 - every Go live path since: upright and sideways, full screen missing or stuck, a refused camera (in the browser and
 the Home Screen app), a refused or lost start, the screen kept on from Start camera, a camera that stops before or
 during the stream, Pause, Stop (a test, or saved with every part in order), parts that fail and are sent again,
 being signed out, the live connection dropping, Saving's last word, saving a recording from another page, and the
 layout upright and sideways;
 - the families' live player;
 - adding photos (turned upright, made smaller, no location; tried again, or skipped and listed), and saving a photo,
 a clip or a whole game on an iPhone (the share menu, or Files from Safari) while Android and Firefox download;
 - View as from the admin area, and Help's search for a team manager.

 A change to Go live, the live player or the recording gets its scenario in the suite first, failing until the change
 makes it pass.
- Each change gets two review passes of its diff before it's committed, the second a fresh read asking whether it can
 break Go live, an upload or a page. Layout changes get a WebKit check at iPhone
 sizes.
