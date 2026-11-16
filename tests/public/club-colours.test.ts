import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The club's colours come from src/club.ts, as /club.css's tokens.
describe("the stylesheets' colours", () => {
	it("tint Home's desktop banner with the club's own deep colour, not a fixed one", () => {
		const banner = /\.homehero::before\{[^}]*\}/.exec(readFileSync("public/desktop.css", "utf8"))?.[0] ?? "";
		expect(banner).toContain("var(--bar)");
		expect(banner).not.toMatch(/rgba?\(/);
	});
});
