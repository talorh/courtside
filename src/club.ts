// The club this site is for: the one place its names, colours, time zone and words live. INSTALL.md walks a club
// through filling it in; nothing else in the code names a club. The values here are the example club's, the Saints,
// which the tests and the documentation use.

export interface ClubColors {
	/** The top bar, card header bands and the Home Screen launch screen: the club's deep colour. */
	bar: string;
	/** Buttons and links: the club's bright colour, dark enough for white text on it. */
	button: string;
	/** The bright colour's darker shade: hover, and coloured text on the page. */
	buttonInk: string;
	/** A pale tint of the bright colour: highlights and soft backgrounds. */
	soft: string;
}

export const CLUB = {
	/** The site's name: the top bar, titles, emails and the Home Screen icon. */
	siteName: "Courtside",
	/** The site's domain, a zone in the Cloudflare account (cloudflare.config.ts puts the Worker on it): links in emails,
	 * the sender alerts@ and security@ addresses. */
	domain: "saints.example",
	/** The zone in this Cloudflare account the domain sits in. The same as `domain` for a domain of its own (recommended);
	 * for a subdomain of the club's own domain (videos.yourclub.org.au), that domain (yourclub.org.au), already a zone in
	 * this account, which the site shares with the club's website (INSTALL.md section 8). */
	zone: "saints.example",
	/** The club's full name, as its teams are named on Home: "Saints U12 Boys 12.1". */
	name: "Saints",
	/** The short name teams go by in the top bar and titles ("Saints B12.1"), in game lines ("the Saints take on") and
	 * on the singlet. Works best as a plural nickname. */
	nickname: "Saints",
	/** How fixtures (PlayHQ and club sites) name the club's teams: "Saints U12 Boys 1". */
	fixtureName: "Saints",
	/** The home stadium, for the game lines ("Away from Saints Stadium"). */
	homeVenue: "Saints Stadium",
	/** Local rival clubs, as fixtures name them: their games get the derby lines. */
	rivals: ["Westside", "Bayside"] as string[],
	/** The league the club plays in, the first choice when a game is added; a game's round number is shown as "Round 5"
	 * only in the league. */
	league: "VJBL",
	/** The league season's phases, as its fixtures name them: the grading rounds, the crossover game and the season
	 * proper. PlayHQ names a game's grade for its phase ("12 Boys Grading 1 - Pool 2D", "... Grading 1 - Crossover",
	 * "... Grading 2 - AA Pool B"); anything else is the season proper (games/season-phase.ts). */
	seasonPhases: { grading1: "Grading phase 1", crossover: "Crossover game", grading2: "Grading phase 2", championship: "Championship season" },
	/** The uniforms a game can be played in, home first. Two or more ("Navy", "White"): the match day message lets the
	 * team manager pick one and says to pack the other, the clash uniform. One, for a club with a single kit or a
	 * reversible singlet ("Reversible singlet"): no choice, and the message just names it. */
	uniforms: ["Navy", "White"] as string[],
	/** Signs off the welcome message a new team manager gets. */
	cheer: "Go Saints!",
	/** IANA time zone the club plays in: fixtures, the Log and the daily job's 3am. */
	timeZone: "Australia/Melbourne",
	/** The two UTC hours that are 3am in the time zone across the year (daylight saving and not): the daily job's cron
	 * triggers, in cloudflare.config.ts and jobs/daily.ts. One hour where the zone has no daylight saving. */
	dailyJobUtcHours: [16, 17] as number[],
	/** The month seasons start in (1 to 12): a season runs from then into the next year. */
	seasonStartMonth: 10,
	/** The variety of English the AI helpers write in. */
	english: "Australian",
	/** The child safety standards the club works to: the body that sets them and where they are, linked from Help. */
	childSafety: { body: "Basketball Victoria", url: "https://www.basketballvictoria.com.au/resources/child-safe-standards" },
	/** The currency Costs shows beside Cloudflare's US dollars: its ISO code (one Frankfurter publishes), its name, and
	 * roughly how many of it a US dollar buys, used until the day's rate has been read. */
	currency: { code: "AUD", name: "Australian dollars", perUsd: 1.42 },
	colors: {
		light: { bar: "#14274E", button: "#2F6FDB", buttonInk: "#1F4FA8", soft: "#E4ECFB" } as ClubColors,
		dark: { bar: "#0E1A33", button: "#4B86E8", buttonInk: "#8FB4F2", soft: "#142447" } as ClubColors,
	},
};

/** The site is on a subdomain of the club's own domain, in a zone it shares with the club's website. */
export const onSubdomain = () => CLUB.domain !== CLUB.zone;

/** "https://saints.example": the site's address, for links in emails. */
export const siteOrigin = () => `https://${CLUB.domain}`;
/** The one address the site sends from (Email Sending allows it alone). */
export const mailFrom = () => `alerts@${CLUB.domain}`;

/** "SAINTS", for the singlet and the court. */
export const clubWordmark = () => CLUB.nickname.toUpperCase();
