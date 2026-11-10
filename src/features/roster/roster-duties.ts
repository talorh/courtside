// A team's roster duties: two families keep score every week; one extra duty (Lollies, unless the
// team manager names it otherwise) and video, each on or off; either can go to one family every week, who then gets no
// other duty (a parent who'd rather film every game than score). Weeks from this one on follow it.
import type { Duty } from "./roster-plan.ts";

export interface RosterDuties { lollies: boolean; lolliesLabel: string; lolliesFamily: number | null; video: boolean; videoFamily: number | null }

/** Lollies and video, shared out, as well as the two scorers: B12.1's, and every team's until its team manager changes it. */
export const ALL_DUTIES: RosterDuties = { lollies: true, lolliesLabel: "Lollies", lolliesFamily: null, video: true, videoFamily: null };

/** The duties a team has, in the roster's order. */
export const dutiesOn = (d: RosterDuties): Duty[] => (["scoring", "lollies", "video"] as const).filter((x) => x === "scoring" || d[x]);

/** A duty's name on this team's roster: the extra duty is the team's own. */
export const dutyLabel = (duty: Duty, d: RosterDuties) => (duty === "lollies" ? d.lolliesLabel : duty === "scoring" ? "Scoring" : "Video");

/** The family that does `duty` every week, if the team has one (only while it's on). */
export const standingFamily = (duty: Duty, d: RosterDuties): number | null =>
	duty === "lollies" ? (d.lollies ? d.lolliesFamily : null) : duty === "video" ? (d.video ? d.videoFamily : null) : null;

/** "scoring, lollies and video": the team's duties in words, mid-sentence (lollies in lower case, any other name as the
 * team manager gave it). */
export function dutyWords(d: RosterDuties): string {
	const names = ["scoring", ...(d.lollies ? [d.lolliesLabel === "Lollies" ? "lollies" : d.lolliesLabel] : []), ...(d.video ? ["video"] : [])];
	return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]!;
}

/** "At every game, two families keep score, one brings the lollies and one films the game" (the Roster page). */
export function dutySentence(d: RosterDuties, names: Map<number, string>): string {
	const who = (family: number | null, one: string) => (family !== null && names.has(family) ? `the ${names.get(family)} family` : one);
	const extra = d.lolliesLabel === "Lollies" ? "brings the lollies" : `is on ${d.lolliesLabel}`;
	const parts = ["two families keep score", ...(d.lollies ? [`${who(d.lolliesFamily, "one")} ${extra}`] : []), ...(d.video ? [`${who(d.videoFamily, "one")} films the game`] : [])];
	return `At every game, ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}`;
}
