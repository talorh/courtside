import type { AppDeps } from "../app/deps.ts";
import { checkGameDay } from "../features/admin/game-day-checks.ts";
import { localTime, weekdayOf } from "../shared/time.ts";

/**
 * The Friday check runs at 6am in the club's time zone every Friday, all year, ahead of the weekend's games. Cron
 * triggers are UTC only, so one fires for each UTC weekday and time that is 6am Friday there across the year (two where
 * the zone has daylight saving), and only the one landing on 6am runs it. cloudflare.config.ts makes its triggers the
 * same way from club.ts, and tests/jobs/game-day.test.ts holds them to each other.
 */
/** The day of the week as Cloudflare's cron reads it: 1 = Sunday to 7 = Saturday (not the usual 0 = Sunday), from
 * the date's UTC weekday. */
export const cloudflareWeekday = (date: Date): number => date.getUTCDay() + 1;

export const GAME_DAY_CRONS = new Set(sixAmFridays());

/** Whether a Friday trigger's scheduled time (ms) is 6am on a Friday in the club's time zone. */
export function gameDayDue(scheduledTime: number): boolean {
	const local = localTime(new Date(scheduledTime));
	return local.endsWith("T06:00") && weekdayOf(local.slice(0, 10)) === 5;
}

/** Every UTC cron line ("M H * * D") that is 6am Friday in the club's time zone over a year, half an hour at a time. */
function sixAmFridays(): string[] {
	const crons = new Set<string>();
	for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2027, 0, 1); ms += 1_800_000) {
		if (!gameDayDue(ms)) continue;
		const at = new Date(ms);
		crons.add(`${at.getUTCMinutes()} ${at.getUTCHours()} * * ${cloudflareWeekday(at)}`);
	}
	return [...crons];
}

/** The check itself (features/admin/game-day-checks.ts): it records its alert and never throws. */
export const runGameDay = (deps: AppDeps): Promise<void> => checkGameDay(deps);
