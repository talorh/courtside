# 29. Glossary

*Courtside Documentation › Reference. [Contents](README.md).*

Cloudflare's words and the site's own, in plain English.

| Word | What it means here |
| --- | --- |
| Worker | A program that runs on Cloudflare's computers around the world, answering web requests. The site is one Worker, called courtside, with two small ones beside it: the video joiner and the Back soon page. |
| Binding | A Worker's connection to one of Cloudflare's other services (the database, the bucket, Images, AI, email), set up by name so no key is needed. |
| Secret | A key the Worker needs for a service that isn't a binding (Stream, the upload links, Cloudflare's figures), stored on the Worker and never in the code. |
| Placement | Where the Worker runs. Ours is pinned to the region in deploy.config.ts, beside the database, so each query is a millisecond or two away. |
| D1 | Cloudflare's database: one SQLite database holding every team's rows except the media itself. Time Travel can put it back to any minute in the last 30 days. |
| Migration | A numbered file that changes the database's shape (a new table or column). Each is applied once to each database, before the release that needs it, never edited afterwards, and adds beside what's there rather than changing it in place, so the live site runs on either. |
| R2 | Cloudflare's file storage (a bucket). Ours holds the original uploaded videos for 30 days and the nightly database backups for 14. |
| Lifecycle rule | A bucket's rule that deletes files after a time. Ours delete originals after 30 days, unfinished uploads after 7 and backups after 14. |
| Stream | Cloudflare's video service: it makes the playback copy of each game, cuts highlight clips, makes the HD download and carries live streams. Billed by minutes stored and watched. |
| Live input | Stream's endpoint for one live stream. Go live makes one for the game; the 3am job removes it once the stream is over. |
| Segment | One part of a Go live recording: the first is the video's own upload, each Carry on streaming after a closed page adds another beside it. The joiner puts them together. |
| Joiner | The video joiner, courtside-join: a small Worker that runs ffmpeg in a container on Cloudflare Containers, to join a recording's segments into one video. It's handed signed links and nothing else. |
| Container | A small Linux computer Cloudflare starts when asked and puts to sleep when idle, for programs a Worker can't run. Cloudflare Containers runs ours, the video joiner's, with ffmpeg in it. Billed by the time it's awake. |
| Durable Object | A Worker's single, named instance that Cloudflare keeps in one place. The joiner is one: it owns the container, so there's only ever one join running at a time. |
| RTMPS | The standard way a camera app sends its stream to a website: the app is given a server address and a stream key. Use an external app instead, the green button below Start camera, shows a game's, for an AI tracking camera's app. |
| Signed link | A link that works for a short time and only for whoever asked. Videos, clips and photos are only ever shown through them, so nothing is reachable without signing in. |
| Images | Cloudflare's picture service: it stores each photo privately and serves two sizes (a thumbnail and a large copy) through signed links. The bundle includes 100,000 photos. |
| Workers AI | Cloudflare's AI models. The site uses one (Gemma 4) for Ask Virtual Team Manager, which answers from the asker's own Help page, the Documentation AI assistant and reading PlayHQ fixture pages. Questions aren't stored. |
| Turnstile | Cloudflare's "are you a person" check on the sign-in page, usually invisible. A code is only emailed once it passes. |
| Zone | A domain on Cloudflare and its settings: saints.example, its DNS, certificate, and the protections below. |
| WAF | The web application firewall: rules at the edge that turn away attacks before a request reaches the Worker. Cloudflare's managed rules plus three of our own. |
| Managed challenge | Cloudflare's own check on a page load from someone not signed in: a verify-you're-human page when Cloudflare isn't sure. |
| Rate limiting | Too many requests from one address in a short time are blocked for a while: here, more than 60 writes or API calls in 10 seconds. |
| HSTS | A header telling browsers to use HTTPS for saints.example always. Set on the zone and sent by the Worker. |
| Email Sending | Cloudflare sending email for us from alerts@saints.example: codes, welcomes, tickets and alerts. Workers Paid includes 3,000 a month. |
| Email Routing | Cloudflare receiving email for saints.example and forwarding it: security@ goes to the owner. |
| SPF, DKIM, DMARC | DNS records that let other mail systems check an email really came from saints.example, and tell them to reject one that didn't. |
| Artifacts | Cloudflare's git hosting. The site's code lives there, in the account (Where the code lives). |
| Workers Builds | Cloudflare building and deploying the Worker from a push to the repository's main branch. |
| Preview | A copy of the Worker deployed under its own address with its own settings. Staging is a preview of courtside on its own database and bucket. |
| Cron | A schedule for running the Worker without a request: every five minutes, and at 3am local time. |
| Observability, Workers Logs | Cloudflare's record of every request and job run, with the Worker's own log lines, kept for a few days. Issues emails the owner when the Worker starts failing in a new way. |
| Notifications | Cloudflare's own emails to the owner: spend past US$50 and US$100, a new issue in the Worker, a DDoS attack, a certificate change, an abuse report. They work even if the Worker is down. |
| CSP | The Content Security Policy: a rule each page sends saying scripts and styles may only come from the site itself, so nothing injected can run. |
| Tombstone | A deleted row kept a while (90 days) so the site can say what happened and bring back a mistake, before it's cleared for good. |
| Release | The one way to deploy: npm run release, which runs every check and pushes main for Workers Builds to deploy. |
