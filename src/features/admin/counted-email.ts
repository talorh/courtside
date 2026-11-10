// The email port with the month's count: every email that goes is counted (email-count-repository.ts), so
// Platform and the email_allowance alert can watch the 3,000 a month Workers Paid includes. The count failing never
// fails the email: it's logged. Wraps platform/email.ts in app/deps.ts, so it's allowed the port (scripts/rules.mjs).
import { logProblem } from "./problem-log.ts";
import type { EmailPort } from "../../platform/email.ts";
import { countEmailSent, monthKey } from "./email-count-repository.ts";

export function countedEmail(inner: EmailPort, db: D1Database, now: () => Date): EmailPort {
	return {
		async send(email) {
			await inner.send(email);
			try {
				await countEmailSent(db, monthKey(now()));
			} catch (err) {
				console.error(JSON.stringify({ event: "email_count_failed", teamId: null, error: String(err) }));
				await logProblem({ db, now, device: "" }, { kind: "site_problem", teamId: null, what: "An email that went couldn't be counted for the month's allowance", error: err });
			}
		},
	};
}
