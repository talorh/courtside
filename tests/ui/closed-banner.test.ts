import { describe, expect, it } from "vitest";
import { closedBanner } from "../../src/ui/closed-banner.ts";
import type { PageFrame } from "../../src/ui/layout.ts";
import { B12_1 } from "../helpers/fakes.ts";

const closed = (deleteAfter: string): PageFrame => ({
	team: { ...B12_1, status: "closed", deleteAfter }, viewer: { email: "a@b.c", isAdmin: false, memberships: [] }, viewAs: null,
	member: { id: 1, teamId: B12_1.id, email: "a@b.c", name: "A", role: "watcher", lastSeenAt: null, hideScores: false, hidden: false },
});

const banner = (deleteAfter: string) => {
	const out = closedBanner(closed(deleteAfter));
	return out ? out.__html : "";
};

describe("closed banner", () => {
	it("a team closed tonight keeps its things until today, the day before the 3am purge, as the season pack says", () => {
		const out = banner("2026-11-15T16:00:00.000Z");
		expect(out).toContain("Its videos and photos stay until 15 Nov 2026, then they're deleted.");
	});
	it("a team closed at its season's end keeps its things until the season's last day", () => {
		const out = banner("2027-12-31T13:00:00.000Z");
		expect(out).toContain("Its videos and photos stay until 31 Dec 2027, then they're deleted.");
	});
});
