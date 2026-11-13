import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cloudflareWeekday, GAME_DAY_CRONS, gameDayDue } from "../../src/jobs/game-day.ts";

const at = (iso: string) => Date.parse(iso);

describe("the Friday check's time: 6am Friday in the club's time zone, all year", () => {
	it("for the example club (Melbourne) the Thursday 19:00 UTC trigger is Friday 6am in daylight saving, the 20:00 one in winter", () => {
		expect(gameDayDue(at("2026-11-12T19:00:00Z"))).toBe(true);
		expect(gameDayDue(at("2026-11-12T20:00:00Z"))).toBe(false);
		expect(gameDayDue(at("2027-06-17T20:00:00Z"))).toBe(true);
		expect(gameDayDue(at("2027-06-17T19:00:00Z"))).toBe(false);
		expect(gameDayDue(at("2026-11-11T19:00:00Z"))).toBe(false); // a Thursday morning there
	});
	it("writes the weekday as Cloudflare reads it: 1 is Sunday and 7 Saturday, so Thursday is 5", () => {
		expect(cloudflareWeekday(new Date("2026-11-08T12:00:00Z"))).toBe(1);
		expect(cloudflareWeekday(new Date("2026-11-12T19:00:00Z"))).toBe(5);
		expect(cloudflareWeekday(new Date("2026-11-14T12:00:00Z"))).toBe(7);
	});
	it("names those two triggers on Thursday UTC (5), and the deploy config makes its own the same way from the club's time zone", () => {
		expect(GAME_DAY_CRONS).toEqual(new Set(["0 19 * * 5", "0 20 * * 5"]));
		const config = readFileSync("cloudflare.config.ts", "utf8");
		expect(config).toContain("...sixAmFridays(club.timeZone).map((schedule) => triggers.scheduled({ schedule }))");
		expect(config).toContain('p.weekday !== "Fri" || p.hour !== "06" || p.minute !== "00"');
		expect(config).toContain("${at.getUTCDay() + 1}");
	});
});
