// The example club the tests describe: the Saints. Set over src/club.ts before every test file (vitest.config.ts
// setupFiles), so a club that has filled in its own config still gets a green test suite.
import { CLUB } from "../../src/club.ts";

export const EXAMPLE_CLUB: typeof CLUB = {
	siteName: "Courtside", domain: "saints.example", name: "Saints", nickname: "Saints", fixtureName: "Saints",
	homeVenue: "Saints Stadium", rivals: ["Westside", "Bayside"], league: "VJBL", uniforms: ["Navy", "White"], cheer: "Go Saints!",
	timeZone: "Australia/Melbourne", dailyJobUtcHours: [16, 17], seasonStartMonth: 10, english: "Australian",
	childSafety: { body: "Basketball Victoria", url: "https://www.basketballvictoria.com.au/resources/child-safe-standards" },
	currency: { code: "AUD", name: "Australian dollars", perUsd: 1.42 },
	colors: {
		light: { bar: "#14274E", button: "#2F6FDB", buttonInk: "#1F4FA8", soft: "#E4ECFB" },
		dark: { bar: "#0E1A33", button: "#4B86E8", buttonInk: "#8FB4F2", soft: "#142447" },
	},
};

/** Makes the live config the example club's (the object is shared, so every module sees it). */
export function useExampleClub(): void {
	Object.assign(CLUB, structuredClone(EXAMPLE_CLUB));
}
