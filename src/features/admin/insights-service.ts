// The Insights page's figures (usage per team and overall, the site against its limits, and what
// stands out): the repository's counts, put into the club's weeks, with the few lines worth reading first.
import { formatGameDate, localDate, localTime, mondayOf, weekdayOf } from "../../shared/time.ts";
import { teamLabel } from "../teams/team-code.ts";
import type { TeamCounts, Watched } from "./insights-repository.ts";

export const WEEKS = 12;
const DAY_MS = 86_400_000;

/** A UTC hour ('YYYY-MM-DDTHH', as the repository counts) as its local date. */
const localDay = (hour: string) => localDate(new Date(`${hour}:00:00Z`));

/** the club's last `WEEKS` weeks, by their Mondays, oldest first (this week last). */
export function weekStarts(now: Date): string[] {
	const monday = Date.parse(`${mondayOf(localDate(now))}T00:00:00Z`);
	return Array.from({ length: WEEKS }, (_, i) => new Date(monday - (WEEKS - 1 - i) * 7 * DAY_MS).toISOString().slice(0, 10));
}

/** Hourly counts summed into the club's weeks (an hour before the first week counts for none). */
export function weeklyTotals(hours: Array<{ h: string; n: number }>, weeks: string[]): number[] {
	const totals = weeks.map(() => 0);
	for (const { h, n } of hours) {
		const i = weeks.indexOf(mondayOf(localDay(h)));
		if (i >= 0) totals[i] = (totals[i] ?? 0) + n;
	}
	return totals;
}

/** First views by local weekday (Monday first) and hour (0 to 23), from the repository's UTC hours. */
export function byDayAndHour(hours: Array<{ h: string; n: number }>): number[][] {
	const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
	for (const { h, n } of hours) {
		const local = localTime(new Date(`${h}:00:00Z`));
		grid[(weekdayOf(local.slice(0, 10)) + 6) % 7]![Number(local.slice(11, 13))]! += n;
	}
	return grid;
}

/** The weekday (Monday 0) and hour with the most, once there are 10 or more in all to say. */
export function busiestTime(grid: number[][]): { day: number; hour: number } | null {
	let best = { day: 0, hour: 0, n: -1 }, total = 0;
	grid.forEach((row, day) => row.forEach((n, hour) => { total += n; if (n > best.n) best = { day, hour, n }; }));
	return total >= 10 ? { day: best.day, hour: best.hour } : null;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The few lines worth reading first, plain words, most useful first. */
export function standouts(teams: TeamCounts[], watched: Watched[]): string[] {
	const label = (id: string) => { const t = teams.find((c) => c.team.id === id); return t ? teamLabel(t.team) : id; };
	const lines = watched.slice(0, 3).map((w) =>
		`Most watched: ${label(w.teamId)}${w.opponent ? ` v ${w.opponent}` : ""} (${formatGameDate(w.startsAt)}), opened by ${plural(w.watchers, "person", "people")} in the last 30 days.`);
	const open = teams.filter((t) => t.team.status === "active");
	for (const t of open) if (t.awaitingVideo) lines.push(`${teamLabel(t.team)}: ${plural(t.awaitingVideo, "played game")} with no video yet.`);
	for (const t of open) if (t.people > 1 && !t.signedIn30) lines.push(`${teamLabel(t.team)}: nobody has opened the site in the last 30 days.`);
	const videos = teams.reduce((n, t) => n + t.videos, 0);
	const streams = teams.reduce((n, t) => n + t.streams, 0);
	const fromApp = teams.reduce((n, t) => n + t.appStreams, 0);
	if (videos) lines.push(`${streams} of ${plural(videos, "video")} came from a live stream${fromApp ? ` (${fromApp} from an external app)` : ""}; the rest were recorded and uploaded.`);
	return lines.length ? lines : ["Nothing stands out yet: check back after a few games."];
}
