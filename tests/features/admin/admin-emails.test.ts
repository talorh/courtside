import { describe, expect, it } from "vitest";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";

const JANE = "jane@example.com";
const log = async (deps: TestDeps) => (await deps.db.prepare("SELECT action, detail FROM admin_log ORDER BY id").all()).results;

describe("a test email from Platform", () => {
	it("goes to the admins, is logged, and Platform says it went", async () => {
		const deps = createTestDeps();
		const res = await makeClient(deps)("/admin/test-email", form({}));
		expect(res.headers.get("Location")).toBe("/admin/platform");
		expect(deps.email.sent).toMatchObject([{ to: [MANAGER], subject: "Courtside: test email" }]);
		expect(await log(deps)).toEqual([{ action: "test_email", detail: "sent to 1 admin" }]);
		const page = await (await makeClient(deps)("/admin/platform")).text();
		expect(page).toContain("Last test email: Thu 15 Oct 2026, 11:00am, sent to 1 admin.");
		expect(page).toContain('<form method="post" action="/admin/test-email" class="inline"><button class="btn">');
	});

	it("says why when it didn't go, with the binding's code", async () => {
		const deps = createTestDeps();
		deps.email.failNext = "E_SENDER_NOT_VERIFIED";
		await makeClient(deps)("/admin/test-email", form({}));
		expect((await log(deps))[0]).toMatchObject({ action: "test_email", detail: "didn't go: Email failed (E_SENDER_NOT_VERIFIED): the binding refused it" });
		expect(await (await makeClient(deps)("/admin/platform")).text()).toContain("didn&#39;t go: Email failed (E_SENDER_NOT_VERIFIED)");
	});
});

describe("every admin hears about admins changing", () => {
	it("emails every admin, the one added included, when an admin is added; and the one removed too when one's removed", async () => {
		const deps = createTestDeps();
		await makeClient(deps)("/admin/admins", form({ email: JANE, again: JANE }));
		expect(deps.email.sent).toEqual([{ to: [JANE, MANAGER], subject: `Courtside: ${JANE} is a site admin now`, text: `${MANAGER} added ${JANE} as a site admin.\n\nAdmins: https://saints.example/admin/admins` }]);
		await makeClient(deps)("/admin/admins/remove", form({ email: JANE, confirm: "yes" }));
		expect(deps.email.sent[1]).toEqual({ to: [JANE, MANAGER], subject: `Courtside: ${JANE} isn't a site admin any more`, text: `${MANAGER} removed ${JANE} as a site admin.\n\nAdmins: https://saints.example/admin/admins` });
	});

	it("keeps the change when the email fails, and the log says it didn't go", async () => {
		const deps = createTestDeps();
		deps.email.failNext = "E_RATE_LIMIT_EXCEEDED";
		const res = await makeClient(deps)("/admin/admins", form({ email: JANE, again: JANE }));
		expect(res.headers.get("Location")).toBe("/admin/admins?done=added");
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM admins WHERE email = ? AND removed_at IS NULL").bind(JANE).first("n")).toBe(1);
		expect(await log(deps)).toEqual([{ action: "admin_added", detail: `${JANE} (the email about it didn't go: Email failed (E_RATE_LIMIT_EXCEEDED): the binding refused it)` }]);
	});
});
