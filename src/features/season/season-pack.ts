// When a team's footage goes, for the end-of-season pack: the last day it's kept, local time. The team's own date
// once it's closed (its season's end, or 3am tonight when an admin chose that), else its season's.
import { localDate } from "../../shared/time.ts";
import { footageDue } from "../teams/team-code.ts";
import type { Team } from "../teams/team.ts";

/** Footage goes at midnight at its season's end, or at 3am when it's tonight: the day before either is its last whole
 * day, so the day four hours before it goes. */
const BEFORE_MS = 4 * 3_600_000;

export const lastDayKept = (team: Pick<Team, "seasonStart" | "deleteAfter">) =>
	localDate(new Date(Date.parse(team.deleteAfter ?? footageDue(team)) - BEFORE_MS));
