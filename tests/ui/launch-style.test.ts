import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../../src/app/respond.ts";
import { launchPage } from "../../src/ui/landing-pages.ts";
import { LAUNCH_CSS, LAUNCH_CSS_HASH } from "../../src/ui/launch-style.ts";

const config = { streamCustomerCode: "c", accountId: "a" };

describe("the launch spinner's own look", () => {
	it("is in the page, with no stylesheet to wait for", () => {
		const page = launchPage().__html;
		expect(page).toContain(`<style>${LAUNCH_CSS}</style>`);
		// Only the club's colour tokens (/club.css, a few lines, cached a day), never app.css.
		expect(page.match(/rel="stylesheet"/g)).toHaveLength(1);
		expect(page).toContain('<link rel="stylesheet" href="/club.css">');
	});
	it("is allowed by its hash on the launch screen alone", () => {
		expect(LAUNCH_CSS_HASH).toBe(`sha256-${createHash("sha256").update(LAUNCH_CSS).digest("base64")}`);
		expect(contentSecurityPolicy(config, { launch: true })).toContain(`style-src 'self' '${LAUNCH_CSS_HASH}'`);
		expect(contentSecurityPolicy(config)).toContain("style-src 'self';");
	});
});
