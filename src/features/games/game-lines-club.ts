import { CLUB } from "../../club.ts";
import type { LineKind } from "./game-lines.ts";

const us = CLUB.nickname, home = CLUB.homeVenue;

/** The club's game lines, in its own name (club.ts): every team's, until its team manager changes a group (Manage team, Game lines). Kind to both
 * teams: they're all kids. Reordering a group changes which line each game gets. */
export const CLUB_LINES: Record<LineKind, string[]> = {
	upcoming: [
		`The ${us} take on {opponent} at {venue}.`,
		`Next up: the ${us} against {opponent} at {venue}.`,
		`Shoes laced, the ${us} meet {opponent} at {venue}.`,
		`Game faces on: the ${us} take on {opponent} at {venue}.`,
		`The ${us} go after {opponent} at {venue}.`,
		`No easy baskets: the ${us} take on {opponent} at {venue}.`,
		`The ${us} come to compete against {opponent} at {venue}.`,
		`The ${us} are out to win this one against {opponent} at {venue}.`,
		`Down to business: the ${us} face {opponent} at {venue}.`,
		`The ${us} mean business against {opponent} at {venue}.`,
		`Ready to work: the ${us} take on {opponent} at {venue}.`,
		`The ${us} look to set the tone against {opponent} at {venue}.`,
	],
	away: [
		`The ${us} hit the road to take on {opponent} at {venue}.`,
		`The ${us} travel to take on {opponent} at {venue}.`,
		`Away from ${home}, the ${us} take on {opponent} at {venue}.`,
		`Road game: the ${us} take on {opponent} at {venue}.`,
		`The ${us} make the trip to take on {opponent} at {venue}.`,
	],
	rivals_upcoming: [
		`Local rivals battle it out: the ${us} take on {opponent} at {venue}.`,
		`A local derby: the ${us} meet {opponent} at {venue}.`,
		`Bragging rights on the line: the ${us} take on {opponent} at {venue}.`,
	],
	playing: [
		`The ${us} are taking on {opponent} at {venue} right now.`,
		`Game on: the ${us} against {opponent} at {venue}.`,
	],
	rivals_playing: [`Local rivals battle it out: the ${us} are taking on {opponent} at {venue} right now.`],
	played: [
		`The ${us} took on {opponent} at {venue}.`,
		`The ${us} met {opponent} at {venue}.`,
	],
	rivals_played: [`Local rivals battled it out: the ${us} took on {opponent} at {venue}.`],
	won: [
		`The ${us} took on {opponent} at {venue} and got the job done, {ours} to {them}.`,
		`A win for the ${us} against {opponent} at {venue}. Final score {ours} to {them}.`,
		`Nothing but net: the ${us} beat {opponent} at {venue}. Final score {ours} to {them}.`,
		`Swish! The ${us} got the win against {opponent} at {venue}. It was {ours} to {them} at the final buzzer.`,
		`Team effort: the ${us} beat {opponent} at {venue}. Final score {ours} to {them}.`,
		`The ${us} came out on top against {opponent} at {venue}, winning {ours} to {them}.`,
		`Hard work paid off for the ${us} against {opponent} at {venue}. They won {ours} to {them}.`,
		`The ${us} finished strong against {opponent} at {venue} and won it {ours} to {them}.`,
	],
	won_by_one: [`The ${us} won by one in a thriller against {opponent} at {venue}. Final score {ours} to {them}.`],
	lost: [
		`The ${us} took on {opponent} at {venue}. Not our game this time, {ours} to {them}. On to the next one.`,
		"A tough one against {opponent} at {venue}. Final score {ours} to {them}, and plenty to build on.",
		`The ${us} gave it everything against {opponent} at {venue}. Final score {ours} to {them}. On to the next one.`,
		"Not the result we wanted against {opponent} at {venue}. It finished {ours} to {them}. On to the next one.",
		`Credit to {opponent} for the win at {venue}. The ${us} went down {ours} to {them}. On to the next one.`,
		`A learning game for the ${us} against {opponent} at {venue}. Final score {ours} to {them}. On to the next one.`,
		`The ${us} kept fighting against {opponent} at {venue} but fell short, {ours} to {them}. On to the next one.`,
	],
	drew: [
		`The ${us} and {opponent} couldn't be split at {venue}. It finished {ours} all.`,
		"Honours even against {opponent} at {venue}. It finished {ours} all.",
	],
};
