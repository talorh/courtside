import { CLUB } from "../../../club.ts";
// The sign-in page, in the look of the Access page it replaced (the same,
// without the Cloudflare Access banner): the green page, the white card with the logo, "Log in to the site
// Site", Email, Send login code, and the grey footer. Two steps on the one address: the email, then the code it was sent.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { TURNSTILE_ACTION } from "../../../platform/turnstile.ts";
import { entryPage } from "../../../ui/status-pages.ts";

export const TITLE = `Log in to ${CLUB.siteName}`;
export const CODE_TITLE = "Enter your login code";
const FOOTER = html`Private to each team's families and coaches. Can't get in? Ask your team manager, or <a href="/signin/access">raise an access request here</a>.`;

/** What the page says when something's wrong: fixed words, never anything typed. */
export const SIGN_IN_MESSAGES = {
	unknown: "That email address isn't on a team's list. Ask your team manager for access, or raise an access request (below).",
	limited: "Too many codes have been asked for. Try again later, or ask your team manager to let you back in sooner.",
	wrongLimited: "Too many wrong codes. Wait an hour and try again.",
	wrongHeld: "Too many wrong codes for this email address today. Ask your team manager to let you back in, or try again tomorrow.",
	wrong: "That code isn't right. Use the code in the newest email: asking for a new code stops the earlier ones working.",
	expired: "That code has run out. Send a new one.",
	notSent: "The code couldn't be emailed just now. Try again in a minute.",
	bounced: "Emails to this address are bouncing, so they've stopped for now. Ask your team manager to add another email address for you. The site's admins have been told.",
	robot: "The page couldn't confirm you're a person, not a robot. Wait a moment and try again.",
} as const;

export type SignInMessage = keyof typeof SIGN_IN_MESSAGES;

export interface SignInProps {
	step: "email" | "code";
	/** The address typed (shown on the code step, and kept in the email field after a refusal). */
	email: string;
	/** Where to go after signing in (a path on this site). */
	next: string;
	message: SignInMessage | null;
	/** The Turnstile widget's site key (config's turnstileSiteKey). */
	siteKey: string;
}

/** Turnstile (platform/turnstile.ts) on every form that sends a code: seen only if Cloudflare wants a tap, and its token
 * goes with the form (public/signin.js waits for it). */
export const robotCheck = (siteKey: string) =>
	html`<div class="cf-turnstile" data-sitekey="${siteKey}" data-action="${TURNSTILE_ACTION}" data-appearance="interaction-only" data-size="flexible"></div>`;

const warn = (message: SignInMessage | null) => (message ? html`<p class="note warn" role="alert">${SIGN_IN_MESSAGES[message]}</p>` : "");

function emailStep(p: SignInProps): SafeHtml {
	return html`${warn(p.message)}<form method="post" action="/signin"><input type="hidden" name="next" value="${p.next}">
<label>Email<input type="email" name="email" value="${p.email}" placeholder="example@email.com" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" autofocus required></label>
${robotCheck(p.siteKey)}<button class="btn primary big">Send login code</button></form>`;
}

function codeStep(p: SignInProps): SafeHtml {
	const again = html`<input type="hidden" name="email" value="${p.email}"><input type="hidden" name="next" value="${p.next}">`;
	// autocomplete="one-time-code": the phone offers the code from the email; data-code: signin.js tidies what's pasted
	// in and logs in at six digits.
	return html`${warn(p.message)}<p>We've sent a code to <b>${p.email}</b>. It works for 10 minutes. Can't find it? Check your junk or spam folder. On Hotmail or Outlook, mark it <b>Not junk</b> so the next one comes to your inbox.</p>
<form method="post" action="/signin/code">${again}
<label>Login code<input type="text" name="code" placeholder="123 456" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" autofocus required data-code></label>
<button class="btn primary big">Log in</button></form>
<form method="post" action="/signin" class="inline">${again}${robotCheck(p.siteKey)}<button class="btn quiet" data-resend>Send a new code</button></form>
<p class="small"><a href="/signin?next=${encodeURIComponent(p.next)}">Use another email</a></p>`;
}

/** The sign-in page, with its own small script (public/signin.js) and no team in its frame. */
export function signInPage(p: SignInProps): SafeHtml {
	return entryPage({ title: "Sign in", scripts: ["/signin.js"], preview: true }, p.step === "email" ? TITLE : CODE_TITLE, p.step === "email" ? emailStep(p) : codeStep(p), FOOTER);
}

/** Sign out without JavaScript (the door is a plain link then): a page with the one button. */
export function signOutPage(): SafeHtml {
	return entryPage({ title: "Sign out" }, "Sign out?", html`<p>You'll need a new code from your email to sign in again on this phone or computer.</p>
<form method="post" action="/signout"><button class="btn danger">Sign out</button></form>
<p class="small"><a href="/">Stay signed in</a></p>`);
}

/** Signed out (the plain page's way): Sign in again goes to the sign-in page. */
export function signedOutPage(): SafeHtml {
	return entryPage({ title: "Signed out" }, "Signed out", html`<p>You're signed out on this phone or computer. Signing in again takes a new code from your email.</p>
<p><a class="btn primary" href="/signin">Sign in again</a></p>`);
}
