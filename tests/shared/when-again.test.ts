import { describe, expect, it } from "vitest";
import { whenAgain } from "../../src/shared/when-again.ts";

// Saturday 24 Oct 2026, 7pm at the club (Australia/Melbourne).
const NOW = new Date("2026-10-24T08:00:00Z");

describe("when a limit has room again", () => {
	it("says the minute it's reached, today or tomorrow", () => {
		expect(whenAgain(new Date("2026-10-24T10:00:00Z"), NOW)).toBe("9:00pm");
		expect(whenAgain(new Date("2026-10-25T06:00:00Z"), NOW)).toBe("5:00pm tomorrow");
	});
	it("rounds a time part way through a minute up, never to a minute that's still too soon", () => {
		expect(whenAgain(new Date("2026-10-24T09:59:30Z"), NOW)).toBe("9:00pm");
		expect(whenAgain(new Date("2026-10-24T09:59:00.001Z"), NOW)).toBe("9:00pm");
	});
	it("says tomorrow when rounding up crosses midnight", () => {
		expect(whenAgain(new Date("2026-10-24T12:59:30Z"), NOW)).toBe("12:00am tomorrow");
	});
});
