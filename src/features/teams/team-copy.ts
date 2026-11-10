// Each team's names, and who its members are told to ask: a team's ask name
// ("Sam" for a team whose manager is Sam) where it has one, "your team manager" everywhere else, in pages, messages and page scripts.
import { teamNames } from "./team-code.ts";
import type { Team } from "./team.ts";

export interface TeamCopy {
	/** "Saints B12.1": the top bar and titles. */
	short: string;
	/** "Saints U12 Boys 12.1": Home. */
	long: string;
	/** Mid-sentence: "ask Sam", "ask your team manager". */
	ask: string;
	/** To start a sentence: "Sam will look at it", "Your team manager will look at it". */
	Ask: string;
	/** The helper on Help: "Virtual Team Manager", or named for the team's ask name ("Virtual Sam"). */
	helper: string;
}

export function teamCopy(team: Pick<Team, "code" | "askName">): TeamCopy {
	const { short, long } = teamNames(team.code);
	return team.askName
		? { short, long, ask: team.askName, Ask: team.askName, helper: `Virtual ${team.askName}` }
		: { short, long, ask: "your team manager", Ask: "Your team manager", helper: "Virtual Team Manager" };
}

/** "Sam (team manager)" where the team has an ask name, else "Your team manager": who sees a request. */
export const askWho = (c: TeamCopy) => (c.ask === c.Ask ? `${c.Ask} (team manager)` : c.Ask);
