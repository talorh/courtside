// When a PlayHQ fixture is checked by itself, and when that stops: used by the checks (playhq-service.ts) and said on
// Fixture (views/playhq-panel.ts), so the two can't disagree. Every 8 hours. A tournament runs over four days (Friday to
// Monday) and its finals appear on the team's fixture as they're made, so it's checked every hour from its first game's
// day to the end of its fourth (or its last game's day, if PlayHQ lists one later), then stops. The league stops six weeks
// after its last game (rounds after a break, finals a week at a time). A fixture that never gets a game stops 60 days
// after it was added, so nothing is checked for ever.
import { localDate } from "../../shared/time.ts";
import type { PlayhqFixture } from "./playhq-repository.ts";

export const CHECK_EVERY_HOURS = 8;
export const TOURNAMENT_EVERY_HOURS = 1;
const TOURNAMENT_DAYS = 4;
const LEAGUE_OVER_AFTER_DAYS = 42;
const EMPTY_FOR_DAYS = 60;

type Dates = Pick<PlayhqFixture, "competition" | "firstGame" | "lastGame" | "createdAt">;

/** 'YYYY-MM-DD' `days` on. */
export function dayAfter(date: string, days = 1): string {
	const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A tournament's last day ('YYYY-MM-DD'): the fourth from its first game's, or its last game's if that's later. */
export function tournamentEnds(f: Dates): string | null {
	if (!f.firstGame || !f.lastGame) return null;
	const fourth = dayAfter(f.firstGame, TOURNAMENT_DAYS - 1);
	return f.lastGame > fourth ? f.lastGame : fourth;
}

/** The last day the fixture is checked by itself ('YYYY-MM-DD', local). */
export function checksUntil(f: Dates): string {
	if (!f.lastGame) return dayAfter(localDate(new Date(f.createdAt)), EMPTY_FOR_DAYS);
	return f.competition === "Tournament" ? tournamentEnds(f)! : dayAfter(f.lastGame, LEAGUE_OVER_AFTER_DAYS);
}

/** Whether it's still checked by itself on `today` ('YYYY-MM-DD', local). */
export const stillChecked = (f: Dates, today: string) => today <= checksUntil(f);
