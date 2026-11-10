import { CLUB, siteOrigin } from "../../club.ts";
import { formatClock, parseLocal } from "../../shared/time.ts";
import type { Game } from "../games/games-repository.ts";
import { ALL_DUTIES, type RosterDuties } from "./roster-duties.ts";
import type { Slot } from "./roster-plan.ts";

// The match day message for the team's WhatsApp chat, one for each game: the opponent, the venue and when, arrive 30
// minutes early, which of the club's uniforms to wear (packing the other, the clash uniform, when the club has more
// than one), and who's on duty, with the family on video told how to film it on the site.

/** One of CLUB.uniforms, as written there. */
export type Uniform = string;

/** "Navy uniform, pack White just in case."; for a club with one kit or a reversible singlet, "Uniform: Reversible singlet." */
export function uniformLine(uniform: Uniform): string {
	const others = CLUB.uniforms.filter((u) => u !== uniform);
	return others.length ? `${uniform} uniform, pack ${others.join(" or ")} just in case.` : `Uniform: ${uniform}.`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** 'Friday 23 October, 6:30pm' */
export function longDate(startsAt: string): string {
	const { year, month, day, time } = parseLocal(startsAt);
	return `${DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]} ${day} ${MONTHS[month - 1]}, ${formatClock(time)}`;
}

// Where the family on video duty films the game (Go live), as the WhatsApp chat shows it.
const SITE = `${siteOrigin()}`;

const known = (s: string) => (s.trim() && s.trim().toUpperCase() !== "TBC" ? s.trim() : "");

/** `slots`: the game's duties. `video`: whether the game is filmed. `extra` false: a Scorers only week. `duties`: the
 * team's (the extra duty and video can be off; there are always two scorers). */
export function matchMessage(o: { game: Game; slots: Slot[]; names: Map<number, string>; video: boolean; extra?: boolean; uniform: Uniform; duties?: RosterDuties }): string {
	const duties = o.duties ?? ALL_DUTIES;
	const who = (duty: Slot["duty"]) => o.slots.filter((s) => s.duty === duty).sort((a, b) => a.position - b.position)
		.map((s) => o.names.get(s.familyId) ?? "?").join(", ") || "TBC";
	const g = o.game;
	const filming = g.liveStream ? `live stream it from ${SITE}` : `record it, then upload it to ${SITE}`;
	const duty = [
		`💻 Scorers: ${who("scoring")}`,
		...(duties.lollies && o.extra !== false ? [`🍬 ${duties.lolliesLabel}: ${who("lollies")}`] : []),
		...(o.video && !g.noVideo && duties.video ? [`🎥 Video: ${who("video")} (${filming})`] : []),
	];
	return [
		"Hi Team.", "Please see below match day details.", [`Opponent: ${known(g.opponent) || "TBC"}`, known(g.venue) || "Venue TBC", longDate(g.startsAt)].join("\n"),
		"Please arrive 30 mins before start time.", uniformLine(o.uniform),
		duty.join("\n"),
	].join("\n\n");
}
