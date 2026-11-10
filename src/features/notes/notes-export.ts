// A game's coaches' notes as a spreadsheet (an Excel file): the game as its heading, its details under it, then the
// notes in the order the page shows them, by time in the video, then the whole game's.
import { formatDuration, formatGameDate, localTime } from "../../shared/time.ts";
import type { Sheet } from "../../shared/xlsx.ts";
import { gameTitle } from "../games/game-format.ts";
import type { Game } from "../games/games-repository.ts";
import { teamLabel, teamSeason } from "../teams/team-code.ts";
import type { Team } from "../teams/team.ts";
import type { CoachNote } from "./notes-repository.ts";

export function notesSheet(team: Team, game: Game, notes: CoachNote[], now: Date): Sheet {
	return {
		name: "Coaches notes",
		title: gameTitle(game),
		details: [
			`${teamLabel(team)} · ${teamSeason(team).label}`,
			`${formatGameDate(game.startsAt)}${game.venue ? ` · ${game.venue}` : ""}`,
			`Coaches' notes, for coaches only. Downloaded ${formatGameDate(localTime(now))}.`,
		],
		columns: [{ title: "Time", width: 12 }, { title: "Note", width: 70 }, { title: "Coach", width: 22 }, { title: "Added", width: 24 }],
		rows: notes.map((n) => [
			n.atSeconds === null ? "Whole game" : formatDuration(n.atSeconds), n.body, n.authorName, formatGameDate(localTime(new Date(n.createdAt))),
		]),
	};
}
