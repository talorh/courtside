import { formatClock, formatShortDate } from "../../shared/time.ts";
import type { Sheet } from "../../shared/xlsx.ts";
import { gameTitle } from "../games/game-format.ts";
import { ALL_DUTIES, type RosterDuties } from "./roster-duties.ts";
import type { Duty, Slot } from "./roster-plan.ts";
import type { RosterWeek } from "./roster-service.ts";

// The roster as a spreadsheet (an Excel file): one row per week of the season, as
// the Roster page shows it. A tournament weekend's games share a row, one per line, each game's duties on its own line.

/** The season's weeks, oldest first, with who's on each duty (families by surname). `season`: "2026/27". */
export function rosterSheet(weeks: RosterWeek[], slots: Slot[], names: Map<number, string>, season: string, duties: RosterDuties = ALL_DUTIES): Sheet {
	const on = (week: string, duty: Duty, gameId?: number) => slots.filter((s) => s.week === week && s.duty === duty && (gameId === undefined || s.gameId === gameId))
		.sort((a, b) => a.position - b.position).map((s) => names.get(s.familyId) ?? "?").join(", ");
	// A weekend with several games: each game's own duties, a line a game in the games' order.
	const perGame = (w: RosterWeek) => w.games.length > 1 && slots.some((s) => s.week === w.week && s.gameId);
	const when = (g: RosterWeek["games"][number]["game"]) => `${formatShortDate(g.startsAt)}, ${formatClock(g.startsAt.slice(11))}`;
	const each = (w: RosterWeek, duty: Duty) => (perGame(w)
		? w.games.map(({ game: g }) => `${when(g)}: ${duty === "video" && g.noVideo ? "No video" : on(w.week, duty, g.id) || "Not set"}`).join("\n") : on(w.week, duty));
	const game = ({ game: g }: RosterWeek["games"][number]) => `${formatShortDate(g.startsAt)}, ${formatClock(g.startsAt.slice(11))} · ${gameTitle(g)}${g.noVideo ? " (No video)" : ""}`;
	return {
		name: `Roster ${season.replace("/", "-")}`,
		// A duty the team doesn't have (lollies, video) has no column.
		columns: [{ title: "Week of", width: 16 }, { title: "Game", width: 48 }, { title: "Venue", width: 34 }, { title: "Scoring", width: 24 },
			...(duties.lollies ? [{ title: duties.lolliesLabel, width: 16 }] : []), ...(duties.video ? [{ title: "Video", width: 16 }] : [])],
		rows: weeks.map((w) => [
			`${formatShortDate(`${w.week}T00:00`)} ${w.week.slice(0, 4)}`, w.games.map(game).join("\n"), w.games.map((g) => g.game.venue).join("\n"),
			each(w, "scoring"), ...(duties.lollies ? [w.extra ? each(w, "lollies") : `No ${duties.lolliesLabel.toLowerCase()}`] : []), ...(duties.video ? [w.video ? each(w, "video") : "No video"] : []),
		]),
	};
}
