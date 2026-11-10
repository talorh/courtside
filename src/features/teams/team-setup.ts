// A team's setup, as a checklist: what a team manager does to get a new team going, each step done or not from what
// the team has. At the top of Manage team until it's all done, and on the admin area's Teams, so an admin can see
// which team managers might want a hand.

/** What the checklist counts: players in the squad; people set to Watch and film, coaches and team managers on the
 * list; games; and roster duties. */
export interface SetupCounts { players: number; filmers: number; coaches: number; managers: number; games: number; duties: number }

/** Players in the squad before it counts as entered (a squad holds up to ten). */
export const MIN_PLAYERS = 7;

/** `what`: what the step adds, for a list of what's left ("the fixture"). */
export interface SetupStep { label: string; what: string; done: boolean; href: string; how: string }

export function setupSteps(c: SetupCounts): SetupStep[] {
	// Adding people happens all at once, so who films, the coach and the team manager are one step.
	const people = [c.filmers ? `${c.filmers} set to Watch and film` : "nobody set to Watch and film yet", c.coaches ? "the coach added" : "no coach yet",
		c.managers ? "the team manager added" : "no team manager yet"];
	return [
		{
			label: "Squad entered", what: "the squad", done: c.players >= MIN_PLAYERS, href: "/manage#players",
			how: `Add at least ${MIN_PLAYERS} players on Manage team. So far: ${c.players}.`,
		},
		{
			label: "Who films, the coach and the team manager added", what: "who films, the coach and the team manager",
			done: c.filmers > 0 && c.coaches > 0 && c.managers > 0, href: "/manage#people",
			how: `Under People, add at least one person set to Watch and film, the coach and a team manager. So far: ${people.join("; ")}.`,
		},
		{ label: "Fixture in", what: "the fixture", done: c.games > 0, href: "/fixture", how: "Add the PlayHQ link or the games on Fixture." },
		{ label: "Roster made", what: "the roster", done: c.duties > 0, href: "/roster", how: "Add the families and tap Generate roster on Roster." },
	];
}

/** "3 of 4", and the steps still to do. */
export function setupProgress(c: SetupCounts): { done: number; of: number; left: SetupStep[] } {
	const steps = setupSteps(c);
	const left = steps.filter((s) => !s.done);
	return { done: steps.length - left.length, of: steps.length, left };
}
