# Changelog

What changed on the site, newest first, as release notes under each date. The site's admins see it in the admin area
(Changelog), each day's changes under Features, Enhancements and Fixes.

Each line is one change: its kind (`[Feature]` something new, `[Enhancement]` something better, `[Fix]` something that
was wrong), the area in bold, then a plain sentence saying what changed for the people using the site ("Fixed an issue
where ..."). Every deploy adds its lines at the top of today's date, and the deploy (`npm run release`, then Workers
Builds) sends the top line, in plain words, as its message.

## 16 Nov 2026

- [Enhancement] **Branding:** The example club's logo is new: a ball on fire ripping through the hoop and swinging a burning net, in a ring of the club's colours, on the Home Screen icon, the launch screen, the Full time and win cards and the court.
- [Fix] **Insights:** Fixed an issue where the video storage alert stayed up for up to an hour after more Stream minutes were bought: opening Insights or Platform, or Check again, now checks Stream there and then.
- [Enhancement] **Costs:** A new team's season is now estimated from the other teams' own games (their length, minutes watched and file sizes, averaged game for game) until it has three of its own, instead of a fixed guess that overstated watching several times over; the team's Costs page says which it uses.
- [Enhancement] **Platform:** The video storage alert now scales with the number of running teams: it warns under 300 minutes left a team and is urgent under 150 a team, so it gives the same notice with four teams as with one; urgent now says it's too low for a game night.
- [Enhancement] **Teams:** A team's season now shows as 2026/27 on its Edit page too, and a team closes by itself once its season's videos and photos are due, at the end of 31 December of the year its season ends; Teams says when, and End season still closes one earlier.
- [Enhancement] **Fixture:** A finals game now has a subtle gold border wherever it's listed: on Watch games, Home and the Fixture.
- [Feature] **Watch games:** The first time you open a game the club won, once its video is ready, a win pop-up with confetti in the club's colours shows for about a second. It never says the score, and never shows to anyone who hides scores.
- [Enhancement] **Costs:** Every month's teams now add up to its bill, last season's kept footage and next season's early teams included; next season's teams join Team budgets in their season's first month, and spent months are kept as they were.
- [Enhancement] **Photos:** A photo sent again on a weak signal is added once, not twice; pinch to zoom a photo; the Photos pages read only the photos they show.
- [Enhancement] **Go live:** After End game with minutes still on the phone, the site waits up to 12 hours for them before saving by itself (30 minutes when nothing's left), and Help says to choose an AI camera's app again and copy its key afresh after a test.
- [Enhancement] **Sign-in:** Request access takes 10 tries in 15 minutes from one internet address, and each try is in the Log.
- [Fix] **Photos:** Fixed an issue where swiping to another photo and back showed the other photo's caption and buttons, so Delete photo could delete the wrong photo; Keep it works again after a swipe, the photo stays centred when the phone is turned, and see-through pictures are added on white.
- [Fix] **Go live:** Fixed an issue where End game soon after Carry on streaming could throw the game away as a test, and where a page closed while End game saved could leave the recording unable to be saved; footage kept on the phone is cleared once its recording is saved.
- [Fix] **Watching live:** Pausing the live player no longer brings up "will resume shortly", and a tap on the picture plays it again.
- [Fix] **Upload:** An upload now keeps going through a long signal drop, and says in plain words if it stops; deleting or moving a video gives the game another week for its new upload instead of setting it to No video.
- [Fix] **Roster:** Saving an earlier week no longer makes up duties for it.
- [Fix] **Fixture:** A double tap on Add game adds the game once, a scored game no longer shows Live stream beside Complete, a PlayHQ game deleted here stays deleted, and a game PlayHQ moves later waits for its video again.
- [Fix] **Coaches' notes:** On a closed team coaches still see their notes and their Excel download; on a clip's page note times are plain text.
- [Fix] **Platform:** Fixed an issue where Run the game check now's answer was wiped after 5 minutes; a steady trickle of server errors no longer emails every hour, and an alert whose ticket couldn't be saved opens it on the next check.
- [Fix] **Insights:** Uploads failed opens the right Log lines, Check again checks again, and the teams table leaves test runs out.
- [Fix] **Teams:** A team past its season's date is deleted only tonight with its code typed, never at once; its season stays once it has photos, and a ticket's emails go only to a current team manager.
- [Fix] **Sign-in:** Send a new code is ready at once when your code has run out, and a closed team's People list can't be edited by mistake.
- [Fix] **Backups:** A note with a line like a row no longer stops the nightly backup, and a second run the same day counts as done; one team's deletion failing no longer holds up another's.
- [Enhancement] **Behind the scenes:** Every post is capped at 2 MB, the Documentation assistant says why it refused a question, the release pushes the commit it checked, and the docs and Help brought up to date.
- [Enhancement] **New install:** The first deploy makes the admins named in deploy.config.ts (firstAdmins) the site's first admins, and until the first team is onboarded every page opens the admin area, where Insights says how to get started.

## 15 Nov 2026

- [Fix] **Insights:** Fixed an issue where test runs counted in the weekly charts: a video thrown away as a test, replaced, or deleted within a day of being made no longer counts, with its stream, views and clips, and "live streams open" counts only streams under way, not a Go live page just opened.
- [Fix] **Platform:** Fixed an issue where Run the game check now stopped that week's games getting their check 8 hours before tip-off; a game moved later is checked again, and the check's alert clears once its game is over.
- [Fix] **Go live:** Delete it and start again now asks first, Save what was recorded keeps the screen on, and a recording that has only just started is never deleted or saved away from another phone while its first part is still going up.
- [Fix] **Go live:** Fixed an issue where one team dealing with its stuck video closed the admins' joiner ticket while another team's game was still stuck, and where Carry on streaming could fail for good after a save.
- [Fix] **Fixture:** Fixed an issue where a PlayHQ fixture stopped checking itself if PlayHQ listed no games for a while between phases; a No video fixture now marks a game it takes over as No video, the Fixture says No video to everyone, and a spreadsheet's problem rows count blank rows.
- [Fix] **Roster:** A tournament weekend now shows All duties this week as Help says, alongside Scorers only.
- [Fix] **Costs:** Fixed an issue where next season's costs couldn't be opened once a team was onboarded for it.
- [Fix] **Closed teams:** Fixed an issue where a team closed tonight said its videos stayed a day longer than they do; removing a team's last team manager says why instead of failing.
- [Fix] **Maintenance:** An admin can now sign in while maintenance is on, and the release waits for a carried-on recording still uploading.
- [Fix] **Pull to refresh:** Fixed an issue where the pull-to-refresh hint was hard to read in the dark theme.
- [Enhancement] **Behind the scenes:** Insights counts the site's own tickets and only removal requests a team manager can see, sign out and Ask give up on a stalled signal, clearer error words, the Documentation brought up to date, and tidier comments and dead code.
- [Enhancement] **Which team?:** A site admin now has Open Admin beneath every team, so switching teams on a phone can go straight back to the admin area.

## 14 Nov 2026

- [Fix] **Support:** Fixed an issue where an access request's ticket said it would resolve itself and didn't show who asked: it now shows their name, team and email, with Copy email, and says to write to them from your own email.
- [Enhancement] **Platform:** The game check now runs for each live game 8 hours before tip-off, in place of 6am on Fridays, and checks again every hour while something's wrong, so a fix clears it by itself. Platform's button checks the week's live games.
- [Fix] **Video joiner:** Fixed an issue where a joiner whose disk filled up part way through a game's join stopped altogether: the join now fails and is tried again, as any failed join is (rebuild its image: npm run join -- image).
- [Fix] **Copy buttons:** Fixed an issue where tapping Copy twice quickly left it saying Copied.
- [Fix] **Help:** Fixed an issue where a link to Help with a stray % in it stopped the search box showing.
- [Fix] **Sign in:** Fixed an issue where, back on the code page after signing in, Send a new code stayed greyed out.
- [Fix] **Go live:** Fixed an issue where Save what was recorded, waiting for the last of a closed page's recording, counted down from 0:20 again and again: it now counts the whole wait down once.
- [Fix] **Uploads and Go live:** Fixed an issue where a tap at the wrong moment could keep the phone's screen on after an upload or a live stream had finished.
- [Fix] **Go live:** Fixed an issue where, after a page closed mid-game, Save what was recorded and Carry on streaming did nothing on a phone whose own storage couldn't be read: they now go ahead with what reached the site.
- [Fix] **Photos:** Fixed an issue where swiping to the next photo on a weak signal could show that photo with the last one's caption and buttons: the photo's page now opens as usual when it can't be read in place.
- [Fix] **Costs:** Fixed an issue where Cloudflare's bill showed the containers' memory, disk and vCPU as far over their free allowances: the allowances are in hours or minutes and the use in seconds, and now they're compared in the same unit. Durable Objects' compute allowance shows too.
- [Enhancement] **Help:** What is the aim here? now says live scores, each player's own points, fouls and games, the ladder and the results history are on the league's own scoring app, not here.
- [Enhancement] **Roster:** One family filming every game is easier to set: a Team duties link at the top of the Roster and in each week's Change, and the choice reads Who films: The Curry family, every week.
- [Enhancement] **Platform:** The site's tools, tests, builds and video joiner run on Node 26, ahead of Node 22's end of life in April 2027, with the cf CLI and the test tools updated too.
- [Fix] **Sign in:** Fixed an issue where someone whose emails bounce was told to try again in a minute. The page now says their address is bouncing and to ask their team manager for another, and the site's admins get a ticket about it.
- [Fix] **Sign in:** Fixed an issue where Request access's name and team boxes didn't look like the email box, and the team box showed an example team that could read as already filled in.
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
