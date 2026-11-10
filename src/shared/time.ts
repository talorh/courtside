import { CLUB } from "../club.ts";

/** The download log is kept this long. */
const RETENTION_DAYS = 730;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The club's time zone (club.ts) formatter, made on first use and again if the zone changes (the tests set it).
let formatter: { zone: string; format: Intl.DateTimeFormat } | null = null;
function parts(now: Date) {
	if (formatter?.zone !== CLUB.timeZone) {
		formatter = { zone: CLUB.timeZone, format: new Intl.DateTimeFormat("en-CA", { timeZone: CLUB.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) };
	}
	return Object.fromEntries(formatter.format.formatToParts(now).map((x) => [x.type, x.value]));
}

/** local wall time as 'YYYY-MM-DDTHH:MM' (the format games.starts_at uses). */
export function localTime(now: Date): string {
	const p = parts(now);
	return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** To the second, 'YYYY-MM-DDTHH:MM:SS' (photos.taken_at). The seconds are UTC's: no time zone is offset by seconds. */
export const localTimeSeconds = (now: Date) => `${localTime(now)}:${String(now.getUTCSeconds()).padStart(2, "0")}`;

/** Sorts ISO dates and times ('YYYY-MM-DD…'). A plain comparison: localeCompare loads the locale tables first, which
 * took about 6 ms of a fresh Worker's 10 ms on the free plan. */
export const compareIso = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function localDate(now: Date): string {
	return localTime(now).slice(0, 10);
}

export function addDays(now: Date, days: number): Date {
	return new Date(now.getTime() + days * DAY_MS);
}

/** A log's lines from `from` up to (not including) `to`, ISO instants. */
export interface LogRange { from: string; to: string }
export const ALL_TIME: LogRange = { from: "", to: "9999" };

/** The instant a local day ('YYYY-MM-DD') starts, in the club's time zone: the UTC hour that is midnight there (a zone
 * is a whole or half number of hours from UTC). */
export function localMidnight(date: string): Date {
	const day = Date.parse(`${date}T00:00:00Z`);
	for (let step = -28; step <= 28; step++) {
		const at = new Date(day - step * 1_800_000);
		if (localTime(at) === `${date}T00:00`) return at;
	}
	throw new Error(`No midnight in the club's time zone on ${date}`);
}

/** A date's ('YYYY-MM-DD') day of the week, Sunday 0. */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** The Monday ('YYYY-MM-DD') of the week a date is in. */
export function mondayOf(date: string): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) - ((weekdayOf(date) + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

/** The season a local date ('YYYY-MM-DD…') is in. Seasons start in the club's month (club.ts) and run into the next
 * year: with October, the 2026/27 season is Oct 2026 to Sep 2027. */
export function seasonOfDate(date: string): { start: number; end: number; label: string } {
	const [year = 0, month = 1] = date.slice(0, 10).split("-").map(Number);
	const start = month >= CLUB.seasonStartMonth ? year : year - 1;
	return { start, end: start + 1, label: seasonLabel(start) };
}

/** "2026/27" for the season that starts in 2026. */
export const seasonLabel = (start: number) => `${start}/${String(start + 1).slice(2)}`;

/** When a season's footage goes: the end of 31 December of the year it ends, in the club's time zone. A team's is its
 * own season's (teams/team-code.ts footageDue). */
export const seasonEndDeadline = (start: number) => localMidnight(`${start + 2}-01-01`).toISOString();

/** The next 3am in the club's time zone after `now`, when the daily job runs (jobs/daily.ts): one of the UTC hours
 * club.ts names for it. */
export function nextLocal3am(now: Date): Date {
	for (let day = 0; day < 3; day++) {
		for (const hour of CLUB.dailyJobUtcHours) {
			const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day, hour));
			if (at > now && localTime(at).slice(11, 13) === "03") return at;
		}
	}
	throw new Error(`No 3am in the club's time zone in the three days after ${now.toISOString()}`);
}

/** The season it is now. */
export const seasonOf = (now: Date) => seasonOfDate(localDate(now));

/** Stream only takes a scheduled deletion at least 30 days away; closer than that, the daily retention job deletes it. */
export function streamDeletionDate(deleteAfter: string, now: Date): string | undefined {
	return deleteAfter > addDays(now, 31).toISOString() ? deleteAfter : undefined;
}

export function retentionCutoff(now: Date): string {
	return addDays(now, -RETENTION_DAYS).toISOString();
}

/** Valid real date 'YYYY-MM-DD' (no 31 June). */
export function isRealDate(date: string): boolean {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!m) return false;
	return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toISOString().slice(0, 10) === date;
}

export function parseLocal(startsAt: string) {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(startsAt);
	if (!m) throw new Error(`Invalid local time: ${startsAt}`);
	return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), time: `${m[4]}:${m[5]}` };
}

/** 'HH:MM' (24h) → '6:40pm'. The site never shows 24-hour times. */
export function formatClock(time: string): string {
	const [h = 0, m = 0] = time.split(":").map(Number);
	const hour12 = h % 12 === 0 ? 12 : h % 12;
	return `${hour12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

export function formatGameDate(startsAt: string): string {
	const { year, month, day, time } = parseLocal(startsAt);
	const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
	return `${weekday} ${day} ${MONTHS[month - 1]} ${year}, ${formatClock(time)}`;
}

/** 'Fri 23 Oct': short enough for a game dropdown on a phone (one season, so no year). */
export function formatShortDate(startsAt: string): string {
	const { year, month, day } = parseLocal(startsAt);
	return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]} ${day} ${MONTHS[month - 1]}`;
}

/** 'Fri 23 Oct 2026', from a local date or time ('YYYY-MM-DD…'): the day a photo was taken. */
export const formatDay = (date: string) => `${formatShortDate(`${date.slice(0, 10)}T00:00`)} ${date.slice(0, 4)}`;

/** The coming Friday in the club's time zone as 'YYYY-MM-DD' (today if it's Friday). Default date for new games. */
export function nextFridayDate(now: Date): string {
	const [y = 0, m = 1, d = 1] = localDate(now).split("-").map(Number);
	const today = new Date(Date.UTC(y, m - 1, d));
	const daysAhead = (5 - today.getUTCDay() + 7) % 7;
	return new Date(today.getTime() + daysAhead * DAY_MS).toISOString().slice(0, 10);
}

export function formatDuration(totalSeconds: number): string {
	const s = Math.max(0, Math.round(totalSeconds));
	const hours = Math.floor(s / 3600);
	const minutes = Math.floor((s % 3600) / 60);
	const seconds = String(s % 60).padStart(2, "0");
	return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
