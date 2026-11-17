import { formatClock, localDate, localTime } from "./time.ts";

/** When a day's limit has room again, as its refusal says it (always within a day): '9:00pm', or '5:00pm tomorrow'. */
export const whenAgain = (at: Date, now: Date) => `${formatClock(localTime(at).slice(11))}${localDate(at) === localDate(now) ? "" : " tomorrow"}`;
