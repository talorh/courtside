// The devices that opened the site each week, by view (Insights' Mobile and desktop): a count a week a view, each
// signed-in device counted once a week (session-view.ts). Counts of devices, never people, so site-wide (a CROSS_TEAM
// exception in scripts/rules.mjs), and kept 12 weeks.
import { DEVICE_VIEWS, type DeviceView } from "./session-repository.ts";

/** The device counted in `week`'s tally for `view`, and its session marked as counted this week: the mark only where the
 * week differs, and the count only when the mark changed a row (changes()), so two requests at once count the device once. */
export const countedStatements = (db: D1Database, sessionId: string, week: string, view: DeviceView) => [
	db.prepare("UPDATE sessions SET counted_week = ? WHERE id = ? AND counted_week IS NOT ?").bind(week, sessionId, week),
	db.prepare("INSERT INTO view_weeks (week, view, devices) SELECT ?, ?, 1 WHERE changes() = 1 ON CONFLICT (week, view) DO UPDATE SET devices = devices + 1").bind(week, view),
];

/** A Log line for the view a device uses, written only when the statement before it (the session's view) changed a row. */
export const viewEventStatement = (db: D1Database, e: { kind: `${DeviceView}_view`; email: string; ip: string; at: string; device: string }) =>
	db.prepare("INSERT INTO sign_in_events (kind, email, ip, at, device) SELECT ?, ?, ?, ?, ? WHERE changes() = 1").bind(e.kind, e.email, e.ip, e.at, e.device);

/** How many devices are signed in right now in each view, and how many haven't said yet. */
export async function liveSessionsByView(db: D1Database, nowIso: string): Promise<Record<DeviceView | "unknown", number>> {
	const { results } = await db.prepare("SELECT view, COUNT(*) AS n FROM sessions WHERE ended_at IS NULL AND expires_at > ? GROUP BY view")
		.bind(nowIso).all<{ view: DeviceView | null; n: number }>();
	const of = (view: DeviceView | null) => results.find((r) => r.view === view)?.n ?? 0;
	return { desktop: of("desktop"), mobile: of("mobile"), unknown: of(null) };
}

/** The devices that opened the site in each view in each of `weeks` (their Mondays), in order; a week with none is 0. */
export async function weeklyDevices(db: D1Database, weeks: string[]): Promise<Record<DeviceView, number[]>> {
	const first = weeks[0];
	const { results } = first ? await db.prepare("SELECT week, view, devices FROM view_weeks WHERE week >= ?").bind(first).all<{ week: string; view: DeviceView; devices: number }>() : { results: [] };
	const series = (view: DeviceView) => weeks.map((week) => results.find((r) => r.week === week && r.view === view)?.devices ?? 0);
	return Object.fromEntries(DEVICE_VIEWS.map((v) => [v, series(v)])) as Record<DeviceView, number[]>;
}

/** The 3am job: weeks before `beforeWeek` (a Monday) are deleted. */
export async function purgeViewWeeks(db: D1Database, beforeWeek: string): Promise<number> {
	return (await db.prepare("DELETE FROM view_weeks WHERE week < ?").bind(beforeWeek).run()).meta.changes;
}
