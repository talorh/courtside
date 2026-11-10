# Changelog

What changed on the site, newest first, as release notes under each date. The site's admins see it in the admin area
(Changelog), each day's changes under Features, Enhancements and Fixes.

Each line is one change: its kind (`[Feature]` something new, `[Enhancement]` something better, `[Fix]` something that
was wrong), the area in bold, then a plain sentence saying what changed for the people using the site ("Fixed an issue
where ..."). Every deploy adds its lines at the top of today's date, and the deploy (`npm run release`, then Workers
Builds) sends the top line, in plain words, as its message.

## 11 Nov 2026

- [Fix] **Look:** Fixed an issue where the coaches' clipboard, the Game Break card, video backgrounds, the admin charts and the Excel exports kept fixed greens: they now take the club's colours from src/club.ts.
- [Enhancement] **Roster:** The match day message names the club's own uniforms: team managers pick one and the message says to pack the other, or a club with a reversible singlet gets just the one and no choice.
- [Enhancement] **Help:** Every screenshot now shows the example club's pages, the squad is named after the 1992 Dream Team, Safari's bars are drawn rather than photographed, and the AI camera page says XbotGo and Trackd are two examples of many as they stood at the time of writing.
- [Feature] **The site:** Courtside's first release: private game video and photos for a basketball club's teams, live streaming from a phone's browser, highlight clips, the fixture, the roster and an admin area, all on Cloudflare.
