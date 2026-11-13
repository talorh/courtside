# To do

Outstanding tasks only (done items are deleted). Ideas for later are in `docs/spec.md` ("Later, not now").

## 1. Bugs found in the 13 Nov 2026 scrub (fixes first, each on its own branch, tests first)

Things a club other than the example one would hit:

- [ ] The schema hard-codes the league. `migrations/0001_schema.sql` gives `games.competition` and
      `playhq_fixtures.competition` a CHECK of `'VJBL'`, while `CLUB.league` is configurable and `COMPETITIONS`,
      the game form and the PlayHQ form all offer it: a club whose league isn't called VJBL can't add a game or a
      fixture (every insert fails the CHECK). `scripts/dev-seed.mjs` writes `'VJBL'` too. Drop the CHECK on
      competition (the code validates it) or have the install write the club's league into it, and seed from
      `CLUB.league`.
- [ ] The club's currency is only half configurable. `exchange_rates.pair` is CHECKed to `'USD/AUD'`,
      `savedRate` and `saveRate` (admin/costs-repository.ts) read and write `'USD/AUD'`, and `costs-words.ts` labels
      the rate "AUD" and the chip "$AUD" whatever `CLUB.currency.code` says. Key the row and the labels by
      `CLUB.currency.code`.
- [ ] Watch games' eyebrow strips the example club's name: `library-page.ts` does `.replace("Saints ", "")` on the
      team's long name. Use `CLUB.name`.
- [ ] The game lines' "away" group is named for the example venue: `LINE_GROUPS.away` in `games/game-lines.ts` says
      "Saints Stadium" in its name and description. Use `CLUB.homeVenue`.
- [ ] Words that assume Australia or VJBL: the fixture reader's prompt says "(local, Australia)" (`fixture-link.ts`),
      Help says scores come "from PlayHQ for VJBL games" (`faq-basics.ts`) and "pick VJBL or Tournament"
      (`manager-games.ts`), the CSV reader says dates are Australian (`fixture-csv.ts`), and the Documentation's
      fixture section describes the VJBL season as the league's. Use `CLUB.league`, and a club setting for the date
      order, or say "day first".
- [ ] `todo.md` isn't in `SKIPS_STAGING` (`scripts/release-checks.mjs`), so a commit that only changes this file makes
      the release ask for another staging deploy. Add it.
- [ ] Check `INSTALL.md` tells a club to put its admins in `maintenance/cloudflare.config.ts` (`ADMIN_EMAILS` is
      `admin@example.com`); without that the maintenance page lets nobody through.

Shared with the upstream site (the same code):

- [ ] End game with nothing recorded ends the stream anyway (`stopBrowserLive` with no `recordingVideoId` takes the
      length as infinite). Treat no recording as a cancel, not an end.
- [ ] `join/*.mjs` is outside `scripts/check-loc.mjs` and the comment rules in `scripts/check-rules.mjs`. Add it.
