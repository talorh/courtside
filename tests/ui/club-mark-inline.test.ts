import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLUB_MARK } from "../../src/ui/club-mark-inline.ts";

describe("the launch screen's club mark", () => {
	it("is public/club-mark.webp, byte for byte, as a data: URL (remake the constant when the file changes)", () => {
		expect(CLUB_MARK).toBe(`data:image/webp;base64,${readFileSync("public/club-mark.webp").toString("base64")}`);
	});
});
