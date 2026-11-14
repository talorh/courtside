import { afterEach, describe, expect, it, vi } from "vitest";
import { insertAddressTicket } from "../../../src/features/signin/access-repository.ts";
import { reportBounced } from "../../../src/features/signin/bounced-service.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

// The sign-in page's own tickets on the desk: the person who asked isn't signed in, so there's no reply from the site.
// The ticket says who they are, with their email to copy, and that writing to them is from the admin's own email.

afterEach(() => vi.restoreAllMocks());
const page = async (deps: ReturnType<typeof createTestDeps>, id: number) => (await (await makeClient(deps)(`/admin/support/${id}`)).text()).replaceAll("&#39;", "'");

describe("an access request's ticket", () => {
	it("shows the name, team and email asked with, the email to copy, and what to do, not a reply to nobody", async () => {
		const deps = createTestDeps();
		const id = await insertAddressTicket(deps.db, {
			kind: "access", email: "steph@example.com", title: "Access request: Steph Curry, Saints B12.1", nowIso: deps.now().toISOString(),
			message: "Steph Curry asked for access on the sign-in page.\n\nName: Steph Curry\nTeam: Saints B12.1\nEmail: steph@example.com\n\nTo let them in, add steph@example.com to the team's list.",
		});
		const html = await page(deps, id!);
		expect(html).toContain("<dt>Name</dt><dd>Steph Curry</dd><dt>Team</dt><dd>Saints B12.1</dd><dt>Email</dt><dd><code id=\"asked-email\">steph@example.com</code></dd>");
		expect(html).toContain('<button class="btn" type="button" data-copy="asked-email">Copy email</button>');
		expect(html).toContain("The site doesn't email them: they aren't signed in. To write to them, use your own email.");
		expect(html).toContain('<script type="module" src="/copy.js">');
		expect(html).not.toContain("It resolves itself");
		expect(html).not.toContain("A reply goes to nobody");
	});
});

describe("a bounced address's ticket", () => {
	it("shows the address to copy and says to add another for them", async () => {
		const deps = createTestDeps();
		vi.spyOn(console, "log").mockImplementation(() => {});
		await reportBounced(deps, "sam@hotmail.example");
		const html = await page(deps, 1);
		expect(html).toContain("<dt>Email</dt><dd><code id=\"asked-email\">sam@hotmail.example</code></dd>");
		expect(html).toContain("Emails to this address are bouncing, so the site can't send them a code. Add another address for them on their team's list.");
		expect(html).not.toContain("It resolves itself");
	});
});
