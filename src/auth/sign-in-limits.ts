// The sign-in's limits (docs/architecture.md, Signing in), so the sign-in page can't be hammered, a code
// can't be guessed by asking for code after code, and the site can't burn its emails. An IP address can be a gym's
// Wi-Fi, or many phones behind a phone company's one address, so most limits are an address's.
import type { AppDeps } from "../app/deps.ts";
import { findOpenSiteTicket, insertSiteTicket } from "../features/admin/support-desk-repository.ts";
import { trySend } from "../features/admin/support-desk-service.ts";
import { countSignInEvents, getHold, holdEmail, type SignInHold } from "./sign-in-codes-repository.ts";

/** An email's codes an hour (then held HOLD_MINUTES, and again while the hour still has that many) and a day, and its
 * wrong codes a day (then held a day); an IP address's codes and unknown addresses, and the site's codes; an IP
 * address's wrong codes. A team manager letting someone in (Manage team) ends a hold and starts their counts afresh. */
export const LIMITS = { emailPerHour: 10, emailPerDay: 20, wrongPerEmailDay: 15, ipPer15m: 30, unknownPerIp15m: 10, sitePerHour: 200, wrongPerIpHour: 30 };
export const HOLD_MINUTES = 15;
const MINUTE = 60_000, HOUR = 3_600_000, DAY = 24 * HOUR;

export const since = (now: Date, ms: number) => new Date(now.getTime() - ms).toISOString();
const later = (now: Date, ms: number) => new Date(now.getTime() + ms).toISOString();

/** Counting starts `ms` ago, or when a team manager last let them in if that's later. A hold ending doesn't start
 * it afresh: if it did, an address could be sent 10 codes every 15 minutes, all day. */
function countFrom(hold: SignInHold | null, now: Date, ms: number): string {
	const from = since(now, ms);
	return hold && hold.countFrom > from ? hold.countFrom : from;
}

const wrongToday = (db: D1Database, email: string, hold: SignInHold | null, now: Date) =>
	countSignInEvents(db, "wrong", countFrom(hold, now, DAY), { email });

/** Held, or over its codes in the hour or the day, or its wrong codes today: held from now (15 minutes, or a day). */
async function overEmailLimit(db: D1Database, email: string, now: Date): Promise<boolean> {
	const hold = await getHold(db, email);
	if ((hold?.until ?? "") > now.toISOString()) return true;
	const codes = (ms: number) => countSignInEvents(db, "code_sent", countFrom(hold, now, ms), { email });
	if (await wrongToday(db, email, hold, now) >= LIMITS.wrongPerEmailDay || await codes(DAY) >= LIMITS.emailPerDay) {
		await holdEmail(db, email, later(now, DAY));
		return true;
	}
	if (await codes(HOUR) < LIMITS.emailPerHour) return false;
	await holdEmail(db, email, later(now, HOLD_MINUTES * MINUTE));
	return true;
}

export async function overCodeLimit(deps: AppDeps, email: string, ip: string): Promise<boolean> {
	const { db } = deps, now = deps.now();
	const count = (sinceMs: number, by: { ip: string } | null) => countSignInEvents(db, "code_sent", since(now, sinceMs), by);
	if (await overEmailLimit(db, email, now)) return true;
	if (await count(15 * MINUTE, { ip }) >= LIMITS.ipPer15m) return true;
	if (await count(HOUR, null) < LIMITS.sitePerHour) return false;
	await floodTicket(deps);
	return true;
}

/** An address's wrong codes today (since a team manager let them in, if later) have reached the day's limit. */
export async function overWrongLimit(db: D1Database, email: string, now: Date): Promise<boolean> {
	return await wrongToday(db, email, await getHold(db, email), now) >= LIMITS.wrongPerEmailDay;
}

/** The wrong code just counted was the day's last: the address is held for a day, so no more codes are sent to it, and
 * its team manager sees it waiting on Manage team. */
export async function holdIfWrongLimit(db: D1Database, email: string, now: Date): Promise<void> {
	if (await overWrongLimit(db, email, now)) await holdEmail(db, email, later(now, DAY));
}

/** The whole site is over its codes an hour: a ticket for the admins, once while it's open (emailed as every site ticket). */
async function floodTicket(deps: AppDeps): Promise<void> {
	const kind = "signin_flood";
	if (await findOpenSiteTicket(deps.db, kind)) return;
	const id = await insertSiteTicket(deps.db, {
		alertKind: kind, title: "Sign-in codes paused: too many asked for",
		message: `More than ${LIMITS.sitePerHour} sign-in codes were asked for in an hour, so no more are being sent until it slows down (each is an email).`
			+ " Platform's Sign-ins row shows what's happening. If it isn't families, the zone's WAF and rate limits are where to look.",
		nowIso: deps.now().toISOString(),
	});
	await trySend(deps, "ticket", id);
}
