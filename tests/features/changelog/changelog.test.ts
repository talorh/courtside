import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newestChange, parseChangelog } from "../../../src/features/changelog/changelog.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

const SAMPLE = `# Changelog

What changed, newest first.

## 24 Oct 2026

- [Fix] **Go live:** Fixed an issue where a tap could be ignored.
- [Feature] **Roster:** Added one-off duties.
- [Enhancement] The site loads faster.

## 23 Oct 2026

- [Feature] **Sign out:** Added a sign-out button at the top right.
`;

describe("the changelog", () => {
	it("reads each day's changes in the order written, each a feature, an enhancement or a fix, with its area", () => {
		expect(parseChangelog(SAMPLE)).toEqual([
			{ date: "24 Oct 2026", changes: [
				{ kind: "fix", area: "Go live", text: "Fixed an issue where a tap could be ignored." },
				{ kind: "feature", area: "Roster", text: "Added one-off duties." },
				{ kind: "enhancement", area: null, text: "The site loads faster." },
			] },
			{ date: "23 Oct 2026", changes: [{ kind: "feature", area: "Sign out", text: "Added a sign-out button at the top right." }] },
		]);
	});

	it("gives the newest line as the deploy's message, in plain words: its area and what changed", () => {
		expect(newestChange(SAMPLE)).toBe("Go live: Fixed an issue where a tap could be ignored.");
		expect(newestChange("# Changelog\n")).toBeNull();
	});

	it("the repo's CHANGELOG.md reads cleanly: newest day first, every line a feature, enhancement or fix, a sentence, no dashes", () => {
		const text = readFileSync("CHANGELOG.md", "utf8");
		const days = parseChangelog(text);
		expect(days.length).toBeGreaterThanOrEqual(1);
		expect(days.at(-1)!.date).toBe("11 Nov 2026"); // the first release
		const lines = text.split("\n").filter((l) => l.startsWith("- "));
		for (const line of lines) expect(line, line).toMatch(/^- \[(Feature|Enhancement|Fix)\] (\*\*[^*]+:\*\* )?[A-Z0-9].*\.$/);
		for (const day of days) {
			expect(day.date).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
			for (const change of day.changes) expect(change.text).not.toMatch(/[–—]/);
		}
	});
});

describe("the admin Changelog page", () => {
	it("shows each day as release notes: Features, Enhancements and Fixes, each change with its area in bold", async () => {
		const page = await (await makeClient(createTestDeps())("/admin/changelog")).text();
		const day = page.slice(page.indexOf('<section class="panel release">'), page.indexOf("</section>", page.indexOf('<section class="panel release">')));
		expect(day).toMatch(/<h2>\d{1,2} [A-Z][a-z]{2} \d{4}<\/h2>/);
		expect(day).toMatch(/<h3 class="rkind k-(feature|enhancement|fix)">(Features|Enhancements|Fixes) <span class="n">\d+<\/span><\/h3>/);
		expect(day).toMatch(/<li><b>[^<]+:<\/b> [A-Z]/);
		// Features first, then enhancements, then fixes, whatever order they were written in.
		const order = [...page.matchAll(/<h3 class="rkind k-(\w+)">/g)].map((m) => m[1]);
		expect(order.length).toBeGreaterThanOrEqual(1);
		for (const chip of ["All", "Features", "Enhancements", "Fixes"]) expect(page).toContain(`>${chip} <span class="n">`);
	});

	it("shows one kind of change when its chip is chosen", async () => {
		const page = await (await makeClient(createTestDeps())("/admin/changelog?type=feature")).text();
		expect(page).toContain('<a class="chip" href="/admin/changelog?type=feature" aria-current="true">Features');
		expect(page).not.toContain('class="rkind k-fix"');
		expect(page).not.toContain('class="rkind k-enhancement"');
		expect(page).toContain('class="rkind k-feature"');
	});
});
