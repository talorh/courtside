import { afterEach, describe, expect, it, vi } from "vitest";
import { countedEmail } from "../../../src/features/admin/counted-email.ts";
import { EMAILS_A_MONTH, emailsSentIn, monthKey } from "../../../src/features/admin/email-count-repository.ts";
import { checkEmailAllowance } from "../../../src/features/admin/usage-checks.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";

afterEach(() => vi.restoreAllMocks());

// The month's emails against Workers Paid's 3,000 (what needs doing at about 30 teams, done now):
// every email the site sends is counted by month, and the 5-minute job raises the alert as the count climbs.
const level = async (deps: TestDeps) => deps.db.prepare("SELECT level, detail FROM platform_alerts WHERE kind = 'email_allowance'").first<{ level: string; detail: string }>();
const seed = (deps: TestDeps, month: string, sent: number) => deps.db.prepare("INSERT INTO email_months (month, sent) VALUES (?, ?) ON CONFLICT (month) DO UPDATE SET sent = excluded.sent").bind(month, sent).run();

describe("counting the month's emails", () => {
	it("counts each email that went, by the month it went in, and none that didn't", async () => {
		const deps = createTestDeps(new Date("2026-11-30T13:30:00.000Z")); // 12:30am 1 Dec in the club's time zone: the month is the UTC one, as Cloudflare bills
		expect(monthKey(deps.now())).toBe("2026-11");
		const email = countedEmail(deps.email, deps.db, deps.now);
		await email.send({ to: ["a@x.com"], subject: "one", text: "x" });
		await email.send({ to: ["a@x.com", "b@x.com"], subject: "two", text: "x" });
		deps.email.failNext = "E_INTERNAL";
		await expect(email.send({ to: ["a@x.com"], subject: "three", text: "x" })).rejects.toThrow("E_INTERNAL");
		expect(await emailsSentIn(deps.db, "2026-11")).toBe(2);
		expect(await emailsSentIn(deps.db, "2026-12")).toBe(0);
		expect(EMAILS_A_MONTH).toBe(3000);
	});
	it("the count failing never fails the email: it's logged", async () => {
		const deps = createTestDeps();
		const broken = { prepare: () => { throw new Error("D1 hiccup"); } } as unknown as D1Database;
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await countedEmail(deps.email, broken, deps.now).send({ to: ["a@x.com"], subject: "one", text: "x" });
		expect(deps.email.sent).toHaveLength(1);
		expect(String(error.mock.calls[0]?.[0])).toContain("email_count_failed");
	});
});

describe("the month's email allowance, from the 5-minute job", () => {
	it("warns at 2,400 of 3,000, is urgent at 2,850, and clears under 2,300", async () => {
		const deps = createTestDeps(new Date("2026-11-20T00:00:00.000Z"));
		const levels: string[] = [];
		for (const sent of [100, 2399, 2400, 2849, 2850, 2350, 2299]) {
			await seed(deps, "2026-11", sent);
			await checkEmailAllowance(deps);
			levels.push((await level(deps))!.level);
		}
		expect(levels).toEqual(["ok", "ok", "warn", "warn", "urgent", "warn", "ok"]);
		expect((await level(deps))!.detail).toBe("2,299 of 3,000 emails this month");
	});
	it("Platform shows the month's emails against the 3,000, with the alert's standing", async () => {
		const deps = createTestDeps(new Date("2026-11-20T00:00:00.000Z"));
		await seed(deps, "2026-11", 1234);
		const page = await (await makeClient(deps)("/admin/platform")).text();
		expect(page).toContain("<h3>Emails this month</h3>");
		expect(page).toContain("<b>1,234</b> of 3,000 included with Workers Paid: sign-in codes, tickets and alerts.");
	});
});
