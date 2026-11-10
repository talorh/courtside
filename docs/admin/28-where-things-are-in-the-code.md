# 28. Where things are in the code

*Courtside Documentation › Changing it. [Contents](README.md).*

| Folder | What's in it |
| --- | --- |
| `src/app` | The request's path: routing, the current team, errors |
| `src/auth` | The sign-in: codes, sessions, roles and admins |
| `src/features` | Each part of the site in its own folder (games, videos, photos, roster, support, admin and so on), with its routes, logic, queries and pages |
| `src/platform` | A small client for each outside service: Stream, R2, Images, Workers AI, email, PlayHQ |
| `src/jobs` | The 5-minute and 3am jobs |
| `join` | The video joiner: its small Worker (index.ts), the container's Dockerfile and the Node programs that run ffmpeg in it, and the image's tag |
| `maintenance` | The Back soon page's own small Worker |
| `public` | Stylesheets and the page scripts, as plain files with no build step |
| `migrations` | The database's numbered changes |
| `infra` | The Cloudflare settings as files: R2's rules, Images' variants, the zone's rules |
| `tests` | Unit tests, two-team isolation tests for every route, and the browser tests |

Changes flow one way: routes call services, services call repositories, repositories query D1. Each file stays small (140 lines or fewer), and every query names its team. The README and the docs folder in the repository go into more detail.
