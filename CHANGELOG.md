# Changelog

What changed on the site, newest first, as release notes under each date. The site's admins see it in the admin area
(Changelog), each day's changes under Features, Enhancements and Fixes.

Each line is one change: its kind (`[Feature]` something new, `[Enhancement]` something better, `[Fix]` something that
was wrong), the area in bold, then a plain sentence saying what changed for the people using the site ("Fixed an issue
where ..."). Every deploy adds its lines at the top of today's date, and the deploy (`npm run release`, then Workers
Builds) sends the top line, in plain words, as its message.

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
