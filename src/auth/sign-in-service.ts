// The site's own sign-in (in place of Cloudflare Access, which costs US$7 a person a
// month past 50). A code by email for an address on a team's list (or an admin's), then a 30-day session for that
// device. Limits keep the sign-in page from being hammered, and the whole site from burning its emails.
import type { AppDeps } from "../app/deps.ts";
import { isEmail } from "../features/members/members-service.ts";
import { randomToken, sameText, sha256Hex, sixDigitCode } from "./crypto.ts";
import { insertSession } from "./session-repository.ts";
import { claimTry, countSignInEvents, insertCode, latestLiveCode, markCodeUsed, recordSignInEvent, type SignInEvent, voidCode, voidCodes } from "./sign-in-codes-repository.ts";
import { holdIfWrongLimit, LIMITS, overCodeLimit, overWrongLimit, since } from "./sign-in-limits.ts";
import { CODE_MINUTES, sendCodeEmail } from "./sign-in-mail.ts";
import { loadViewer } from "./viewer.ts";

export const SESSION_DAYS = 30;
/** Wrong tries a code gets before it's void. */
export const MAX_TRIES = 5;
const MINUTE = 60_000, HOUR = 3_600_000;

export type CodeRequest = "sent" | "unknown" | "limited";
/** "limited": this IP address's wrong codes this hour; "held": this address's wrong codes today. */
export type CodeCheck = { token: string; expiresAt: string } | "wrong" | "expired" | "limited" | "held";

/** "t…@gmail.com": enough to tell addresses apart in the logs, not enough to be one. Something that isn't an address
 * keeps only its first letter, so nothing typed into the email field is logged as it was. */
export const maskEmail = (email: string) => (email.includes("@") ? email.replace(/^(.).*?(@.*)$/, "$1…$2") : `${email.slice(0, 1)}…`);
const log = (event: string, email: string, detail: Record<string, unknown>) => console.log(JSON.stringify({ event, teamId: null, email: maskEmail(email), ...detail }));

const hashOf = (email: string, code: string) => sha256Hex(`${email}:${code.replace(/\s+/g, "")}`);
/** What a sign-in event stores: the address, or, for anything typed that isn't one, its masked form (the admin Log shows
 * these rows, so nothing typed into the field is kept as it was). */
const stored = (email: string) => (isEmail(email) ? email : maskEmail(email));

/** Whether this address is anyone's: on a team's list (a closed team's too, for its videos) or a site admin. */
async function isKnown(deps: AppDeps, email: string): Promise<boolean> {
	const viewer = await loadViewer(deps.db, email, deps.now());
	return viewer.isAdmin || viewer.memberships.length > 0;
}

/** Sends a code to `email` if it's anyone's and within the limits. `ip`: who's asking, for the limits. Throws if the
 * email can't be sent (the page says so). */
export async function requestCode(deps: AppDeps, rawEmail: string, ip: string): Promise<CodeRequest> {
	const email = rawEmail.trim().toLowerCase();
	const at = deps.now().toISOString();
	const note = (kind: SignInEvent) => recordSignInEvent(deps.db, { kind, email: stored(email), ip, at, device: deps.device });
	// An IP address trying address after address (none on a list) is slowed like one asking for code after code.
	if (await countSignInEvents(deps.db, "unknown_email", since(deps.now(), 15 * MINUTE), { ip }) >= LIMITS.unknownPerIp15m) {
		await note("limited");
		log("signin_refused", email, { why: "limited" });
		return "limited";
	}
	if (!isEmail(email) || !(await isKnown(deps, email))) {
		await note("unknown_email");
		log("signin_refused", email, { why: "unknown" });
		return "unknown";
	}
	if (await overCodeLimit(deps, email, ip)) {
		await note("limited");
		log("signin_refused", email, { why: "limited" });
		return "limited";
	}
	const code = sixDigitCode();
	await voidCodes(deps.db, email, at);
	await insertCode(deps.db, { email, codeHash: await hashOf(email, code), ip, createdAt: at, expiresAt: new Date(deps.now().getTime() + CODE_MINUTES * MINUTE).toISOString() });
	await sendCodeEmail(deps, email, code);
	// Counted once it has gone, so a code the email service dropped doesn't count toward the address's hold.
	await note("code_sent");
	log("signin_code_sent", email, {});
	return "sent";
}

/** Checks `code` for `email`; right, a new session for this device (its token goes in the cookie, its hash in the database). */
export async function verifyCode(deps: AppDeps, rawEmail: string, code: string, ip: string, device: string): Promise<CodeCheck> {
	const email = rawEmail.trim().toLowerCase();
	const now = deps.now(), at = now.toISOString();
	const note = (kind: SignInEvent) => recordSignInEvent(deps.db, { kind, email: stored(email), ip, at, device: deps.device });
	if (await countSignInEvents(deps.db, "wrong", since(now, HOUR), { ip }) >= LIMITS.wrongPerIpHour) {
		await note("limited");
		log("signin_refused", email, { why: "wrong codes" });
		return "limited";
	}
	if (await overWrongLimit(deps.db, email, now)) {
		await note("limited");
		log("signin_refused", email, { why: "wrong codes today" });
		return "held";
	}
	const live = await latestLiveCode(deps.db, email, at);
	// The try is taken before the code is looked at, so guesses sent together get no more than the code's tries.
	const tryNumber = live ? await claimTry(deps.db, live.id, MAX_TRIES) : null;
	if (!live || tryNumber === null) return "expired";
	if (!sameText(await hashOf(email, code), live.codeHash)) {
		if (tryNumber >= MAX_TRIES) await voidCode(deps.db, live.id, at);
		await note("wrong");
		await holdIfWrongLimit(deps.db, email, now);
		log("signin_checked", email, { ok: false, tries: tryNumber });
		return "wrong";
	}
	if (!(await markCodeUsed(deps.db, live.id, at))) return "expired";
	await note("signed_in");
	const token = randomToken();
	const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * HOUR).toISOString();
	await insertSession(deps.db, { id: await sha256Hex(token), email, device, createdAt: at, expiresAt });
	log("signin_checked", email, { ok: true, device });
	return { token, expiresAt };
}
