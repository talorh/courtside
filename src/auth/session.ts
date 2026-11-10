// Who's asking (the site's own sign-in): the session cookie, hashed and looked up, gives the email every
// request runs as. The local dev sign-in
// (`DEV_AUTH_EMAIL`) still works only on localhost.
import { unauthenticated } from "../app/errors.ts";
import { sha256Hex } from "./crypto.ts";
import { endSession, findLiveSession, touchSession } from "./session-repository.ts";
import { noteDeviceView } from "./session-view.ts";
import { SESSION_DAYS } from "./sign-in-service.ts";

/** Resolves the signed-in email for a request, or throws a 401 HttpError. */
export type Authenticate = (req: Request) => Promise<string>;

export const SESSION_COOKIE = "courtside_session";
// HttpOnly: no page script reads it. Lax: sent on a link into the site, never on another site's post (the same-origin
// check on posts stands too). Path=/ with no Domain, so staging's address and the live site's are each their own.
const ATTRIBUTES = "Path=/; Secure; HttpOnly; SameSite=Lax";
/** Last seen is written at most this often per session: a nicety, not a write on every request. */
const TOUCH_MS = 3_600_000;

export const sessionCookie = (token: string) => `${SESSION_COOKIE}=${token}; ${ATTRIBUTES}; Max-Age=${SESSION_DAYS * 86_400}`;
export const clearedSessionCookie = () => `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;

/** One cookie's value, or null. */
export function readCookie(req: Request, cookie: string): string | null {
	for (const part of (req.headers.get("Cookie") ?? "").split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === cookie) return rest.join("=") || null;
	}
	return null;
}

/** The session token the browser sent, or null. */
export const readSessionToken = (req: Request) => readCookie(req, SESSION_COOKIE);

/** The internet address a request came from, as Cloudflare saw it. */
export const requestIp = (req: Request) => req.headers.get("CF-Connecting-IP") ?? "";

/** The request's session (not signed out, not past its 30 days), or null. */
export async function currentSession(db: D1Database, req: Request, now: Date) {
	const token = readSessionToken(req);
	return token ? findLiveSession(db, await sha256Hex(token), now.toISOString()) : null;
}

/** When this request's sign-in started and runs out (ms since 1970), or null without a live session (local dev too). */
export async function sessionTimes(db: D1Database, req: Request, now: Date): Promise<{ issuedAt: number; endsAt: number } | null> {
	const session = await currentSession(db, req, now);
	return session ? { issuedAt: Date.parse(session.createdAt), endsAt: Date.parse(session.expiresAt) } : null;
}

/** Ends the request's session, if it has one (sign out, or Go live renewing one that runs out mid-game). */
export async function endRequestSession(db: D1Database, req: Request, now: Date): Promise<void> {
	const token = readSessionToken(req);
	if (token) await endSession(db, await sha256Hex(token), now.toISOString());
}

export function sessionAuthenticator(o: { db: D1Database; now: () => Date; devAuthEmail: string | null }): Authenticate {
	return async (req) => {
		if (o.devAuthEmail && new URL(req.url).hostname === "localhost") return o.devAuthEmail;
		const now = o.now();
		const session = await currentSession(o.db, req, now);
		// Also what a page script shows when its call finds the session gone (upload-net.js answer()).
		if (!session) throw unauthenticated("You've been signed out. Reload the page and sign in.");
		if (!session.lastSeenAt || now.getTime() - Date.parse(session.lastSeenAt) > TOUCH_MS) await touchSession(o.db, session.id, now.toISOString());
		await noteDeviceView(o.db, session, req, now);
		return session.email.toLowerCase();
	};
}
