import { CLUB, mailFrom } from "../club.ts";
// The sign-in code's email (the site's own sign-in). The one email the site sends to an address a visitor
// typed, and only once sign-in-service.ts has found it on a team's list or the admins table, so it's allowed the email
// port alongside features/admin/admin-mail.ts (scripts/rules.mjs).
import type { AppDeps } from "../app/deps.ts";
import { codeEmailHtml } from "./sign-in-email.ts";

/** How long a code is good for, as the email says it. */
export const CODE_MINUTES = 10;

/** Outlook and Hotmail junk a new sender's email until people say it's not junk. */
export const JUNK_TIP = { before: "Using Hotmail or Outlook? If this email was in Junk, mark it", after: `and add ${mailFrom()} to your contacts, so your next code comes straight to your inbox.` };

/** "482 913": the code with a space in the middle, easier to read off a phone (the sign-in page ignores the space). */
export const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

export function codeEmailText(code: string): string {
	return `Your ${CLUB.siteName} sign-in code is ${spaced(code)}

It works for ${CODE_MINUTES} minutes, on the phone or computer that asked for it.

${JUNK_TIP.before} Not junk ${JUNK_TIP.after}

If you didn't ask for a code, you can ignore this email: nobody can sign in without it.`;
}

export async function sendCodeEmail(deps: AppDeps, email: string, code: string): Promise<void> {
	const subject = `${deps.config.staging ? "[Staging] " : ""}Your ${CLUB.siteName} sign-in code is ${spaced(code)}`;
	await deps.email.send({ to: [email], subject, text: codeEmailText(code), html: codeEmailHtml(code, deps.config.staging) });
}
