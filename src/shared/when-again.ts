import { formatClock, localDate, localTime } from "./time.ts";

const MINUTE = 60_000;

/** When a day's limit has room again, as its refusal says it (always within a day): '9:00pm', or '5:00pm tomorrow'. A time
 * part way through a minute is said as the next one, so trying at the minute said is never a moment too soon. */
export function whenAgain(at: Date, now: Date): string {
	const minute = new Date(Math.ceil(at.getTime() / MINUTE) * MINUTE);
	return `${formatClock(localTime(minute).slice(11))}${localDate(minute) === localDate(now) ? "" : " tomorrow"}`;
}
