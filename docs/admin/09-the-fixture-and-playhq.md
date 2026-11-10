# 9. The fixture and PlayHQ

*Courtside Documentation › How it works. [Contents](README.md).*

The Fixture is every game the team plays. Everyone sees it; only team managers add, change and delete games. Much of the site follows it: Upload and Go live offer its games, Watch games lists them, the roster gives each week with a game its duties, and PlayHQ's games get their final scores by themselves.

> **How games come into the fixture.** A PlayHQ team link is read from PlayHQ's feed and its games saved straight away, then checked again by themselves; any other public fixture page is read by Workers AI, and a spreadsheet is read in the Worker; those two are shown to check first, and only the ticked games are added. A game can always be added, changed or deleted by hand too. PlayHQ's games need no check page: they're PlayHQ's own, and later checks keep them in step.

### A game by hand

**Add game** takes the date and tip-off (the coming Friday at the team's usual tip-off, below, to start with), the competition (VJBL, Tournament or Practice match), the round, the opponent and the venue, and the game's **Video**: Live stream (the default), Record and upload after, or No video. No video takes the game out of Upload and Go live and off the roster's video duty, and can't be chosen while the game has a video. Any game can be edited or deleted later.

| Age group | Usual tip-off |
| --- | --- |
| U12 | 6:40pm |
| U14 | 7:40pm |
| U16 | 8:40pm |
| U18 | 9:40pm |

The usual tip-off comes from the team's code, boys and girls the same; an age between takes the younger group's (`usualTipOff` in `team-code.ts`). A new game starts there, and so does a game PlayHQ or a fixture page gives no time for.

### From PlayHQ

- **The link** is a team's public page on playhq.com, with /org/ and /teams/ in it; its last part is PlayHQ's id for the team. A My teams link (from a parent signed in to PlayHQ, with their own id in it) is refused and never stored. A PlayHQ fixture is VJBL or a tournament, never a practice match.
- **The feed** is not PlayHQ's official API, which needs a key PlayHQ issues to clubs. It's the same public feed playhq.com's own team pages use: `api.playhq.com/graphql`, asked for `discoverTeam` and `discoverTeamFixture`, sent with Origin: https://www.playhq.com and a `tenant` header naming the sport (example-association). If PlayHQ changes it, a check fails and says so, and nothing in the fixture changes.
- **What comes in** for each game: its date, its tip-off (the team's usual one until PlayHQ sets one), its round (VJBL's "Round 4" shows as 4; a tournament keeps PlayHQ's name, such as "Semi Final"), the opponent shortened ("Hillcrest U12 Boys 3" becomes "Hillcrest 3"), and the venue with its court. A game PlayHQ lists twice comes in once.
- **Adding it** saves the fixture and all its games at once, with no check page: they're PlayHQ's own. A game added by hand on the same day in the same competition is taken over, not doubled, and games of this fixture deleted here earlier come back if they have no video. The team's name on PlayHQ is kept as the fixture's name.
- **No video for these games**, ticked when adding (a tournament that doesn't allow filming), marks every game the fixture brings in, now or later, No video. Each fixture's No video and Allow video switch changes its games, and the ones it adds later, either way.

### How PlayHQ is kept in step

> **Keeping a PlayHQ fixture in step.** The 5-minute job finds each PlayHQ fixture due a check, reads the team's fixture from PlayHQ's feed and matches each game to one already here; new games are added, changed ones updated, and ones PlayHQ dropped are marked, never deleted. Checks stop by themselves, and a failed read changes nothing. A game deleted here stays deleted on later checks. A failed read is saved on the fixture, and team managers see it on every page until a check works.

| Fixture | Checked | Stops |
| --- | --- | --- |
| The league (VJBL) | every 8 hours | six weeks after its last game, so rounds after a break and finals still come in |
| Tournament | every 8 hours until it starts, then every hour from its first game's day to the end of its fourth (or its last game's day, if later) | after that last day: finals appear on the team's fixture as they're made, sometimes hours before they're played |
| One that never gets a game | every 8 hours | 60 days after it was added |

- **Each check** is one call to the feed, from the 5-minute job's share of 200 outside calls a run; a check that finds the calls used up waits for the next run, which isn't a failure. Matching is by PlayHQ's game id, deleted games included, so a game a team manager deleted stays deleted. A game PlayHQ no longer lists (a grading game, say) is marked "Not on PlayHQ any more" and never deleted. An empty answer (a fixture not out yet) marks nothing.
- **Check now** on the Fixture reads it at once. **Remove** stops the checks and keeps the games, no longer linked. The Fixture says when each was last checked and the day its checks stop.
- **A failed read** (PlayHQ down, changed, or turning Cloudflare away) is saved on the fixture with its reason, and every team manager sees "PlayHQ couldn't be read" at the top of every page until a check works. A fixture that keeps failing stops on the same days as one that works.

### From any fixture page, read by AI

> **Reading a fixture page with AI.** The team manager pastes a fixture page's link; the Worker fetches the page securely, cuts it down to its text, and sends that with the team's names to Workers AI, which answers with the team's games as JSON; the Worker checks every game and shows them to check. Nothing is added until the team manager ticks the games. A page that draws its fixture with JavaScript after it loads has no games in its text, and the site says so.

- **Fetching:** the link is asked for over https (an http:// link is asked for securely), following up to five redirects, each one https too, for 15 seconds, and only the first 2 MB is read. The page must be public: if it doesn't open in a private window, the site can't read it either. A link to a file rather than a web page is pointed to the spreadsheet instead.
- **Cutting it down:** scripts, styles and the page's head are dropped, table cells are kept apart with a "|" so a row stays a row, and the first 30,000 characters (about 8,000 tokens) go on. A page with almost no text draws its fixture with JavaScript after it loads, and the site says so rather than asking the model.
- **The model:** Workers AI's `@cf/google/gemma-4-26b-a4b-it`, the site's one model (the same as Ask's), with its thinking off, in JSON mode (a schema of date, time, round, opponent and venue for each game), at temperature 0, with up to 4,000 tokens to answer in: under a hundred of the account's free daily neurons a page. It's told today's date in local, so a page that leaves out the year gets the one that puts the game closest after today, and the names a draw may give the team: b12.1 is "Saints U12 Boys 1", which a page may write "Saints U12 Boys 1", "Saints U12B1", or just "Saints 1" on a page for U12 Boys alone. Its instructions say to list only that team's games, to leave out byes, results, ladders and other teams' games, and: Never make up a game, date or time.
- **Checking its answer:** an answer that isn't the JSON asked for is refused (try again, or use a spreadsheet), and at most 200 games are taken. A game without a real date is left out and listed; one without a clear tip-off gets the team's usual tip-off and is listed to fix; no opponent is "TBC"; the round, opponent and venue are cut to 40, 80 and 120 characters.

### From a spreadsheet

A CSV, up to 300 KB, one game a row under a header row naming the columns in any order: Date, Time, Competition, Round, Opponent, Venue and Video (other names work too, such as Against or Court). Dates are Australian, day first (31/10 is 31 October), a semicolon works in place of a comma, and an Excel file is refused with how to save it as CSV. The Fixture has a sample to download.

### Checking before adding

Games from a page or a spreadsheet are shown first, sorted by date, with every problem listed. Games already in the fixture (the same day and time, or the same day against the same opponent) are left out, and at most 100 are added at once. The list travels in the form itself, so nothing is stored in between, and only the ticked games are added, in one batch, skipping any that turned up in the fixture meanwhile.

### Final scores

> **A PlayHQ game's final score.** During the game's hour it says In progress; once it's over the 5-minute job asks PlayHQ every run for two hours, then about hourly until three days after tip-off, then stops; a FINAL result with both scores is entered, never over a score a team manager typed. Results usually go into PlayHQ at the final buzzer, so most scores arrive within minutes. A team manager can enter or fix any score once the game has started.

During a game's hour it says In progress. For a game from a PlayHQ fixture, the 5-minute job then asks PlayHQ for its result (`discoverGame`), and enters the score only when PlayHQ's status is FINAL with both scores in, and never over one a team manager typed. It stops 3 days after tip-off. A failed ask is logged and tried again later, on the same back-off; it never fails the run. A team manager can enter or fix any game's score once it has started, and any member can hide scores everywhere for themselves.

| Table | Holds |
| --- | --- |
| `games` | Every game, with its PlayHQ game id and fixture when it came from one, when PlayHQ stopped listing it, when it was marked No video (and whether the site did, a week on with nothing filmed), when a team manager last set it back to Video (it waits a week from then), and when PlayHQ was last asked for its score |
| `playhq_fixtures` | Each PlayHQ team added: its link and PlayHQ id, competition, name, No video, whether it's still checked, when it last was, how many games, and the last error |
| `game_scores` | Each game's final score, whether a team manager or PlayHQ gave it, who entered it and when |
| `game_lines` | A team's own game lines, a row for each group its team manager changed (one line a row); a group with no row uses the club's |
