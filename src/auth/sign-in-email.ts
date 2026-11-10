import { CLUB } from "../club.ts";
// The sign-in code's email in the site's style (like the
// welcome email): the green top bar, the code large in a card, and how long it's good for. Its plain text is sign-in-mail.ts's.
import { html } from "../shared/html.ts";
import { EMAIL, emailCard, emailShell } from "../ui/email-layout.ts";
import { CODE_MINUTES, JUNK_TIP, spaced } from "./sign-in-mail.ts";

export function codeEmailHtml(code: string, staging: boolean): string {
	return emailShell({
		title: `Your ${CLUB.siteName} sign-in code`,
		heading: CLUB.siteName,
		sub: staging ? "Your sign-in code for the staging site" : "Your sign-in code",
		rows: emailCard(html`<p style="${EMAIL.p}">Type this code on the sign-in page:</p><div style="${EMAIL.code}">${spaced(code)}</div>
<p style="${EMAIL.p}">It works for ${CODE_MINUTES} minutes, on the phone or computer that asked for it.</p>
<p style="${EMAIL.p}">${JUNK_TIP.before} <b>Not junk</b> ${JUNK_TIP.after}</p>`),
		footer: "If you didn't ask for a code, you can ignore this email: nobody can sign in without it. Private to each team's families and coaches.",
	});
}
