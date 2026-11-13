# Changelog

What changed on the site, newest first, as release notes under each date. The site's admins see it in the admin area
(Changelog), each day's changes under Features, Enhancements and Fixes.

Each line is one change: its kind (`[Feature]` something new, `[Enhancement]` something better, `[Fix]` something that
was wrong), the area in bold, then a plain sentence saying what changed for the people using the site ("Fixed an issue
where ..."). Every deploy adds its lines at the top of today's date, and the deploy (`npm run release`, then Workers
Builds) sends the top line, in plain words, as its message.

## 14 Nov 2026

- [Feature] **Sign in:** Someone who can't get in can now raise an access request from the sign-in page (Can't get in? Ask your team manager, or raise an access request here): their name, team and email open a ticket for the site's admins, who add them to the team's list.
- [Enhancement] **Help:** What is the aim here? now says the code is open source, with the GitHub link (github.com/talorh/courtside), and that there's no desire to make money from any of it.
- [Enhancement] **Setup:** A club can put the site on a subdomain of its own domain (courtside.yourclub.org) when that domain is already on Cloudflare, though a domain of its own is still recommended. The install guide's new section 8 says what changes, every zone rule now matches the site's own hostname alone, and the Documentation, Costs and Platform read right on a subdomain.
- [Fix] **Setup:** Fixed an issue where a club whose league isn't called VJBL couldn't add a game or a PlayHQ fixture, and whose currency isn't Australian dollars couldn't keep its Costs rate: the database named both. It now takes the club's own, from its club file, and the example data, Help, the Documentation and the fixture readers say the club's league, venue, name and currency rather than the example club's.
- [Fix] **Setup:** The install guide now says to put the club's admins in the Back soon page's own list (ADMIN_EMAILS in its config), without which nobody gets through while maintenance is on, and a change to todo.md alone no longer asks for another staging deploy.
- [Fix] **Platform:** Fixed an issue where the video joiner's code was outside the line-length and comment checks every change runs. The checks now cover it.
- [Fix] **Go live:** Fixed an issue where End game tapped before the camera had started ended the game's stream for good, so the game couldn't be streamed until the 5-minute job tidied it up. Nothing recorded now counts as a test, and the game is free to go live again at once.
- [Fix] **Platform:** Fixed an issue where a failure in one of the 5-minute job's closing checks ended the run before its failures were written to the Log's Problems. Each check is now one more failure of the run, and every failure reaches the Log.
- [Fix] **Admin:** Fixed an issue where Insights counted a Go live recording the site saved late as stuck the moment its processing began, as the count ran from the Go live tap. It and Right now's processing times now run from when processing began.
- [Fix] **Fixture:** Fixed an issue where adding a PlayHQ fixture could pair two games added by hand on the same day (a tournament) the wrong way round, so each took the other's details. A hand-added game now takes the PlayHQ game at its own time first.
- [Fix] **Admin:** Fixed an issue where View as coach showed the team's coaches' notes. The notes are the coaches' own, so View as leaves them out and says so on the game page.
- [Fix] **Sign in:** Fixed an issue where something typed into the sign-in page's email field that wasn't an address was kept as typed in the sign-in records the admin Log shows. Anything that isn't an address is now stored masked, as the logs already did.
- [Fix] **Fixture:** Fixed an issue where Delete on a game that has a video was refused as it should be, but had already closed a Go live stream set up for the game. The game's video is checked first now, and the stream is only closed when the game is deleted.
- [Fix] **Platform:** Fixed an issue where a video whose HD download Stream couldn't make failed the 5-minute job every run from then on, keeping the job alert raised. The failure is now noted on the video and logged once, Stream is asked once more, and the job moves on.
- [Fix] **Go live:** Fixed an issue where a game whose page was closed just as Saving appeared waited a day before the site saved it. A recording nothing more comes from is now saved half an hour after End game, or after 12 quiet hours when the page died mid-game, so the video is in Watch games the same night.
- [Fix] **Platform:** Fixed an issue where the Friday check never ran: Cloudflare numbers the days of the week from Sunday as 1, so its triggers fired a day early and were skipped as not a Friday. It now runs at 6am every Friday in the club's time zone.

## 12 Nov 2026

- [Fix] **Fixture:** Fixed an issue where a game whose only video had been deleted, such as a live recording that was lost, stayed Waiting for video for good. It now goes to No video a week after tip-off like a game nobody filmed, unless a video is uploaded by then.
- [Feature] **Fixture:** League games now carry their phase of the season: grading phase 1, the crossover game, grading phase 2 or the championship season (the labels are the club's). PlayHQ fixtures set it from each game's grade, a spreadsheet's Phase column and the AI reader take it in words, and the game form has a Phase choice. It shows as a tag beside the league on the Fixture and Watch games, and a grading or crossover game's title says it, since each phase's rounds start from 1 again. A grading game keeps its phase after PlayHQ drops it.

## 11 Nov 2026

- [Feature] **Platform:** The Friday check runs at 6am every Friday and looks ahead to the weekend's live games: Stream answering with minutes to spare, each game's Go live input, the video joiner, the 5-minute job and the other alerts. Anything wrong raises a ticket for the admins; Run the Friday check now on Platform asks the same any day.
- [Feature] **Changelog:** A heatmap at the top of the Changelog shows how much went out each day over the last twelve months, a square a day like a contribution graph, with the busiest day in words; the Features, Enhancements and Fixes chips narrow it to one kind.
- [Fix] **Look:** Fixed an issue where the coaches' clipboard, the Game Break card, video backgrounds, the admin charts and the Excel exports kept fixed greens: they now take the club's colours from src/club.ts.
- [Enhancement] **Roster:** The match day message names the club's own uniforms: team managers pick one and the message says to pack the other, or a club with a reversible singlet gets just the one and no choice.
- [Enhancement] **Help:** Every screenshot now shows the example club's pages, the squad is named after the 1992 Dream Team, Safari's bars are drawn rather than photographed, and the AI camera page says XbotGo and Trackd are two examples of many as they stood at the time of writing.
- [Feature] **The site:** Courtside's first release: private game video and photos for a basketball club's teams, live streaming from a phone's browser, highlight clips, the fixture, the roster and an admin area, all on Cloudflare.
