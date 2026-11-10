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

/** "https://saints.example": the site's address, for links in emails. */
export const siteOrigin = () => `https://${CLUB.domain}`;
/** The one address the site sends from (Email Sending allows it alone). */
export const mailFrom = () => `alerts@${CLUB.domain}`;

/** "SAINTS", for the singlet and the court. */
export const clubWordmark = () => CLUB.nickname.toUpperCase();
