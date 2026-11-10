# Docs

What's in this folder, and which files are kept up to date with the site. If you're new, start with the repo's
`README.md`, then `spec.md` (what the site does) and `architecture.md` (how it does it). Setting a club up is
`../INSTALL.md`.

## Kept current

These change in the same commit as the code they describe.

| File | What it's for |
| --- | --- |
| `spec.md` | What the site does and why: the source of truth for how it behaves, page by page, with the settled decisions |
| `architecture.md` | How it works, with diagrams: a request's path, uploads, Go live, photos, the jobs, the support desk and monitoring, the admin area, the data model, configuration, and what was turned down |
| `admin/` | The admin area's Documentation (`/admin/docs` on the site) as Markdown, one file a section, written by `npm run docs` from `src/features/admin/views/docs-text-*.ts`: the current state of the site and its Cloudflare setup, for people. The deployment guide is its Environments and releases section; a test fails while the export is stale |
| `development-standards.md` | The rules the code follows, each taken from the code. §11 is how changes are checked, put on staging and deployed |
| `cloudflare-standards.md` | The rules for how the site uses Cloudflare |
| `child-safety.md` | The site against the Child Safe Standards used in Australian junior sport, reviewed each season and with each new feature |
| `runbooks/cloudflare-setup.md` | Setting up and checking each Cloudflare piece, deploys, rollback and restore, local development, the video joiner and the club's branding |
| `runbooks/staging.md` | Staging: what it is, what's its own and what it shares with the live site, and how to use it |
| `runbooks/maintenance.md` | The maintenance page: switching it on and off, a release behind it, and emergencies |
| `agent-setup.md` | An AI coding agent's instructions: checking it's set up, what to read, how to work, what needs an admin's yes, what to do when something goes wrong. The admin Documentation shows it as it is, with a Copy button |

`../AGENTS.md`, at the top of the repo, holds the hard rules every agent and person follows. `../CHANGELOG.md` has a
line for every deploy, and the admin area's Changelog page shows the same lines.
