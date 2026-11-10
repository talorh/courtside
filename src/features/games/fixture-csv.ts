import { CLUB } from "../../club.ts";
import { csvRows } from "../../shared/csv.ts";
import { isRealDate, MONTHS } from "../../shared/time.ts";
import type { Competition } from "./games-repository.ts";
import type { ImportedGame } from "./fixture-import.ts";

// A fixture spreadsheet, saved as CSV (Excel: File → Save As → CSV; Google Sheets: File → Download → CSV).
// One game per row, with a header row naming the columns (any order, any case). Dates are Australian (31/10/2026).

export const SAMPLE_CSV = `Date,Time,Competition,Round,Opponent,Venue,Video
31/10/2026,6:40pm,VJBL,5,Lakeside Rockets,"Saints Stadium, Court 2",Live
7/11/2026,9:00am,Tournament,Round 1,Pine Valley Eagles,"Hillcrest Stadium, Court 4",No
7/11/2026,1:20pm,Tournament,Round 2,Westside Storm,"Hillcrest Stadium, Court 4",No
14/11/2026,10:30am,Practice match,,Riverton Wolves,"Saints Stadium, Court 1",Record
`;

const COLUMNS: Record<string, keyof Row> = {
	date: "date", day: "date", time: "time", "tip-off": "time", tipoff: "time", competition: "competition", type: "competition",
	round: "round", opponent: "opponent", against: "opponent", vs: "opponent", versus: "opponent", venue: "venue",
	court: "venue", location: "venue", video: "video", filming: "video", filmed: "video",
};
interface Row { date: string; time: string; competition: string; round: string; opponent: string; venue: string; video: string }

/** 31/10/2026, 31-10-26, 2026-10-31, Sat 31 Oct 2026, 31 October 2026 → '2026-10-31'. */
export function parseDate(raw: string): string | null {
	const s = raw.trim();
	let y: number, m: number, d: number;
	let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
	if (x) [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
	else if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) [d, m, y] = [Number(x[1]), Number(x[2]), Number(x[3])];
	else if ((x = /^(?:[a-z]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/i.exec(s))) {
		const month = x[2]!.slice(0, 3).toLowerCase();
		[d, m, y] = [Number(x[1]), MONTHS.findIndex((name) => name.toLowerCase() === month) + 1, Number(x[3])];
	} else return null;
	if (y < 100) y += 2000;
	const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
	return isRealDate(date) ? date : null;
}

/** 6:40pm, 6.40 PM, 18:40, 18:40:00, 9am → 'HH:MM'. No am/pm: 1 to 7 o'clock is taken as pm (no games at 3am). */
export function parseTime(raw: string): string | null {
	const x = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*([ap])\.?\s*m?\.?$/i.exec(raw.trim()) ?? /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?$/.exec(raw.trim());
	if (!x) return null;
	let h = Number(x[1]);
	const min = Number(x[2] ?? 0), ap = x[3]?.toLowerCase();
	if (min > 59 || h > 23 || (ap && (h < 1 || h > 12))) return null;
	if (ap) h = (h % 12) + (ap === "p" ? 12 : 0);
	else if (h >= 1 && h <= 7) h += 12;
	return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function competitionOf(raw: string, fallback: Competition): Competition | null {
	const s = raw.trim().toLowerCase();
	if (!s) return fallback;
	if (s.includes("practice") || s.includes("friendly")) return "Practice match";
	if (s.includes("tourn")) return "Tournament";
	return s.includes(CLUB.league.toLowerCase()) || s.includes("league") ? CLUB.league : null;
}

/** The games in a fixture CSV, and a plain-English problem for each row that couldn't be read. */
export function readFixtureCsv(text: string, fallback: Competition): { games: ImportedGame[]; problems: string[] } {
	const [header, ...rows] = csvRows(text);
	const keys = (header ?? []).map((h) => COLUMNS[h.trim().toLowerCase()]);
	if (!keys.includes("date") || !keys.includes("time")) {
		return { games: [], problems: ["The first row needs the column names, with at least Date and Time. Download the sample to see the layout."] };
	}
	const games: ImportedGame[] = [], problems: string[] = [];
	rows.forEach((cells, i) => {
		const r: Row = { date: "", time: "", competition: "", round: "", opponent: "", venue: "", video: "" };
		keys.forEach((k, j) => { if (k) r[k] = (cells[j] ?? "").trim(); });
		const date = parseDate(r.date), time = parseTime(r.time), competition = competitionOf(r.competition, fallback);
		const why = !date ? `the date "${r.date}" isn't one we can read (use 31/10/2026)` : !time ? `the time "${r.time}" isn't one we can read (use 6:40pm)`
			: !competition ? `the competition "${r.competition}" should be VJBL, Tournament or Practice match` : null;
		if (why || !date || !time || !competition) { problems.push(`Row ${i + 2}: ${why}.`); return; }
		games.push({
			startsAt: `${date}T${time}`, competition, roundLabel: r.round.slice(0, 40), opponent: (r.opponent || "TBC").slice(0, 80),
			venue: r.venue.slice(0, 120), noVideo: /^(no|n|false|0|no video|not filmed)$/i.test(r.video),
			// Video: Live (or Yes, or blank), Record, or No.
			liveStream: !/^(record|recorded|record and upload( after)?|upload|upload after)$/i.test(r.video),
		});
	});
	return { games, problems };
}
