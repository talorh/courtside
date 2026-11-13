// Request access: the form the sign-in page's "Can't get in?" opens (name, team, email, and the same robot check as the
// code), and what it says once it's sent.
import { CLUB } from "../../../club.ts";
import { html } from "../../../shared/html.ts";
import { entryPage } from "../../../ui/status-pages.ts";
import type { AccessResult } from "../access-service.ts";
import { robotCheck, SIGN_IN_MESSAGES } from "./signin-page.ts";

/** What the form says when it can't be sent: fixed words, never anything typed. */
export const ACCESS_MESSAGES: Record<Exclude<AccessResult, "sent"> | "robot", string> = {
	missing: "Fill in your name, your team and your email.",
	notEmail: "That isn't an email address. Check it and try again.",
	onList: "That email address is already on a team's list, so you can sign in with it now.",
	already: "There's already a request for that email address. The site's admin will add you as soon as they can.",
	busy: "A lot of requests have come in just now. Try again in an hour.",
	robot: SIGN_IN_MESSAGES.robot,
};

export interface AccessProps { name: string; team: string; email: string; message: keyof typeof ACCESS_MESSAGES | null; siteKey: string }

export function accessPage(p: AccessProps) {
	const warn = p.message ? html`<p class="note warn" role="alert">${ACCESS_MESSAGES[p.message]}</p>` : "";
	const signIn = p.message === "onList" ? html`<p><a class="btn primary" href="/signin">Sign in</a></p>` : "";
	return entryPage({ title: "Request access", scripts: ["/signin.js"] }, "Request access", html`${warn}${signIn}
<p>Not on your team's list yet? Tell the site's admin who you are and which team you're with, and they'll add you.</p>
<form method="post" action="/signin/access">
<label>Your name<input name="name" value="${p.name}" maxlength="80" autocomplete="name" required></label>
<label>Your team<input name="team" value="${p.team}" maxlength="80" placeholder="${CLUB.nickname} B12.1, say" required></label>
<label>Email<input type="email" name="email" value="${p.email}" placeholder="example@email.com" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required></label>
${robotCheck(p.siteKey)}<button class="btn primary big">Send request</button></form>
<p class="small"><a href="/signin">Back to sign in</a></p>`);
}

export function accessSentPage() {
	return entryPage({ title: "Request sent" }, "Request sent", html`<p>The site's admin has your request. Once you're on your
team's list, sign in with the email address you gave: nothing is emailed to you before then.</p>
<p><a class="btn primary" href="/signin">Back to sign in</a></p>`);
}
