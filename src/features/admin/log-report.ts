import { CLUB } from "../../club.ts";
// The Log's lines for Excel: those the filters show (every page of them), a row each, in local time.
import { formatDay, formatGameDate, localTime } from "../../shared/time.ts";
import type { Sheet } from "../../shared/xlsx.ts";
import { LOG_SHOWS, type LogFilters } from "./log-filter.ts";
import { EVENTS, KIND_NAMES } from "./log-events.ts";
import { type LogRow, whoName } from "./log-words.ts";

export function logSheet(lines: LogRow[], f: LogFilters, now: Date): Sheet {
	const span = f.days.from === f.days.to ? formatDay(f.days.from) : `${formatDay(f.days.from)} to ${formatDay(f.days.to)}`;
	const filters = [f.show !== "all" ? LOG_SHOWS[f.show] : "", f.who && `who: ${f.who}`, f.team && `team: ${lines.find((r) => r.team === f.team)?.teamSeason ?? f.team}`,
		f.event && `event: ${EVENTS[f.event].name}`, f.device && `device: ${f.device}`, f.q && `search: ${f.q}`, f.warn ? "only warnings" : "", f.quiet ? "device views hidden" : ""].filter(Boolean);
	return {
		name: "Log", title: `${CLUB.siteName} log, ${span}`,
		details: [`${lines.length.toLocaleString("en-AU")} ${lines.length === 1 ? "line" : "lines"}, newest first, in local time${filters.length ? `. Filtered to ${filters.join(", ")}` : ""}.`, `Made ${formatGameDate(localTime(now))}.`],
		columns: [{ title: "When", width: 22 }, { title: "Who", width: 30 }, { title: "Event", width: 18 }, { title: "What happened", width: 60 }, { title: "Team", width: 18 }, { title: "Device", width: 22 }, { title: "From", width: 18 }, { title: "Kind", width: 24 }],
		rows: lines.map((r) => [formatGameDate(localTime(new Date(r.at))), whoName(r.who), EVENTS[r.event].name, r.what, r.teamSeason ?? "", r.device, r.ip, KIND_NAMES[r.kind]]),
	};
}
