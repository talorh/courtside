// The sign-in codes sent by email, and what happened at the sign-in page (the site's own sign-in). Site-wide
// by nature (a code is a person's, before any team is known), so a CROSS_TEAM exception in scripts/rules.mjs.
import { ALL_TIME, type LogRange } from "../shared/time.ts";

export interface LiveCode { id: number; codeHash: string; tries: number }

/** "robot": Turnstile said no (features/signin/signin-routes.ts). */
/** What happened at the sign-in page; and, once signed in, which view a device uses (first seen, or changed). */
export type SignInEvent = "code_sent" | "unknown_email" | "limited" | "wrong" | "signed_in" | "robot" | "desktop_view" | "mobile_view";

export async function insertCode(db: D1Database, c: { email: string; codeHash: string; ip: string; createdAt: string; expiresAt: string }): Promise<void> {
	await db.prepare("INSERT INTO sign_in_codes (email, code_hash, ip, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
		.bind(c.email.toLowerCase(), c.codeHash, c.ip, c.createdAt, c.expiresAt).run();
}

/** A newer code was asked for: the older ones are void from now. */
export async function voidCodes(db: D1Database, email: string, nowIso: string): Promise<void> {
	await db.prepare("UPDATE sign_in_codes SET voided_at = ? WHERE email = ? AND used_at IS NULL AND voided_at IS NULL").bind(nowIso, email.toLowerCase()).run();
}

/** The one code that can still sign this email in: the newest that's unused, not voided and not past its 10 minutes. */
export async function latestLiveCode(db: D1Database, email: string, nowIso: string): Promise<LiveCode | null> {
	return db.prepare(`SELECT id, code_hash AS codeHash, tries FROM sign_in_codes
		WHERE email = ? AND used_at IS NULL AND voided_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`)
		.bind(email.toLowerCase(), nowIso).first<LiveCode>();
}

/** Takes one of the code's tries, in the statement that checks one is left, so guesses sent at the same moment can't
 * share a try: which try this is (1 to `maxTries`), or null when there were none left. */
export async function claimTry(db: D1Database, id: number, maxTries: number): Promise<number | null> {
	return db.prepare("UPDATE sign_in_codes SET tries = tries + 1 WHERE id = ? AND tries < ? AND used_at IS NULL AND voided_at IS NULL RETURNING tries")
		.bind(id, maxTries).first<number>("tries");
}

/** A wrong try was the code's last: it's void from now. */
export async function voidCode(db: D1Database, id: number, nowIso: string): Promise<void> {
	await db.prepare("UPDATE sign_in_codes SET voided_at = COALESCE(voided_at, ?) WHERE id = ?").bind(nowIso, id).run();
}

/** The code signs a device in once: true if this request used it, false if another had already. */
export async function markCodeUsed(db: D1Database, id: number, nowIso: string): Promise<boolean> {
	return (await db.prepare("UPDATE sign_in_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(nowIso, id).run()).meta.changes === 1;
}

/** `device`: the browser that asked ("iPhone, Safari": shared/device.ts). */
export interface SignInEventInput { kind: SignInEvent; email: string; ip: string; at: string; device?: string }

export const signInEventStatement = (db: D1Database, e: SignInEventInput) =>
	db.prepare("INSERT INTO sign_in_events (kind, email, ip, at, device) VALUES (?, ?, ?, ?, ?)").bind(e.kind, e.email.toLowerCase(), e.ip, e.at, e.device ?? "");

export async function recordSignInEvent(db: D1Database, e: SignInEventInput): Promise<void> {
	await signInEventStatement(db, e).run();
}

/** How many events of a kind since `sinceIso`, for one email, one IP address, or the whole site (`by` left out). */
export async function countSignInEvents(db: D1Database, kind: SignInEvent, sinceIso: string, by: { email: string } | { ip: string } | null = null): Promise<number> {
	const where = by === null ? "" : "email" in by ? " AND email = ?" : " AND ip = ?";
	const value = by === null ? [] : "email" in by ? [by.email.toLowerCase()] : [by.ip];
	return (await db.prepare(`SELECT COUNT(*) AS n FROM sign_in_events WHERE kind = ? AND at > ?${where}`).bind(kind, sinceIso, ...value).first<number>("n")) ?? 0;
}

export interface SignInFigures { codesSent: number; wrong: number; refused: number; signedIn: number }

/** Platform's Sign-ins row: what happened since `sinceIso` (refused: unknown emails and requests over a limit). */
export async function signInFigures(db: D1Database, sinceIso: string): Promise<SignInFigures> {
	const { results } = await db.prepare("SELECT kind, COUNT(*) AS n FROM sign_in_events WHERE at > ? GROUP BY kind").bind(sinceIso).all<{ kind: SignInEvent; n: number }>();
	const n = (kind: SignInEvent) => results.find((r) => r.kind === kind)?.n ?? 0;
	return { codesSent: n("code_sent"), wrong: n("wrong"), refused: n("unknown_email") + n("limited") + n("robot"), signedIn: n("signed_in") };
}

export interface SignInLogLine { kind: SignInEvent; email: string; ip: string; at: string; device: string }

/** The admin area's Log: the newest `limit` of the sign-in's events in `range`, newest first (kept a month). */
export async function listSignInEvents(db: D1Database, limit: number, range: LogRange = ALL_TIME): Promise<SignInLogLine[]> {
	const { results } = await db.prepare("SELECT kind, email, ip, at, device FROM sign_in_events WHERE at >= ? AND at < ? ORDER BY at DESC, id DESC LIMIT ?")
		.bind(range.from, range.to, limit).all<SignInLogLine>();
	return results;
}

/** An address's hold (migration 0035): no codes until `until`; its counts start at `countFrom`, the moment a team manager
 * last let them in (the start of time if never), as a hold ending doesn't start them afresh (auth/sign-in-limits.ts). */
export interface SignInHold { until: string; countFrom: string }

const NEVER = "1970-01-01T00:00:00.000Z";

export async function getHold(db: D1Database, email: string): Promise<SignInHold | null> {
	return db.prepare("SELECT until, count_from AS countFrom FROM sign_in_holds WHERE email = ?").bind(email.toLowerCase()).first<SignInHold>();
}

/** Holds `email` until `untilIso`; when its counts start is left as it was. */
export async function holdEmail(db: D1Database, email: string, untilIso: string): Promise<void> {
	await db.prepare("INSERT INTO sign_in_holds (email, until, count_from) VALUES (?, ?, ?) ON CONFLICT (email) DO UPDATE SET until = excluded.until")
		.bind(email.toLowerCase(), untilIso, NEVER).run();
}

/** A team manager let them in (Manage team): the hold ends now, and the counts start afresh. */
export async function releaseHold(db: D1Database, email: string, nowIso: string): Promise<void> {
	await db.prepare("INSERT INTO sign_in_holds (email, until, count_from) VALUES (?, ?, ?) ON CONFLICT (email) DO UPDATE SET until = excluded.until, count_from = excluded.count_from")
		.bind(email.toLowerCase(), nowIso, nowIso).run();
}

/** Every address held right now (lower-cased) and until when: Manage team shows its own people among them. */
export async function heldEmails(db: D1Database, nowIso: string): Promise<Array<{ email: string; until: string }>> {
	const { results } = await db.prepare("SELECT lower(email) AS email, until FROM sign_in_holds WHERE until > ? ORDER BY email").bind(nowIso).all<{ email: string; until: string }>();
	return results;
}

/** The 3am job: codes older than a day, events older than a month, and holds over a day ago (and let in, if they were,
 * over a day ago), are deleted. */
export async function purgeSignInRecords(db: D1Database, codesBeforeIso: string, eventsBeforeIso: string): Promise<void> {
	await db.batch([
		db.prepare("DELETE FROM sign_in_codes WHERE created_at < ?").bind(codesBeforeIso),
		db.prepare("DELETE FROM sign_in_events WHERE at < ?").bind(eventsBeforeIso),
		db.prepare("DELETE FROM sign_in_holds WHERE until < ? AND count_from < ?").bind(codesBeforeIso, codesBeforeIso),
	]);
}
