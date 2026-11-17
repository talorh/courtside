# Something's broken: finding out what, fast

For a problem on the live site, often a game night with families watching. Everything here only reads. The remedies
(the maintenance page, rolling back, Time Travel, a restore) are in `cloudflare-setup.md` §5 and `maintenance.md`, and
each needs the admin's yes. Fixes still go through staging first; on a game day only a fix goes live.

## 1. What the site already knows (two minutes)

1. **The admin area's Insights**: whether the site is all right, each check as a light. **Alerts** says what's raised.
2. **The Log, Problems** (`/admin/log?show=problems`): every failure as a line, with its team, person and device: a
   request that failed (5xx), each job failure (with its step and record: `processing, video 46, game 38: Stream GET
   … failed (500): 10001 …`), an email that didn't go, Stream, PlayHQ or Images not answering, and what phones report
   (Go live's camera lost, an upload stopped). Filter to the team.
3. **The Log for the game**: Go live's events (`live_started`, `live_saved`, `join_failed`, …) on the team's lines.
4. **Someone sent a screenshot of an error page?** It shows `Reference <16 characters>`: the request's Ray ID. Step 2's
   `--ray` finds its line.

## 2. The Worker's logs: `npm run logs`

Workers Logs keeps every request, every job run and every log line for 7 days. `npm run logs` reads them (newest first,
in the club's time zone; read only). By default it shows the last hour's warnings and errors:

```bash
npm run logs                                  # the last hour's warnings and errors
npm run logs -- --since 3h --team u14-2026    # one team's, further back
npm run logs -- --event job_failed --since 1d # one kind of line
npm run logs -- --game 38 --all --since 6h    # everything that names a game (or --video 46)
npm run logs -- --ray 8f1c2a3b4c5d6e7f        # the line behind an error page's Reference
npm run logs -- --request <id> --all          # every line of one request or job run (each line ends with its request)
npm run logs -- --joiner --all --since 1d     # the video joiner (<worker>-join): joins, its container's stops
npm run logs -- --staging --all --since 30m   # staging's lines (its own Worker, staging-<worker>; never in the live site's)
```

Each line: when, level, event, team, its other fields (ids, the error), and its request. The events that matter most:

| Event | Level | What it means |
| --- | --- | --- |
| `request_error` | error | A request answered 5xx: method, path (it names the game or video), member, Ray ID, status, the error and its cause (Stream's or Images' own answer), and the stack |
| `request_refused` | warn | A signed-in person's request refused (403, 409, …; not a plain 404 or a 401): its path, status and code, and whose (never its message, which can name a person) |
| `cron_run` | log, error | Each run of a job: which trigger, how long, and whether it failed and how many things in it |
| `job_failed` | error | One failure in a job run: its job, team, step (`live`, `processing`, `clips`, `retention`, `playhq`, `game_check`, `backup`, …), the record's ids (`videoId`, `gameId`, `liveStreamId`, `liveInputUid`, `clipId`, `photoId`, `fixtureId`), the error, its cause and stack |
| `sync_team`, `sync_videos`, `daily_run` | log | What each team's turn of the 5-minute job did, the run as a whole, and the night's job (which steps failed) |
| `join_failed` | error | A game's parts didn't join this try (`videoId`, `gameId`, tries, why: signed links are cut to their address) |
| `live_status_failed` | warn | Stream didn't say whether a phone is still streaming: Save and Delete went on as if it weren't |
| `live_input_unreachable`, `live_input_missing` | error | A game's live input Stream can't reach, or no longer has |
| `golive_events` | log | What a filming phone did (its last 40 events): its camera, sound, live connection (`live reconnecting: <why>`: Stream refusing, no answer, the connection failing or dropping) and recording, and End game's save failing; a problem among them is also in the Log. Notes the phone couldn't send go with its next sending |
| `watch_events` | warn | A family's player in trouble (`kind` live or video): the live connection failing, the picture stopping, Stream's player failing, and `picture back after Ns`; with who and their device. Before the page's first picture it's `waiting: …`, then `first picture after Ns` (a page opened before tip-off), so it's not read as an outage |
| `phone_problem` | warn | An upload or photos that stopped on the phone, or an upload page closed mid-upload: `progress` (`pct`, `mb`, `minutes`) and the status, never the words (the Log has those) |
| `video_failed`, `video_slow` | error, warn | Stream couldn't process a video (`videoId`, `gameId`, `streamUid`, Stream's reason), or is still on it an hour in (Stream's `state`) |
| `live_app_live`, `live_app_back`, `live_app_recording_failed` | log, log, warn | A camera app's stream (RTMPS) noted live, back after dropping out (`goneMinutes`), and a part Stream couldn't record (a gap in the saved video) |
| `turnstile_key_refused` | warn | Turnstile refused the site's own secret (a 401, 403 or 404, or a `*-input-secret` code: the key wrong or revoked, or the widget deleted), so every sign-in and access request is refused until `TURNSTILE_SECRET` is fixed; also a Site problem in the Log |
| `signin_email_failed` | error | A sign-in code's email didn't go (the address masked; `bounced` when Email Sending won't send to it) |
| `problem_log_failed` | error | A problem couldn't be written to the Log (D1 failing): what it was is on this line instead |
| `joiner_stopped`, `joiner_container_error` | log, error | The joiner's container stopped (a crash when it exits by itself with an error code), or failed |

### A live stream or an upload

- **Families can't watch:** `npm run logs -- --game <id> --all --since 3h`. The filming phone's `golive_events` say
  whether it was sending (`live live`, `live reconnecting: <why>`, camera or sound lost); each family's `watch_events` say
  what their player saw. Every family failing at the same time while the phone is fine points at Stream (its status
  page, and Stream's live input in the dashboard); one family alone, at their connection or device; the phone
  reconnecting, at the venue's signal (`TypeError`, `TimeoutError`) or Stream (`refused (HTTP 5xx)`). A camera app's
  stream: `live_app_back` lines say when it dropped out.
- **An upload stopped:** the Log's Problems has it with the person and device, and `phone_problem` says how far it got.
  The site's own refusals of it are `request_refused` lines (`--team`, path `/api/uploads/…`), its failures
  `request_error`.
- **A video stuck processing or failed:** Insights' Videos processing light; `job_failed` lines with `--video <id>`,
  and `video_failed` for Stream's reason.

## 3. Traces: where the time went

Every request and job run is traced (`observability.traces` in each Worker's config): each D1 query, R2 call, Stream or
PlayHQ fetch and the joiner's Durable Object, with its timing and outcome. Kept 7 days. In the dashboard: Workers &
Pages, the site's Worker, Observability, Traces; a log line's trace is the same request (its Ray ID, or the trace id in the
line's details in the dashboard). Use it when something is slow or a step hangs, not only when it fails.

## 4. Cloudflare's own view

- **Issues** (Observability, Issues): the Worker's failures grouped. Cloudflare emails the owner when a new one starts,
  even when the Worker itself is down.
- **Stream** (the dashboard's Stream, Live inputs): whether a game's input is connected (`liveInputUid` in the lines).
- **D1** (the site's database, Metrics and Query insights): slow or failing queries.
- **Builds**: `cf builds list --worker <tag>` and `cf builds logs <id>` (`docs/agent-setup.md` §6), for a deploy that
  went wrong.

## 5. Then

Say what's broken, since when, who it affects, and what you'd do. A remedy needs the admin's yes; a code fix goes
through a branch, staging and `npm run release` like any other, game day or not.
