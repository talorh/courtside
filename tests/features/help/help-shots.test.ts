import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { helpText } from "../../../src/features/help/help-knowledge.ts";
import { helpFor } from "../../../src/features/help/views/faq-item.ts";
import { helpSections } from "../../../src/features/help/views/help-page.ts";
import { ALL_DUTIES } from "../../../src/features/roster/roster-duties.ts";
import { B12_1 } from "../../helpers/fakes.ts";

// Help's screenshots: real pages, taken on staging with test data, each on the question it helps with.
describe("Help's screenshots", () => {
	it("every screenshot Help shows is a file in public/help, with words for a screen reader", () => {
		const html = helpSections(helpFor(B12_1, ALL_DUTIES), "manager").__html;
		const shots = [...html.matchAll(/<figure class="shot"><img src="\/help\/([a-z-]+)\.webp" alt="([^"]+)"/g)];
		expect(shots.map((m) => m[1])).toEqual([
			"manage-add-people", "manage-waiting", "manage-players", "fixture-add-game", "fixture", "roster-families", "roster-duties", "roster-change",
			"whatsapp-message", "signin-email", "signin-code", "signout", "teams", "upload", "upload", "golive", "watch-games", "clip-make", "clip-make-done",
			"photos", "roster",
		]);
		for (const m of shots) {
			expect(existsSync(`public/help/${m[1]}.webp`), m[1]).toBe(true);
			expect(m[2]!.length, m[1]).toBeGreaterThan(30);
		}
		// Everyone's Help has the sign-in ones; Watch only's shows the home page's buttons instead of the upload page.
		const family = helpSections(helpFor(B12_1, ALL_DUTIES), "watcher").__html;
		expect(family).toContain('/help/home.webp');
		expect(family).not.toContain('/help/upload.webp');
		// A coach's: the coach's clipboard, Add a note first.
		const coach = helpSections(helpFor(B12_1, ALL_DUTIES), "coach").__html;
		expect(coach).toContain('<figure class="shot"><img src="/help/coach-notes.webp" alt="Coaches&#39; notes on its clipboard');
		expect(existsSync("public/help/coach-notes.webp")).toBe(true);
		// The highlight clip's: the same plain example for every team.
		expect(html).toContain('/help/clip-make.webp" alt="Make a highlight clip, filled in: Start 1:42 and End 1:52 with Mark start and Mark end, the label Q3 Jordan&#39;s steal and layup');
	});
	it("Virtual Sam's knowledge leaves the screenshots out, as it does the mock screens", () => {
		const text = helpText(helpFor(B12_1, ALL_DUTIES), "manager");
		expect(text).not.toContain("/help/");
		expect(text).not.toContain("<figure");
	});
});
