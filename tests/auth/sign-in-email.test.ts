import { describe, expect, it } from "vitest";
import { codeEmailHtml } from "../../src/auth/sign-in-email.ts";
import { codeEmailText } from "../../src/auth/sign-in-mail.ts";

// The sign-in code's email in the site's style (like the
// welcome email): the green top bar, the code large in a card, the plain text beside it for email apps without HTML.
describe("the sign-in code email", () => {
	it("carries the code large and spaced, how long it's good for, and no image (a short email with one looks like spam to Outlook)", () => {
		const page = codeEmailHtml("482913", false);
		expect(page).toContain("<title>Your Courtside sign-in code</title>");
		expect(page).toContain(">482 913<");
		expect(page).not.toContain("<img");
		expect(page).toContain(">Courtside<");
		expect(page).toContain(">Your sign-in code<");
		expect(page).toContain("It works for 10 minutes, on the phone or computer that asked for it.");
		expect(page).toContain("If you didn&#39;t ask for a code, you can ignore this email: nobody can sign in without it.");
		expect(page).not.toContain("Staging");
		// The code's box is in the club's colours (a plain string once left the placeholder in, and a fixed green).
		expect(page).toContain("background:#E4ECFB;border-radius:8px;text-align:center;font-size:36px;font-weight:800;letter-spacing:4px;line-height:1.2;color:#14274E");
		expect(page).not.toContain("${");
	});
	it("tells Hotmail and Outlook users how to get the next code in their inbox, in both its HTML and plain text", () => {
		expect(codeEmailHtml("482913", false)).toContain("Using Hotmail or Outlook? If this email was in Junk, mark it <b>Not junk</b> and add alerts@saints.example to your contacts");
		expect(codeEmailText("482913")).toContain("Using Hotmail or Outlook? If this email was in Junk, mark it Not junk and add alerts@saints.example to your contacts, so your next code comes straight to your inbox.");
	});
	it("says it's the staging site's code when it is, and its plain text says the same things", () => {
		expect(codeEmailHtml("482913", true)).toContain("the staging site");
		expect(codeEmailText("482913")).toContain("482 913");
	});
});
