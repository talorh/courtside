import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../../../src/app/handle-request.ts";
import { buildRouter } from "../../../src/app/routes.ts";
import { buildAdminRouter } from "../../../src/features/admin/admin-routes.ts";
import { SIGN_IN_MESSAGES } from "../../../src/features/signin/views/signin-page.ts";
import { MANAGER } from "../../helpers/app.ts";
import { B12_1, createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember } from "../../helpers/two-teams.ts";

// A sign-in code to an address Email Sending won't send to (it bounced, or was marked as spam): the page says so instead
// of "try again in a minute", and the site's admins get one ticket about it, so they can add another address.

afterEach(() => vi.restoreAllMocks());

const STEPH = "steph@example.com";
const refuse = async (): Promise<string> => { throw new Error("not signed in"); };
const askForCode = (deps: TestDeps, email = STEPH) => handleRequest(new Request("https://saints.example/signin", {
	method: "POST", headers: { Origin: "https://saints.example", "CF-Connecting-IP": "1.2.3.4" },
	body: new URLSearchParams({ email, next: "/", "cf-turnstile-response": "tok" }),
}), deps, refuse, buildRouter(), buildAdminRouter());
const text = async (res: Response) => (await res.text()).replaceAll("&#39;", "'");
const tickets = (deps: TestDeps) => deps.db.prepare("SELECT source, alert_kind, title, topic, contact, status FROM support_requests ORDER BY id").all().then((r) => r.results);

async function bounced(): Promise<TestDeps> {
	const deps = createTestDeps();
	await addMember(deps.db, B12_1.id, STEPH, "watcher", "Steph");
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	return deps;
}

describe("A sign-in code to an address that bounces", () => {
	it("says the address is bouncing and to ask for another, not to try again in a minute", async () => {
		const deps = await bounced();
		deps.email.failNext = "E_RECIPIENT_SUPPRESSED";
		const res = await askForCode(deps);
		const page = await text(res);
		expect(res.status).toBe(502);
		expect(page).toContain(SIGN_IN_MESSAGES.bounced);
		expect(page).not.toContain(SIGN_IN_MESSAGES.notSent);
		expect(SIGN_IN_MESSAGES.bounced).toBe("Emails to this address are bouncing, so they've stopped for now. Ask your team manager to add another email address for you. The site's admins have been told.");
	});

	it("opens one ticket for the admins, emailed to them, however often it's tried", async () => {
		const deps = await bounced();
		for (let i = 0; i < 3; i++) {
			deps.email.failNext = "E_RECIPIENT_SUPPRESSED";
			await askForCode(deps);
		}
		expect(await tickets(deps)).toEqual([{
			source: "site", alert_kind: `bounced:${STEPH}`, title: `Emails to ${STEPH} are bouncing`, topic: "members", contact: STEPH, status: "new",
		}]);
		expect(deps.email.sent.map((e) => e.to)).toEqual([[MANAGER]]);
		expect(deps.email.sent[0]!.text).toContain("Email Sending");
	});

	it("still says try again in a minute when the email service itself fails", async () => {
		const deps = await bounced();
		deps.email.failNext = "E_INTERNAL_SERVER_ERROR";
		const page = await text(await askForCode(deps));
		expect(page).toContain(SIGN_IN_MESSAGES.notSent);
		expect(await tickets(deps)).toEqual([]);
	});
});
