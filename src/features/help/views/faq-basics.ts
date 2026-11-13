import { CLUB, mailFrom } from "../../../club.ts";
import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";
import { I_AIRPLAY, shot, shots } from "./faq-mock.ts";

/** A game's label exactly as Watch games shows it (library-page.ts), so Help matches what parents see. */
const label = (state: string, text: string) => html`<span class="s-${state}"><span class="gstate"><i aria-hidden="true"></i>${text}</span></span>`;

/** Getting in: signing in, and switching team. How to install as an app comes next (help-page.ts). */
export const faqSignin = (h: HelpFor) => faqItem("signin", "How do I sign in?", html`<ol class="steps">
<li>Go to <b>${CLUB.domain}</b> on your phone or computer.</li>
<li>Enter <b>your email address</b> (the one ${h.c.ask} has on the list).</li>
<li>Check your email for a <b>code</b> and enter it. Can't find it? Check your junk or spam folder. On Hotmail or Outlook, mark it
<b>Not junk</b> and add ${mailFrom()} to your contacts, so the next one comes to your inbox.</li></ol>
${shots(shot("signin-email", "The sign-in page: Log in to Courtside, an Email box and a green Send login code button"), shot("signin-code", "The second step: Enter your login code, with the six-digit code box and a Log in button"))}
<p class="small">You'll be asked for a new code about once a month. If it says your email isn't on the list,
ask ${h.c.ask} to add you, or tap <b>raise an access request here</b> at the bottom of the sign-in page and the site's
admin will add you.</p>
<p class="small">To sign out, tap the door at the top right, then <b>Sign out</b>.</p>
<p class="small">On more than one team? Tap <b>Switch team</b>, under the team's name at the top left.</p>
${shots(shot("signout", "The door at the top right tapped: a Sign out? box with Sign out and Cancel buttons"), shot("teams", "The Which team? page: each of your teams as a button to tap"))}`);

/** Who has access (the site's admins too, for support). */
export const faqWho = (h: HelpFor) => faqItem("who", "Who can see the videos and photos?", html`<p>Only the team's <b>families</b> and <b>coaches</b> who've been given access, each signing in
with their own email. The site's admins can also open any team, to help when something goes wrong.</p>
<p class="small">Someone else in your family would like to watch? Ask ${h.c.ask} to add their email.</p>`);

/** What the site keeps about a person, for how long, and who to ask. */
export const faqKeptAboutMe = (h: HelpFor) => faqItem("about-me", "What does the site keep about me?", html`<p>Your email, to sign
you in, and the name ${h.c.ask} gives you. For each phone or computer you sign in on, what it is (say, iPhone, Safari),
until its 30 days are up. Each sign-in attempt, and the internet address it came from, is kept a month to stop misuse. Which
view each phone or computer uses, the mobile one or the desktop one, is kept in a cookie for 30 days and noted once when it's
first seen or changes.</p>
<p>It also notes which videos you open, for a month (that's how it shows what's new), and which you download, for two
years. Nothing is sold or shared, and there are no ads or trackers.</p>
<p class="small">Want something changed or taken off? Ask ${h.c.ask}.</p>`);

/** The desktop view: a sidebar on a computer, and the switch to the phone's layout and back. */
export const faqComputer = () => faqItem("computer", "On a computer", html`<p>On a computer, the buttons sit in a bar down the left. Prefer the
phone's layout? Click <b>Switch to mobile view</b> at the bottom of the bar; <b>Switch to desktop view</b>, at the top,
brings the bar back.</p>`);

export const faqButtons = (h: HelpFor) => faqItem("buttons", "Why can't I see the Upload video or Go live buttons?", html`<p>Only people set to <b>Watch and film</b> and the team manager see them.
Want to film? Ask ${h.c.ask} to set you up.</p>
${shot("home", "The top of the home page as someone set to Watch and film sees it: Upload video, Watch games and Go live buttons, then Roster, Fixture and Photos", 390, 560)}`);

/** Watching: finding, downloading and removing videos, clips, labels and how long videos are kept. */
export const faqWatch = (h: HelpFor) => html`${faqItem("watch", "How do I watch, download or ask for a video to be removed?", html`<ul class="steps">
<li><b>Watch:</b> tap <b>Watch games</b> and choose a game.</li>
<li><b>Carry on:</b> tap <b>Carry on from</b> under the video to pick up where you left off on that phone or computer.</li>
<li><b>Watch live:</b> when a game is being streamed, tap <b>Watch live</b> on the <b>Live now</b> card, or on the red bar
along the top of the site's other pages. No sound? Tap the page.</li>
<li><b>Picture stopped?</b> A Game Break screen means the filmer has paused for a break, or their camera stopped for a
moment. "Live stream will resume shortly" means the filming phone has dropped out: it comes back by itself, and if it
hasn't after 5 minutes, refresh the page. A Full time screen means the game's over and its video is on its way.</li>
<li><b>Favourites:</b> tap <b>☆ Favourite</b> on a game or a clip to keep it at the top of <b>Watch games</b>. Tap it again
to take it off.</li>
<li><b>No spoilers:</b> tap <b>Hide scores</b>, at the top of Watch games or on a game's page. Scores stay hidden wherever
you're signed in, until you tap <b>Show scores</b>.</li>
<li><b>Download:</b> on the game's page, tap <b>Download HD video</b>. If it says it's being prepared, try again in a few
minutes. A whole game is 1 to 3 GB, so use Wi-Fi. On an iPhone it goes to Files: to put it in Photos, open it there, tap
Share, then Save Video.</li>
<li><b>Remove:</b> on the game's page, tap <b>Ask for this video to be removed</b>.</li>
<li><b>On the wrong game?</b> Let ${h.c.ask} know: it can be moved without uploading it again.</li></ul>
${shot("watch-games", "Watch games: the season's games as cards, newest first, each with its label (Upcoming, Live stream) and date")}`)}
${faqItem("tv", "How do I watch on the TV?", html`<ul class="steps">
<li><b>iPhone or iPad with an Apple TV or AirPlay TV:</b> play the game, tap the player's full-screen button, then tap
<b>AirPlay</b>${I_AIRPLAY} (a screen with a triangle) and pick the TV. No AirPlay button? Swipe down from the top-right corner, tap
<b>Screen Mirroring</b> and pick the TV, then play the game full screen.</li>
<li><b>Android with a Chromecast, Google TV or smart TV:</b> swipe down from the top of the screen, tap <b>Cast</b> or
<b>Screen cast</b> (<b>Smart View</b> on Samsung) and pick the TV. Then play the game full screen with the phone sideways.</li>
<li><b>Computer plugged into the TV:</b> open the game and click <b>Watch full screen</b>. Press Esc to exit.</li></ul>
<p class="small">Mirroring shows everything on your phone's screen, so turn on Do Not Disturb to keep messages off the big
screen.</p>`)}
${faqItem("clips", "How do I make a highlight clip?", html`<ol class="steps">
<li>Open the game in <b>Watch games</b>.</li>
<li>Under the video, find <b>Make a highlight clip</b>. Play to just before the moment and tap <b>Mark start</b>, then
play on and tap <b>Mark end</b>.</li>
<li>Give it a name, tick who's in it under <b>Who's in it?</b>, and tap <b>Save clip</b>. Ticking players gives each
player their own highlights at the end of the season.
${shot("clip-make", "Make a highlight clip, filled in: Start 1:42 and End 1:52 with Mark start and Mark end, the label Q3 Jordan's steal and layup, #9 Jordan ticked under Who's in it, and Save clip", 358, 797)}</li>
<li>It shows next to the game a minute or two later. To keep it on an iPhone, tap <b>Save</b> on it, then <b>Save
Video</b>.
${shot("clip-make-done", "The game's Highlight clips: Q3 Jordan's steal and layup, 10 seconds long, tagged #9 Jordan, with Watch, Download and Favourite", 358, 302)}</li></ol>
<p class="small">Forgot to tick someone? Whoever made the clip (or ${h.c.ask}) can tap <b>Add players</b> or <b>Change
players</b> on it.</p>`)}
${faqItem("labels", "What do Ready to watch, Processing and the other labels mean?", html`<ul class="steps">
<li>${label("ready", "Ready to watch")} (green): tap the game to play it. <span class="t new">New</span> means you haven't opened it yet.</li>
<li><b>Live now</b> or ${label("live", "Live stream")} (red): someone is streaming the game right now. Tap it to watch.</li>
<li>${label("processing", "Processing")}, <b>Uploading</b> or <b>Saving live stream</b> (yellow): the video is on its way. Check back in
20 to 25 minutes.</li>
<li>${label("upcoming", "Upcoming")} (faded): the game hasn't been played yet.</li>
<li>${label("playing", "In progress")}: the game is on right now.</li>
<li>${label("waiting", "Waiting for video")}: the game has been played, but no one has uploaded the video yet.</li>
<li><span class="t score">Won 34 to 28</span>: the final score, ours first. It goes in after the game: from PlayHQ for
${CLUB.league} games, or ${h.c.ask} enters it.</li>
<li>${label("novideo", "No video")} (greyed): this game isn't being filmed, or wasn't.</li></ul>`)}`;

/** Last under Watching. The dates follow the team's own season (October to September), so they never need changing. */
export function faqKept(h: HelpFor) {
	const { season } = h;
	return faqItem("kept", "How long are the videos and photos kept?", html`<p>Until <b>31 December of the year the season ends</b>.
Seasons start in October, so for this season (${season.label}), that's <b>31 December ${season.end}</b>. After that,
they're deleted automatically, so download any you'd like to keep before then.</p>`);
}
