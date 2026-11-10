import { afterEach, describe, expect, it, vi } from "vitest";
import { mailAdmins } from "../../src/features/admin/admin-mail.ts";
import { createEmail } from "../../src/platform/email.ts";
import { createTestDeps } from "../helpers/fakes.ts";
import { MANAGER } from "../helpers/app.ts";

afterEach(() => vi.restoreAllMocks());

/** The send_email binding, faked: what it was given, or the error it throws. */
function fakeBinding(error?: { code: string; message: string }) {
	const sent: unknown[] = [];
	const binding = {
		async send(message: unknown) {
			if (error) throw Object.assign(new Error(error.message), { code: error.code });
			sent.push(message);
			return { messageId: "m1" };
		},
	};
	return { binding: binding as unknown as SendEmail, sent };
}

describe("the email port", () => {
	it("sends one plain text email from Courtside <alerts@saints.example>, with Reply-To when given", async () => {
		const { binding, sent } = fakeBinding();
		await createEmail(binding, { email: "alerts@saints.example", name: "Courtside" }).send({ to: ["a@x.com", "b@x.com"], subject: "Courtside: test email", text: "Hello", replyTo: "jane@example.com" });
		await createEmail(binding, { email: "alerts@saints.example", name: "Courtside" }).send({ to: ["a@x.com"], subject: "S", text: "T" });
		expect(sent).toEqual([
			{ to: ["a@x.com", "b@x.com"], from: { email: "alerts@saints.example", name: "Courtside" }, subject: "Courtside: test email", text: "Hello", replyTo: "jane@example.com" },
			{ to: ["a@x.com"], from: { email: "alerts@saints.example", name: "Courtside" }, subject: "S", text: "T" },
		]);
	});

	it("sends an HTML part beside the plain text when given one (a team's welcome)", async () => {
		const { binding, sent } = fakeBinding();
		await createEmail(binding, { email: "alerts@saints.example", name: "Courtside" }).send({ to: ["a@x.com"], subject: "S", text: "T", html: "<p>T</p>" });
		expect(sent).toEqual([{ to: ["a@x.com"], from: { email: "alerts@saints.example", name: "Courtside" }, subject: "S", text: "T", html: "<p>T</p>" }]);
	});

	it("refuses a subject or address with a line break (header injection), sending nothing", async () => {
		const { binding, sent } = fakeBinding();
		const email = createEmail(binding, { email: "alerts@saints.example", name: "Courtside" });
		await expect(email.send({ to: ["a@x.com"], subject: "Hi\r\nBcc: z@x.com", text: "T" })).rejects.toThrow(/line break/);
		await expect(email.send({ to: ["a@x.com\nBcc: z@x.com"], subject: "S", text: "T" })).rejects.toThrow(/line break/);
		await expect(email.send({ to: ["a@x.com"], subject: "S", text: "T", replyTo: "j@x.com\r\nX: y" })).rejects.toThrow(/line break/);
		expect(sent).toEqual([]);
	});

	it("throws the binding's error with its code, never swallowing it", async () => {
		const { binding } = fakeBinding({ code: "E_SENDER_NOT_VERIFIED", message: "sender domain not verified" });
		await expect(createEmail(binding, { email: "alerts@saints.example", name: "Courtside" }).send({ to: ["a@x.com"], subject: "S", text: "T" })).rejects.toThrow("Email failed (E_SENDER_NOT_VERIFIED): sender domain not verified");
	});
});

describe("emailing the admins", () => {
	it("sends to every current admin, from the admins table when sending, never to anyone a caller names", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO admins (email, added_by, added_at) VALUES ('jane@example.com', ?, '2026-10-15T00:00:00.000Z'), ('gone@example.com', ?, '2026-10-15T00:00:00.000Z')").bind(MANAGER, MANAGER).run();
		await deps.db.prepare("UPDATE admins SET removed_at = '2026-10-15T01:00:00.000Z' WHERE email = 'gone@example.com'").run();
		expect(await mailAdmins(deps, { subject: "Courtside: test email", text: "Hello", replyTo: "p@x.com" })).toEqual({ sent: 2 });
		expect(deps.email.sent).toEqual([{ to: ["jane@example.com", MANAGER].sort(), subject: "Courtside: test email", text: "Hello", replyTo: "p@x.com" }]);
		// The message is all a caller gives: no recipients.
		expect(mailAdmins.length).toBe(2);
	});

	it("sends nothing when there are no admins, and says so", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("UPDATE admins SET removed_at = '2026-10-15T01:00:00.000Z'").run();
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await mailAdmins(deps, { subject: "S", text: "T" })).toEqual({ sent: 0 });
		expect(deps.email.sent).toEqual([]);
		expect(String(logged.mock.calls[0]?.[0])).toContain("admin_mail_no_admins");
	});
});
