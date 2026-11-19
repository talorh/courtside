# Changelog

What changed on the site, newest first, as release notes under each date. The site's admins see it in the admin area
(Changelog), each day's changes under Features, Enhancements and Fixes.

Each line is one change: its kind (`[Feature]` something new, `[Enhancement]` something better, `[Fix]` something that
was wrong), the area in bold, then a plain sentence saying what changed for the people using the site ("Fixed an issue
where ..."). Every deploy adds its lines at the top of today's date, and the deploy (`npm run release`, then Workers
Builds) sends the top line, in plain words, as its message.

## 19 Nov 2026

- [Fix] **Go live:** Fixed an issue where ending a game while the camera had stopped or during a pause could make the whole game's video fail to process, as the iPhone wrote a frame with an impossible length; the phone now puts every such frame right before the recording is kept or sent.
- [Fix] **Go live:** Fixed an issue where footage left on a phone overnight after Save couldn't be sent once its upload link had run out, and End game after Carry on didn't count what an earlier part still had to send.
- [Fix] **Videos:** Fixed an issue where a video that failed to process lost its original as soon as the game's video was replaced; the original is now kept until 30 days after its upload, so the game can still be saved.
- [Fix] **Video joiner:** Fixed an issue where a game whose parts had to be re-encoded to join could run out of time; the joiner re-encodes faster and allows 90 minutes. Build its image again with npm run join -- image.
- [Fix] **Costs:** Fixed an issue where a deleted team's minutes watched moved onto the teams still running when Costs read the month again; the Stream storage figure is now Stream's own count of every team's minutes, not the season shown.
- [Feature] **Users:** A new Users page in the admin area lists everyone on every team, with a dashboard of who uses the site and each team's people, filters and sorting, and lets an admin lock someone, take them off a team or add them to one.
- [Fix] **Costs:** Fixed an issue where a month that's over counted every minute Stream held during it, test videos that came and went included, so it could show a block of storage that was never bought; it's now priced by the storage bought that month (noted each time Costs opens), or before there's a note by the most Stream held at once, and the months ahead build on what's kept now.
- [Fix] **Costs:** Fixed an issue where the 3am job's read of Cloudflare's bill gave up after 5 seconds in a new billing period's first days; when Cloudflare doesn't answer, Costs now asks again 15 minutes later instead of on every page.
- [Fix] **Sign-in:** Fixed an issue where asking for a new code stopped the one already in the inbox working before the new code's email had arrived, or when it didn't go.
- [Fix] **Costs:** Fixed an issue where Cloudflare's bill counted the previous billing period's days twice, so the previous period's usage and charges showed doubled; and R2's and the database's storage now say where they'll be by the period's end, amber once that's past what's free.
- [Enhancement] **Documentation:** The AI coding agent's instructions now start every change by pulling Courtside's latest updates and fixes from GitHub into staging, and say what to do with what comes in: conflicts, failed checks, and updates that need a migration, a new setting or the club's own values.

## 18 Nov 2026

- [Enhancement] **Platform:** The site is now built and deployed with Cloudflare's cf command line 1.0 release candidate (1.0.0-rc.1) and its Vite plugin 2.0.0-rc.1, and the scripts and setup steps keep the Cloudflare login in its own file, out of the system's keyring, where the scripts can read it.
- [Enhancement] **Roster:** The WhatsApp message now says "Please see below game details" rather than match day details, and no longer asks families to arrive 30 minutes early.
- [Feature] **Cloudflare setup:** A club that manages its Cloudflare account with Terraform can now apply the site's setup that way (npm run terraform), from the same files as the cf commands, with a plan the owner reads before each apply and a way to take over an install cf made.
- [Fix] **Documentation:** Fixed an issue where the Documentation said a join never encodes anything again: the parts are copied as they are, and encoded again only as a fallback when they don't line up. The request diagram now starts with the check that a request came to the site's own address.
- [Enhancement] **Video joiner:** Building the joiner's image (npm run join -- image) now runs it with no network before pushing it, and pushes it only once its ffmpeg is the pinned version and its own self-test joins.
- [Fix] **Staging:** Fixed an issue where staging's emails (support tickets, admin changes, Platform's test email) and its match day message linked to the live site: they now link to the address the site is on.
- [Enhancement] **Documentation:** Beside Cloudflare's money alerts, the Documentation, the setup runbook and the install guide now describe a Workers spending limit (US$20 a billing period, say), which stops a runaway Workers bill but takes the site down until the next period if it's reached.
- [Fix] **Roster:** Fixed an issue where adding only families already on the roster showed an error page.
- [Fix] **Costs:** Fixed an issue where, once a season's twelve months were over, the month under way while its footage is still kept (October to December) was shown as its last finished month, and the kept months still to come had no estimate: they're now estimated at the minutes the team stores now, and the month under way is this month.
- [Fix] **Roster:** Fixed an issue where taking a family off removed them from the duties of a game already played that week, rewriting its scorers: only games still to come lose them now, and opening the roster no longer fills an empty duty at a game that's started.
- [Fix] **PlayHQ:** Fixed an issue where a closed team's pages kept the "PlayHQ couldn't be read" banner for good after a last failed check.
- [Fix] **Photos:** Fixed an issue where, while a swipe on a weak signal waited for the next photo's page, the last photo's caption and buttons could still be tapped, so Save or Delete acted on the photo swiped away from: they're greyed out and can't be used until the next photo's own come.
- [Fix] **Game check:** Fixed an issue where photos in Images near their limit made a coming game not ready, though Go live and uploads don't use Images.
- [Enhancement] **Log:** A person's phone reports (an upload or photos that stopped) are capped at 30 an hour, so a page gone wrong can't fill the Log's Problems.
- [Fix] **Clips and photos:** Fixed an issue where a limit's "room again at" time was a minute early when it fell part way through a minute: it's now the minute after.
- [Fix] **Sign-in:** Fixed an issue where a code refused over a limit could have its count taken back twice when noting the refusal failed, letting one more code through.
- [Fix] **Insights:** Fixed an issue where an external app stream's further parts, which the site saves as clips, were counted as highlight clips in the teams' figures and the weeks.
- [Fix] **Sign-in:** Fixed an issue where a held address's taps on Send code counted against its network's limit, which could turn away other families signing in from the same gym's or phone company's address.
- [Fix] **Insights:** Fixed an issue where a live stream's recording was counted both as a live stream and as an upload under way in the Alerts section.
- [Fix] **Alerts:** Fixed an issue where two checks of one kind at the same moment could open a spurious problem or say Worse twice, with two emails.
- [Enhancement] **Sign-in:** When Cloudflare refuses the site's own Turnstile key (a wrong or revoked secret), sign-ins are still refused, but the admins now get a Site problem in the Log and a log line saying so, rather than nothing.
- [Fix] **Support:** Fixed an issue where a ticket's email could go twice when its page and the 5-minute job sent it at the same moment.
- [Fix] **Clips:** Fixed an issue where a clip Stream couldn't make counted against its maker's hour, the team's 5 hours and its game's 50, though it holds no storage.
- [Enhancement] **Clips:** A team now keeps at most 5 hours of clips, so clips made over many days can't fill the shared Stream storage either; past it the site says a team manager deleting clips makes room, and offers a shorter clip when one fits.
- [Fix] **Teams:** Fixed an issue where Reopen and Cancel tonight's delete were still offered once a team's videos and photos were past their date, though the 3am job would close it again and delete it that night: they now say why and offer nothing.
- [Enhancement] **Photos:** Each person can add up to 500 photos a day and each team 2,000, as every photo counts against the account's shared Images allowance; photos sent together stop at the limits, and past one the Photos page stops and says when there's room again, rather than listing every photo refused.
- [Enhancement] **Video joiner:** The joiner's image is now pinned, its base by digest and ffmpeg by version, so a rebuild changes only the site's own files; the setup runbook says how to move the pin. Rebuild the joiner's image (npm run join -- image) to pick it up.
- [Fix] **Teams:** Fixed an issue where deleting a closed team could leave some of its unfinished uploads in R2 when R2 listed them over several pages: every page is now read.
- [Enhancement] **Go live:** A carried-on recording made as H.264 in WebM (as Chrome records) is now copied into one video rather than re-encoded, so it's joined in minutes, and a re-encode that's still needed is about 20 times cheaper; the video joiner takes waiting joins one team at a time, each with its newest links, so one team's joins can't hold up another's. Rebuild the joiner's image (npm run join -- image) to pick it up.
- [Enhancement] **Staging:** Staging is now its own Worker, staging-<worker>, at the same workers.dev address, in place of a Preview of the live Worker, and the live Worker has no preview addresses at all; npm run staging -- setup turns them off and deletes the old Preview before staging's first deploy (on a new install there's nothing to turn off yet), staging's keys go with each deploy in a file removed as soon as it's done, a deploy is recorded only once Cloudflare shows it, and staging's Platform shows its own Worker's figures.
- [Enhancement] **Clips:** A person can make up to an hour of clips a day and a team up to 5 hours, as each clip is a video of its own in Stream's shared storage; a game still has at most 50 clips, and each clip's place is now taken before Stream is asked, so clips made at the same moment stop at the limits. Past one, the site says when there's room again.
- [Fix] **Sign-in:** Fixed an issue where the robot check let a sign-in or access request through when Cloudflare refused the question itself: now only Cloudflare's own trouble (no answer, a 5xx, or Cloudflare limiting its service) lets it carry on on the site's limits, and a token longer than Cloudflare makes is refused.
- [Fix] **Sign-in:** Fixed an issue where codes asked for at the same moment could all pass the sign-in limits, as each was counted only once its email had gone: each code is now counted first, and taken back if it's refused or its email doesn't go. Request access's hourly limit holds the same way.
- [Fix] **Video joiner:** Each part of a carried-on recording is now read only as the recording's own kind of file (MP4 or WebM): a part that holds a list of links or files fails the join instead of having the joiner open what it names. Rebuild the joiner's image (npm run join -- image) to pick it up.
- [Fix] **Security:** The site now answers only on its own address (the club's domain, and staging on its own): any other address that reaches the Worker, such as a version's workers.dev preview address, gets a bare "Not found", as it would miss the zone's protections.

## 17 Nov 2026

- [Enhancement] **Documentation:** The AI coding agent now fetches Cloudflare's skills (security audit and Workers best practices among them) at the start of each session, and checks every change against them before it's committed.
- [Fix] **Video joiner:** Fixed an issue where a failed join's reason could quote a recording's signed link from ffmpeg's output: it's cut to the address before it's logged, and a failed join is now an error in the joiner's logs. Rebuild the joiner's image (npm run join -- image) to pick it up.
- [Enhancement] **Logs:** A problem on the site can be found fast: every failed request, job step and video join names its team, game or video and the cause, families' live players report when the picture fails and comes back, a stopped upload says how far it got, error pages show a reference to quote, and npm run logs reads them.
- [Fix] **Costs:** Fixed an issue where the months to come counted only the Stream storage their minutes needed, not the storage bought: they now count at least what's bought, since Cloudflare bills it until it's lowered.

## 16 Nov 2026

- [Fix] **Home:** On a computer, the banner over the court is tinted with the club's own colour, where it had a fixed green.
- [Fix] **Local development:** The local site now starts before the install fills in deploy.config.ts (Workers AI waits for the account), the example data starts over cleanly however the local database has been used, and the README's screenshots show the new logo.
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
