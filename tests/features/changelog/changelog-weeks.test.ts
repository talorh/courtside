import { describe, expect, it } from "vitest";
import { parseChangelog } from "../../../src/features/changelog/changelog.ts";
import { isoDate, WEEKS, weeksOfChanges } from "../../../src/features/changelog/changelog-weeks.ts";
import { activityHeatmap } from "../../../src/features/changelog/views/changelog-heatmap.ts";

const SAMPLE = `# Changelog

## 24 Oct 2026

- [Fix] **Go live:** Fixed an issue where a tap could be ignored.
- [Feature] **Roster:** Added one-off duties.
- [Enhancement] The site loads faster.

## 23 Oct 2026

- [Feature] **Sign out:** Added a sign-out button at the top right.

## 1 Jul 2026

- [Fix] **Old:** Fixed something long ago.
`;
const days = parseChangelog(SAMPLE);

describe("the changelog's weeks", () => {
	it("reads a day as written into a date", () => {
		expect(isoDate("24 Oct 2026")).toBe("2026-10-24");
		expect(isoDate("1 Jul 2026")).toBe("2026-07-01");
		expect(isoDate("Someday")).toBeNull();
	});

	it("lays the last 53 weeks out Monday to Sunday, up to today, each day's changes counted by kind", () => {
		const weeks = weeksOfChanges(days, "2026-10-24");
		expect(weeks).toHaveLength(WEEKS);
		expect(weeks[0]![0]!.date).toBe("2025-10-20");
		const last = weeks.at(-1)!;
		expect(last.map((c) => c?.date ?? null)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", null]);
		expect(last[5]!.counts).toEqual({ feature: 1, enhancement: 1, fix: 1 });
		expect(last[4]!.counts).toEqual({ feature: 1, enhancement: 0, fix: 0 });
		expect(last[3]!.counts).toEqual({ feature: 0, enhancement: 0, fix: 0 });
		// 1 Jul 2026 is inside the twelve months: counted too.
		expect(weeks.flat().reduce((n, c) => n + (c ? c.counts.fix : 0), 0)).toBe(2);
	});
});

describe("the Changelog's activity heatmap", () => {
	it("is a square a day, hoverable, with the months along the top and the twelve months in words", () => {
		const svg = activityHeatmap(weeksOfChanges(days, "2026-10-24"), null).__html;
		expect(svg).toContain('<figure class="heat weeks">');
		expect(svg.match(/<rect class="h\d"/g)).toHaveLength(WEEKS * 7 - 1);
		expect(svg).toContain("<title>Sat 24 Oct 2026: 1 feature, 1 enhancement, 1 fix</title>");
		expect(svg).toContain("<title>Fri 23 Oct 2026: 1 feature</title>");
		expect(svg).toContain("<title>Thu 22 Oct 2026: nothing</title>");
		expect(svg).toMatch(/<rect class="h5" x="\d+" y="\d+" width="12" height="12" rx="2">/);
		for (const month of ["Nov", "Jan", "Jul", "Oct"]) expect(svg).toContain(`>${month}</text>`);
		expect(svg).toContain(">Mon</text>");
		expect(svg).toContain("<b>Activity</b> <span class=\"small\">Changes a day, the last 12 months</span>");
		expect(svg).toContain("5 changes in the last 12 months, on 3 days: 2 features, 1 enhancement and 2 fixes. The busiest day was Sat 24 Oct 2026, with 3.");
	});

	it("counts one kind only when its chip is chosen, and says when there were none", () => {
		const svg = activityHeatmap(weeksOfChanges(days, "2026-10-24"), "fix").__html;
		expect(svg).toContain("<title>Sat 24 Oct 2026: 1 fix</title>");
		expect(svg).toContain("<title>Fri 23 Oct 2026: no fixes</title>");
		expect(svg).toContain("Fixes a day, the last 12 months");
		expect(svg).toContain("2 fixes in the last 12 months, on 2 days.</p>");
		const none = activityHeatmap(weeksOfChanges([], "2026-10-24"), null).__html;
		expect(none).toContain("No changes in the last 12 months.");
		expect(none).not.toContain("busiest");
	});
});
