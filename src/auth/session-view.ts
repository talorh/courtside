// Which view a signed-in device uses, the desktop view or the mobile one: public/view.js says in the courtside_view
// cookie on every page. Noted on the session, a sign-in event (the admin Log) when it's first seen or changes, and the
// device counted once a week in the week's tally (Insights' Mobile and desktop).
import { localDate, mondayOf } from "../shared/time.ts";
import { countedStatements, viewEventStatement } from "./device-view-repository.ts";
import { DEVICE_VIEWS, type DeviceView, type Session, sessionViewStatement } from "./session-repository.ts";
import { readCookie, requestIp } from "./session.ts";

export const VIEW_COOKIE = "courtside_view";

/** The view the request's cookie says, or null without one (or one saying anything else). */
export function readDeviceView(req: Request): DeviceView | null {
	const value = readCookie(req, VIEW_COOKIE);
	return DEVICE_VIEWS.find((v) => v === value) ?? null;
}

/** One batch, only when something's new: a changed view (with its event), or the first request of a local week. The
 * session row was read a moment ago, so each write applies only where the row still differs, and the event and the
 * count follow only when it did: two requests at once from one device make one line and count it once. */
export async function noteDeviceView(db: D1Database, session: Session, req: Request, now: Date): Promise<void> {
	const view = readDeviceView(req) ?? session.view;
	if (!view) return;
	const statements: D1PreparedStatement[] = [];
	if (view !== session.view) {
		statements.push(sessionViewStatement(db, session.id, view), viewEventStatement(db, { kind: `${view}_view`, email: session.email, ip: requestIp(req), at: now.toISOString(), device: session.device }));
	}
	const week = mondayOf(localDate(now));
	if (session.countedWeek !== week) statements.push(...countedStatements(db, session.id, week, view));
	if (statements.length) await db.batch(statements);
}
