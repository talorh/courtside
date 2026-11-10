import { describe, expect, it } from "vitest";
import {
	localMidnight,
	addDays, formatClock, formatDay, formatDuration, formatGameDate, formatShortDate, localDate, localTime, localTimeSeconds, mondayOf, nextFridayDate,
	seasonOf, streamDeletionDate,
} from "../../src/shared/time.ts";

describe("time", () => {
	it("converts UTC to local wall time (AEDT)", () => {
		expect(localTime(new Date("2026-10-15T00:30:00Z"))).toBe("2026-10-15T11:30");
		expect(localDate(new Date("2026-10-14T14:30:00Z"))).toBe("2026-10-15");
		// To the second, as a photo's taken_at.
		expect(localTimeSeconds(new Date("2026-10-15T00:30:07.900Z"))).toBe("2026-10-15T11:30:07");
	});
	it("formats a game date", () => {
		expect(formatGameDate("2026-09-06T10:20")).toBe("Sun 6 Sep 2026, 10:20am");
		expect(formatGameDate("2026-10-17T18:40")).toBe("Sat 17 Oct 2026, 6:40pm");
		expect(formatShortDate("2026-10-23T18:40")).toBe("Fri 23 Oct");
		// The day a photo was taken (with its time to the second, or just the date).
		expect(formatDay("2026-10-23T19:05:12")).toBe("Fri 23 Oct 2026");
		expect(formatDay("2027-01-01")).toBe("Fri 1 Jan 2027");
	});
	it("formats 12-hour clock times", () => {
		expect(formatClock("00:05")).toBe("12:05am");
		expect(formatClock("12:00")).toBe("12:00pm");
		expect(formatClock("18:40")).toBe("6:40pm");
	});
	it("finds the next Friday in the club's time zone (today if it's Friday)", () => {
		expect(nextFridayDate(new Date("2026-10-15T00:00:00Z"))).toBe("2026-10-16");
		expect(nextFridayDate(new Date("2026-10-16T02:00:00Z"))).toBe("2026-10-16");
		expect(nextFridayDate(new Date("2026-10-16T14:00:00Z"))).toBe("2026-10-23");
	});
	it("finds the Monday of the week a date is in", () => {
		expect(mondayOf("2026-11-09")).toBe("2026-11-09");
		expect(mondayOf("2026-11-15")).toBe("2026-11-09");
		expect(mondayOf("2026-11-01")).toBe("2026-10-26");
	});
	it("formats durations", () => {
		expect(formatDuration(2830)).toBe("47:10");
		expect(formatDuration(3725)).toBe("1:02:05");
	});
	it("starts a season in October, and gives Stream a deletion date only when it's 30 days away or more", () => {
		expect(seasonOf(new Date("2027-09-30T13:00:00Z")).label).toBe("2026/27"); // 11:00pm 30 Sep, local
		expect(seasonOf(new Date("2027-09-30T14:00:00Z")).label).toBe("2027/28"); // 12:00am 1 Oct
		// Stream wants a scheduled deletion at least 30 days out; closer than that, retention handles it.
		expect(streamDeletionDate("2027-12-31T13:00:00.000Z", new Date("2026-10-16T00:00:00Z"))).toBe("2027-12-31T13:00:00.000Z");
		expect(streamDeletionDate("2027-12-31T13:00:00.000Z", new Date("2027-12-15T00:00:00Z"))).toBeUndefined();
		expect(addDays(new Date("2026-01-01T00:00:00Z"), 1).toISOString()).toBe("2026-01-02T00:00:00.000Z");
	});
	it("rejects malformed local times", () => {
		expect(() => formatGameDate("2026-9-6")).toThrow(/Invalid local time/);
	});
});

describe("localMidnight", () => {
	it("is when a local day starts: 13:00 UTC the day before in daylight saving, 14:00 in winter, either side of a change", () => {
		expect(localMidnight("2026-11-05").toISOString()).toBe("2026-11-04T13:00:00.000Z");
		expect(localMidnight("2027-06-15").toISOString()).toBe("2027-06-14T14:00:00.000Z");
		// Daylight saving starts at 2am on Sunday 4 Oct 2026 and ends at 3am on Sunday 4 Apr 2027.
		expect(localMidnight("2026-10-04").toISOString()).toBe("2026-10-03T14:00:00.000Z");
		expect(localMidnight("2026-10-05").toISOString()).toBe("2026-10-04T13:00:00.000Z");
		expect(localMidnight("2027-04-04").toISOString()).toBe("2027-04-03T13:00:00.000Z");
		expect(localMidnight("2027-04-05").toISOString()).toBe("2027-04-04T14:00:00.000Z");
	});
});
