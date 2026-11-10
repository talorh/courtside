# 3. Cloudflare setup

*Courtside Documentation › The platform. [Contents](README.md).*

Everything runs in the club's own Cloudflare account (its id in `deploy.config.ts`), on the Workers Paid plan (US$5 a month) with the Images and Stream bundle (US$5 a month), and the domain registered through Cloudflare Registrar, renewing by itself, with DNSSEC on. Each piece below is one Cloudflare product; the Glossary says what each is in plain English, and the dashboard's left-hand menu is organised the same way (Compute for the Worker, Artifacts, Builds and Containers; Storage & databases for D1 and R2; Images & Stream; Email; the domain under its zone).

| Piece | What it is | What it's for |
| --- | --- | --- |
| Domain | `saints.example`, its zone id in `deploy.config.ts` | Registered at Cloudflare, renewing automatically, with DNSSEC on |
| Worker | `courtside` on the custom domain saints.example only | Every page, the API, the sign-in and the scheduled jobs. Its workers.dev address is off |
| D1 | `courtside`, in the region nearest the club | All the site's data, with 30 days of Time Travel to undo a bad change |
| R2 | `courtside-originals`, in the same region | Uploaded videos (deleted after 30 days, once Stream has its copy) and the nightly backups (kept 14 days, locked so nothing can delete or overwrite one before then) |
| Stream | The account's Stream | Playback copies, highlight clips, HD downloads and a live input for each streamed game. Signed links only |
| Images | Variants `thumb` (512 px) and `large` (1600 px) | Photos, private, shown only through signed links that last six hours |
| Workers AI | The `AI` binding | One model (Gemma 4, platform/workers-ai.ts): Ask Virtual Team Manager, which answers from the person's own Help page, the Documentation AI assistant, and reading PlayHQ fixture pages |
| Email Sending | From `alerts@saints.example` | Sign-in codes, welcomes, support tickets and the site's alerts |
| Email Routing | `security@saints.example` | Where security reports go (named on the site's security.txt), forwarded to the owner |
| Artifacts | Repository `courtside/courtside` | The site's code, hosted by Cloudflare in this account; a push to its main branch is a deploy (Where the code lives) |
| Workers Builds | On the courtside, courtside-maintenance and courtside-join Workers, branch main only | Checks every push to main again and deploys it; the two small Workers only when their folders change (Where the code lives) |
| Turnstile | Widgets `courtside sign-in` (saints.example) and `courtside staging sign-in`, managed | The sign-in page's check that a person is asking for a code, before any email goes |
| Maintenance Worker | `courtside-maintenance` | The Back soon page, which takes over saints.example only while it's switched on |
| Video joiner (Cloudflare Containers) | `courtside-join`: a small Worker whose Durable Object runs one container with ffmpeg. Instance type `standard-1`: half a vCPU, 4 GiB of memory, 8 GB of disk. One instance, wherever Cloudflare has room | Joins a carried-on live stream's parts into one video. The site reaches it through its JOINER binding and hands it signed links only. It has no address of its own, sleeps after ten quiet minutes and wakes when asked. Its image is in Cloudflare's registry, built by npm run join -- image |

### Where the Worker runs

The Worker's placement is set to a region in `deploy.config.ts` (`aws:ap-southeast-2`, Sydney, for a club in Melbourne). That's Cloudflare's way of naming a place: it runs the Worker in its own data centre nearest that cloud region. Nothing runs on AWS and nothing is billed there, and placement costs nothing extra: a Worker is charged by requests and CPU time wherever it runs.

> **Where the Worker runs.** A phone reaches the Cloudflare data centre nearest it, which runs the zone's protections, then the request goes to the Worker in its region, placed beside the database, so each of a page's queries takes a millisecond or two. Without placement the Worker runs wherever the request lands, so a phone sent through Singapore or the US by its network would send every query across the ocean.

Beside the database, because a page runs several queries one after another. Left to the default, the Worker runs wherever the request arrives, and when a phone network sends a local phone through another continent, every query crosses an ocean and a page takes seconds. Pinned beside the database, each query takes a millisecond or two and the person pays one hop to the region. The zone's protections still run at the data centre nearest the person, and every answer carries a `cf-placement` header (`remote-SYD`) that shows the placement working. Smart Placement would most likely settle on the same place, but only after watching traffic, and with a sample of requests left unplaced; naming the region is Cloudflare's advice for one database in one known place. Read replicas add nothing when everyone who uses the site is in one region.

### Protection at the edge

The site's own sign-in is the main gate. Before a request even reaches it, the zone's rules turn away attacks and anyone who isn't a real browser.

| Protection | What it does |
| --- | --- |
| DDoS protection | Network and HTTP floods are absorbed automatically, at high sensitivity |
| Managed WAF rules | Cloudflare's free managed ruleset blocks known attacks |
| Allowed methods | Only the request methods the site uses get through |
| Human check | A page load from someone not signed in gets Cloudflare's "verify you are human" check first. Never the API or static files. The sign-in form itself has Turnstile too (Signing in) |
| Rate limiting | More than 60 writes or API calls in 10 seconds from one address are blocked for 10 seconds |
| Bots | AI crawlers are blocked, and every page tells search engines not to index it |
| HTTPS | HTTP redirects to HTTPS, and HSTS (with preload) is sent on every answer |

### Email and DNS

The site sends from `alerts@saints.example` only, through Email Sending's binding, which refuses any other sender. Its SPF and DKIM records sit on `cf-bounce.saints.example`. DMARC reports go to Cloudflare's DMARC Management, which shows who sends mail as saints.example. The domain's own SPF and a DMARC policy of reject mean mail forged in saints.example's name is refused. Email Routing forwards `security@saints.example`.

### Keys and secrets

Secrets are stored on the Worker, never in the code. Most services are bindings and need no key at all.

| Secret | What it unlocks |
| --- | --- |
| `STREAM_API_TOKEN` | Every call to Stream: copies, clips, downloads, live inputs (token courtside-stream-clips, Stream Edit) |
| `STREAM_KEY_ID, STREAM_KEY_JWK` | Stream's signing key, to sign playback links without a call each time |
| `R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY` | Signed upload links for the originals bucket only (token courtside-r2-originals) |
| `CF_INSIGHTS_TOKEN` | Read-only analytics and billing: Platform's Cloudflare figures, the Worker's errors on Insights' Alerts, and for Costs Stream's minutes watched by video and Cloudflare's bill (token courtside-insights-read, with Billing Read) |
| `TURNSTILE_SECRET` | Checking the sign-in page's Turnstile tokens with Cloudflare (staging has its own widget and secret) |

### Cloudflare's own alerts

Cloudflare emails the owner when the month's spend passes US$50 and US$100, when the Worker starts failing in a new way, when it stops an HTTP DDoS attack, when the certificate changes, and if someone reports abuse. These work even if the Worker itself is down, alongside the site's own alerts on Platform and Insights.

### Outside the account

Costs reads the day's US dollar rate for the club's currency from Frankfurter (the European Central Bank's reference rate; free, with no key), a few times a day, and keeps the last one if it doesn't answer.
