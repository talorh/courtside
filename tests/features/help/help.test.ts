import { describe, expect, it } from "vitest";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

describe("Help", () => {
	it("is open to every member, linked from the nav, and every question starts closed", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'p@x.com', 'Sam Parent', 'watcher')").bind(deps.team.id).run();
		const res = await makeClient(deps, "p@x.com")("/help");
		expect(res.status).toBe(200);
		const page = await res.text();
		// The oval Help button at the top of every page (Help's grey button went to Photos).
		expect(page).toContain('<a class="helpbtn" href="/help" aria-label="Help, and Ask Virtual Sam" aria-current="page">');
		expect(page).toContain("<title>Help · Saints B12.1</title>");
		expect(page).toContain('<div class="eyebrow">Questions and how-tos</div><h1>Help</h1>');
		expect(page).not.toMatch(/\bFAQ\b/);
		expect(page).not.toMatch(/<details[^>]* open/);
		// What the site is for is a question at the end; everyone starts with signing in, and Watch only, who
		// doesn't film, has no video duty checklist. Someone who films gets it after signing in.
		expect(page).toContain("What is the aim here?");
		// Watch only people watch live too: what a stopped picture's cards mean is under Watching.
		expect(page).toMatch(/<b>Picture stopped\?<\/b>[^]*?Live stream will resume shortly[^]*?refresh the page[^]*?A Full time screen means the game's over/);
		expect(page).toContain("without relying on\nsocial media as the primary way of doing this.</p>");
		expect(page).not.toContain("ankles");
		// And what it isn't for: the team chat, and game analysis.
		expect(page).toContain("<li><b>Not the team chat:</b> WhatsApp or similar is the main way teams talk.</li>");
		expect(page).toContain("<li><b>Not game analysis:</b> coaches may wish to use Superstat (superstat.com.au) or similar.</li>");
		expect(page).toContain(`<details class="panel faq" id="tv"><summary>How do I watch on the TV?</summary>`);
		expect(page).not.toContain("On video duty this week?");
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'f@x.com', 'Fran Filmer', 'filmer')").bind(deps.team.id).run();
		const filmer = await (await makeClient(deps, "f@x.com")("/help")).text();
		expect(filmer.indexOf("How do I sign in?")).toBeLessThan(filmer.indexOf("On video duty this week?"));
		expect(filmer).toContain("<li><b>Check the Fixture:</b> each game says <b>Recorded</b>");
		// Video duty says to test a live stream at home first.
		expect(filmer).toContain("Live streaming? Do a test at home first, under a minute, so it's thrown away.");
	});

	it("gives those who film recording and live streaming; Watch only people not (each role its own topics)", async () => {
		const deps = createTestDeps();
		for (const [email, role] of [["p@x.com", "watcher"], ["f@x.com", "filmer"], ["c@x.com", "coach"]] as const) {
			await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, 'Someone', ?)").bind(deps.team.id, email, role).run();
		}
		const help = async (email?: string) => (await makeClient(deps, email)("/help")).text();
		const family = await help("p@x.com"), coach = await help("c@x.com");
		for (const q of ["Filming a game", "Recording and uploading a game: iPhone", "Live streaming: which browser?", "The upload won&#39;t work."]) {
			expect(family, q).not.toContain(q);
			expect(coach, q).toContain(q);
		}
		// Watch only people don't film, so no video duty checklist, but why they can't see Upload video or Go live.
		expect(family).not.toContain("On video duty this week?");
		expect(family).toContain("Why can&#39;t I see the Upload video or Go live buttons?");
		expect(coach).toContain("On video duty this week?");
		for (const email of ["f@x.com", undefined]) {
			const page = await help(email);
			expect(page, String(email)).toContain('<h2 class="faqgroup gtitle">Filming a game</h2>');
			expect(page, String(email)).toContain('<h3 class="faqsub">Live streaming</h3>');
		}
	});

	it("walks someone set to Watch and film through live streaming and uploading", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'f@x.com', 'Sam Filmer', 'filmer')").bind(deps.team.id).run();
		const page = await (await makeClient(deps, "f@x.com")("/help")).text();
		// Streaming is from the phone's browser, camera and microphone allowed.
		expect(page).toContain("your phone's web browser");
		// No wording left from when streaming needed an app, and stopping is one clear button with a question.
		expect(page).not.toMatch(/nothing to install|(tap|stop)[^.]{0,30}twice|End stream/i);
		expect(page).toContain("tap the red <b>End game</b> button, then <b>Yes, end game</b>");
		expect(page).toContain("tap <b>Allow</b> for the <b>camera</b> and the\n<b>microphone</b> (it needs both)");
		// Firefox works, Chrome is best on Android.
		expect(page).toContain("<b>Android: Chrome</b> works best. Firefox and Samsung Internet work too.");
		expect(page).toContain("<b>Not filming a part?</b> For the warm-up or half-time, tap <b>Pause</b>.");
		expect(page).toContain("During the warm-up, with the phone sideways, tap <b>Go live</b>");
		expect(page).toContain("Don't tap <b>End game</b> for a break: it ends the stream for good.");
		// What the Go live and Upload pages leave to Help.
		expect(page).toContain("up high near halfway");
		expect(page).toContain("Turn on <b>Do Not Disturb</b>, so a call doesn't stop the camera.");
		expect(page).toContain("its HD copy to save about 10 to 15 minutes after that");
		// Safari's bars back over the camera (the phone turned or locked): how to hide them, with the picture.
		expect(page).toContain("<li><b>Safari's bars back over the picture?</b>");
		expect(page).toContain("choose <b>Hide Toolbar</b>");
		expect(page).toMatch(/<figure class="mock wide" role="img" aria-label="[^"]*Hide Toolbar[^"]*">\s*<span class="m-cam m-bars"><span class="m-sbar"><span class="m-url"><span class="m-aa m-tap">aA<\/span><b>saints\.example<\/b>/);
		// Not "download": a search for downloading photos finds only the sections about that.
		expect(page.match(/HD download about/g)).toBeNull();
		// iPhone uploads: save to Files first, because the iPhone converts a video picked from Photos before handing it over.
		expect(page).toContain("<b>Save the video to Files first.</b>");
		expect(page).toContain("the iPhone converts the whole game before handing it over");
		expect(page).not.toContain("twice as long");
		// The camera settings that keep a game to about 4 GB, for each phone.
		expect(page).toContain("<b>Record Video</b> → <b>1080p HD at 30 fps</b>, and <b>Formats</b> → <b>High Efficiency</b>");
		expect(page).toContain("set video to <b>1080p (FHD) at 30 fps</b>, not 4K");
		// End game tapped too early: record the rest with the Camera app and send it to; a closed page carries on instead. Sam.
		expect(page).toContain("open the <b>Camera</b> app and record the\nrest of the game");
		expect(page).toContain("Open <b>Go live</b> again on the same phone and\ntap <b>Carry on streaming</b>");
		// A carried-on game's parts are joined into one video first, so it reaches Watch games later than usual.
		expect(page).toMatch(/<b>Page closed mid-game<\/b>[^]*?saves as <b>one video<\/b>[^]*?about ten minutes longer than usual/);
		// Watching: what the two cards over a stopped live picture mean, for everyone (Watch only too).
		expect(page).toMatch(/<b>Picture stopped\?<\/b>[^]*?Live stream will resume shortly[^]*?refresh the page[^]*?A Full time screen means the game's over/);
		// Locking the phone or switching apps turns the camera off; that ends nothing, and Resume camera carries on.
		expect(page).toMatch(/<b>Don't lock the phone or\s+switch apps<\/b>: that turns the camera off/);
		expect(page).toMatch(/<b>Camera stopped<\/b>[^]*?Nothing ends[^]*?tap <b>Resume camera<\/b>:\s+it carries on in the same video/);
		expect(page).not.toContain("which ends the stream");
		expect(page).not.toContain("<b>Photo Library</b>");
		expect(page).not.toMatch(/Streamlabs|Moblin|apps\.apple\.com/);
		expect(page).not.toContain("IRL Pro");
	});

	it("has separate iPhone and Android answers for recording and live streaming", async () => {
		const page = await (await makeClient(createTestDeps())("/help")).text();
		for (const q of [
			"Recording and uploading a game: iPhone", "Recording and uploading a game: Android", "The upload won&#39;t work. What can I do?",
			"Live streaming a game", "Live streaming: which browser?", "How do I sign in?", "Who can see the videos and photos?", "How do I make a highlight clip?",
			"How long are the videos and photos kept?", "How do photos work?",
		]) expect(page).toContain(q);
		expect(page).toContain("Only the team's <b>families</b> and <b>coaches</b> who've been given access");
		expect(page).toContain("tick who's in it under <b>Who's in it?</b>, and tap <b>Save clip</b>.");
		expect(page).toContain("If all else fails");
		expect(page).toContain("AirDrop");
		expect(page).toContain("<b>Dropbox</b>");
		expect(page).not.toContain("<b>Box</b>");
		expect(page).toContain("31 December of the year the season ends");
		expect(page).toContain("for this season (2026/27), that's <b>31 December 2027</b>");
	});
	it("gives the team's own season's date, whatever today's (each team is one season's squad)", async () => {
		const page = await (await makeClient(createTestDeps(new Date("2027-10-20T00:00:00Z")))("/help")).text();
		expect(page).toContain("for this season (2026/27), that's <b>31 December 2027</b>");
	});
	it("says what the site keeps about a person, for how long, and to ask the team manager to change it", async () => {
		const page = await (await makeClient(createTestDeps())("/help")).text();
		expect(page).toContain('<details class="panel faq" id="about-me"><summary>What does the site keep about me?</summary>');
		expect(page).toContain("Nothing is sold or shared, and there are no ads or trackers.");
		// Which view the device uses: a cookie, and a line in the site's log when it's first seen or changes.
		expect(page).toContain("the mobile one or the desktop one, is kept in a cookie for 30 days and noted once when it's");
	});
	it("points child safety to the standards body and the club's handbook and website, without restating them", async () => {
		const page = await (await makeClient(createTestDeps())("/help")).text();
		expect(page).toContain('<details class="panel faq" id="safety"><summary>Standards</summary>');
		expect(page).toContain('This site makes its best efforts to meet\n<a href="https://www.basketballvictoria.com.au/resources/child-safe-standards" target="_blank" rel="noopener">Basketball Victoria\'s Child Safe Standards</a>.</p>');
		expect(page).toContain("<p>The Saints handbook and/or website will cover child safety policies.</p>");
		expect(page.slice(page.indexOf('id="safety"'))).not.toContain("Any questions");
		for (const gone of ["child.safety@example-association.org", "a government hotline", "<b>000</b>", "change rooms", "parent handbook", "#safety", "outside the team", "Keeping the"]) expect(page, gone).not.toContain(gone);
	});
	it("explains how to install it as an app on an iPhone and on Android, with mock screens and an Install button for Chrome to fill in", async () => {
		const page = await (await makeClient(createTestDeps())("/help")).text();
		expect(page).toContain('<details class="panel faq" id="install"><summary>How to install as an app</summary>');
		// Under Getting started, straight after How do I sign in?.
		expect(page).toContain('<details class="panel faq" id="signin">');
		expect(page).toMatch(/How do I sign in\?<\/summary>[\s\S]*?<\/details><details class="panel faq" id="install">/);
		expect(page.indexOf('id="install"')).toBeLessThan(page.indexOf('id="who"'));
		expect(page).toContain("Tap <b>Share</b> (a square with an arrow pointing up). Can't see it? Tap <b>•••</b> first, then <b>Share</b>.");
		expect(page).toContain("Scroll down and tap <b>Add to Home Screen</b>.");
		expect(page).toContain("It's called <b>Courtside</b>. Leave <b>Open as Web App</b> on, and tap <b>Add</b>.");
		expect(page).toContain("Tap <b>Install app</b> (some phones say <b>Add to Home screen</b>).");
		// The Install button starts hidden (webapp.js shows it when Chrome offers to install), so an iPhone never sees it.
		expect(page).toContain('<div class="installbox" id="install-box" hidden><button class="btn primary" type="button" hidden>Install the app</button>');
		// Each mock screen is one picture with a description for screen readers, and rings what to tap.
		const mocks = page.match(/<figure class="mock[^"]*" role="img" aria-label="[^"]+">/g) ?? [];
		expect(mocks.length).toBeGreaterThanOrEqual(11);
		expect(page).toContain('aria-label="Safari&#39;s Share menu for this page, with Add to Home Screen ringed, further down the list"');
		expect(page).toContain('<span class="m-row m-tap">Add to Home Screen<svg');
		expect(page).toContain('<span class="m-row m-tap">Choose File<svg');
		expect(page).toContain('<span class="m-row m-tap">Save to Files<svg');
		// Labels are Watch games' own, and the app is mentioned where the browser was the only way.
		expect(page).toContain('<span class="s-processing"><span class="gstate"><i aria-hidden="true"></i>Processing</span></span>');
		expect(page).toContain("Open <b>saints.example</b> in Safari (or Courtside on your Home Screen) and tap <b>Upload video</b>.");
		// Except Go live: only from Safari or Chrome, not the app.
		expect(page).toContain("<li><b>Not the Courtside app on your Home Screen.</b> Go live from Safari or Chrome itself:");
		expect(page).toContain("To sign out, tap the door at the top right, then <b>Sign out</b>.");
		// Live streaming only from the browser, never the app (Go live loses its sound there).
		expect(page).toContain("<li><b>Live streaming can't be done in the app.</b> To <b>Go live</b>, open saints.example in Safari or Chrome instead.</li>");
	});
	it("still answers the old address, /faq, by sending it to /help (a link to a question keeps its #)", async () => {
		const res = await makeClient(createTestDeps())("/faq");
		expect([res.status, res.headers.get("Location")]).toEqual([302, "/help"]);
	});
	it("says what the sweep of 24 Oct 2026 found missing: tests stay under a minute, an upright Go live, pulling to refresh, the download and Hide scores buttons by name", async () => {
		const page = await (await makeClient(createTestDeps())("/help")).text();
		expect(page).toContain("A minute or more is kept as the game's video, and the game can't be\nstreamed again.");
		expect(page).toContain("tap <b>Go live</b> (still upright? It waits, and goes live as soon as you turn it).");
		expect(page).toContain("The club's logo goes to the home page, and pulling down from the top reloads.");
		expect(page).toContain("<b>Download:</b> on the game's page, tap <b>Download HD video</b>.");
		expect(page).toContain("tap <b>Hide scores</b>, at the top of Watch games or on a game's page.");
		expect(page).toContain("<b>Help · Saints B12.1</b>"); // the share sheet's mock screen shows the page's own title
	});
	it("covers photos: who adds them, what's left off, looking, downloading, removal and how long; Virtual Sam knows it too", async () => {
		const deps = createTestDeps();
		const page = await (await makeClient(deps)("/help")).text();
		expect(page).toContain('<h2 class="faqgroup gtitle">Photos</h2><details class="panel faq" id="photos"><summary>How do photos work?</summary>');
		expect(page.indexOf('id="kept"')).toBeLessThan(page.indexOf('id="photos"'));
		expect(page.indexOf('id="photos"')).toBeLessThan(page.indexOf('id="safety"'));
		expect(page).toContain("<li><b>Adding:</b> anyone on the team can add photos.");
		expect(page).toContain("<li><b>Privacy:</b> a photo's location is removed when it's added.</li>");
		expect(page).toContain("<li><b>Looking:</b> the newest are first.");
		expect(page).toContain("<li><b>Download:</b> on a photo, tap <b>Download photo</b>. On an iPhone it's <b>Save photo</b>: then tap\n<b>Save Image</b> to put it in Photos.</li>");
		expect(page).toContain("on someone else's photo, tap <b>Ask for this photo to be removed</b>");
		expect(page).toContain("<li><b>Added one by mistake?</b> Open it and tap <b>Delete photo</b>");
		// How long they're kept, and the aim, cover photos too.
		expect(page).toContain("<summary>How long are the videos and photos kept?</summary>");
		// Photos go with the team's season, as its videos do, so the answer covers both as one.
		expect(page).toContain("so download any you'd like to keep before then.</p>");
		expect(page).not.toContain("the season it was taken in");
		expect(page).toContain("<b>Not kept forever:</b> videos and photos are deleted automatically at the end of the season's year");
		expect(page).toContain("<summary>Who can see the videos and photos?</summary>");
		await makeClient(deps)("/api/ask", { method: "POST", body: JSON.stringify({ question: "How do I add photos?" }), headers: { "Content-Type": "application/json" } });
		expect(deps.ai.asked[0]?.system).toContain("Q: How do photos work?");
	});
	it("says how to save a whole game or a clip on an iPhone", async () => {
		const page = await (await makeClient(createTestDeps())("/help")).text();
		expect(page).toContain("On an iPhone it goes to Files: to put it in Photos, open it there, tap\nShare, then Save Video.");
		expect(page).toContain("To keep it on an iPhone, tap <b>Save</b> on it, then <b>Save\nVideo</b>.");
	});
	it("explains the roster, right after video duty, and Virtual Sam knows it too", async () => {
		const deps = createTestDeps();
		const page = await (await makeClient(deps)("/help")).text();
		expect(page).toContain('<details class="panel faq" id="roster"><summary>The roster: game day duties</summary>');
		for (const word of ["lollies", "keep score"]) expect(page.slice(page.indexOf('id="roster"')), word).not.toContain(word);
		expect(page.indexOf('id="duty"')).toBeLessThan(page.indexOf('id="roster"'));
		expect(page).toContain("the <a href=\"/roster\">Roster</a> says whose turn it is");
		// The Roster shows the next six weeks; the rest fold away.
		expect(page).toContain("<li><b>The whole season:</b> tap <b>Later weeks</b> or <b>Earlier weeks</b> under the next six weeks.</li>");
		expect(page).toContain("let Sam know so the Roster can be updated.</li>");
		await makeClient(deps)("/api/ask", { method: "POST", body: JSON.stringify({ question: "Who's on lollies?" }), headers: { "Content-Type": "application/json" } });
		expect(deps.ai.asked[0]?.system).toContain("Q: The roster: game day duties");
		expect(deps.ai.asked[0]?.system).toContain("Later weeks");
	});
});

describe("Help's aim", () => {
	it("says the code is open source, with where it is, and that nobody's making money from it", async () => {
		const page = (await (await makeClient(createTestDeps())("/help")).text()).replaceAll("&#39;", "'");
		const aim = page.slice(page.indexOf("What is the aim here?"));
		expect(aim).toContain('<a href="https://github.com/talorh/courtside" target="_blank" rel="noopener">github.com/talorh/courtside</a>');
		expect(aim).toContain("open source");
		expect(aim).toContain("There's no desire to make money from any of it");
		expect(aim).toContain("<li><b>Not live scores or player stats:</b> live scores, each player's own points, fouls and games, the ladder and the results history are on the league's own scoring app, which has the full fixtures too.</li>");
	});
});
