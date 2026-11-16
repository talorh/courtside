import { teamCopy } from "../../teams/team-copy.ts";
import type { Team } from "../../teams/team.ts";

/** The game page's messages after a change (`?done=`), in the team's words. */
export const watchMessages = (team: Team): Record<string, string> => ({
	moved: "Video moved to this game.", deleted: "Video deleted. The files are kept for 24 hours in case it was a mistake.", removal: `Thanks. ${teamCopy(team).Ask} will look at your request.`,
	clip: "Clip saved. It'll be ready to watch in a minute or two.", clipdeleted: "Clip deleted.",
	clipremoval: `Thanks. ${teamCopy(team).Ask} will look at your request to remove the clip.`, clipplayers: "Players saved.",
	note: "Note saved.", notedeleted: "Note deleted.", score: "Score saved.", scorecleared: "Score cleared.",
	kept: "The first part was kept as the game's video: it's being processed.",
});
