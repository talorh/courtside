// The admin area's Log: its four sources, the admin log, the sign-in's events, the teams' Activity and problems, merged
// newest first for the local days asked for (the newest 5,000 of each), each run of photo lines made one
// (log-photos.ts).
import { listSignInEvents } from "../../auth/sign-in-codes-repository.ts";
import { addDays, isRealDate, type LogRange, localDate, localMidnight } from "../../shared/time.ts";
import { listActivityLog } from "./activity-admin-repository.ts";
import { listAdminLog } from "./admin-log-repository.ts";
import { groupPhotos } from "./log-photos.ts";
import { listProblems } from "./problems-repository.ts";
import type { LogEntry } from "./log-words.ts";

/** The most lines read from each source: the newest of the days asked for. */
export const LOG_MOST = 5000;

/** local days, first and last ('YYYY-MM-DD'). */
export interface LogDays { from: string; to: string }

/** The quick choices, from today: the default is the last 7 days. */
export function quickDays(now: Date): Record<"today" | "yesterday" | "week" | "month", LogDays> {
	const day = (n: number) => localDate(addDays(now, -n)), today = day(0);
	return { today: { from: today, to: today }, yesterday: { from: day(1), to: day(1) }, week: { from: day(6), to: today }, month: { from: day(30), to: today } };
}

/** The days asked for (`from` and `to`, either way round), or the last 7 days when they aren't both real dates. */
export function askedDays(url: URL, now: Date): LogDays {
	const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
	if (!isRealDate(from) || !isRealDate(to)) return quickDays(now).week;
	return from <= to ? { from, to } : { from: to, to: from };
}

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
export const rangeOf = (d: LogDays): LogRange => ({ from: localMidnight(d.from).toISOString(), to: localMidnight(nextDay(d.to)).toISOString() });

/** Every line of the days, newest first: the filters work on these (log-filter.ts). `cut`: a source had more lines
 * than it gave, so the oldest of the days are missing. */
export async function logEntries(db: D1Database, days: LogDays): Promise<{ entries: LogEntry[]; cut: boolean }> {
	const range = rangeOf(days);
	const [admin, signIns, activity, problems] = await Promise.all([
		listAdminLog(db, LOG_MOST, range), listSignInEvents(db, LOG_MOST, range), listActivityLog(db, range, LOG_MOST), listProblems(db, range, LOG_MOST),
	]);
	const entries: LogEntry[] = [...admin.map((l) => ({ at: l.at, admin: l })), ...signIns.map((s) => ({ at: s.at, signIn: s })),
		...activity.map((a) => ({ at: a.at, activity: a })), ...problems.map((p) => ({ at: p.at, problem: p }))];
	const cut = [admin, signIns, activity, problems].some((lines) => lines.length >= LOG_MOST);
	return { entries: groupPhotos(entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))), cut };
}
