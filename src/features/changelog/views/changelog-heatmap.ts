// The Changelog's activity as a picture, like a contribution graph: a square a day for the last twelve months, a week a
// column, Monday to Sunday, in one green from light to dark (admin.css .h0 to .h5, as Insights' When families watch),
// every square hoverable, the months along the top, and the twelve months in words.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatDay, MONTHS } from "../../../shared/time.ts";
import { CHANGE_KINDS, type ChangeKind } from "../changelog.ts";
import { countOf, type DayCell } from "../changelog-weeks.ts";

const CELL = 14, LEFT = 28, TOP = 14;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NAMES: Record<ChangeKind, [string, string]> = { feature: ["feature", "features"], enhancement: ["enhancement", "enhancements"], fix: ["fix", "fixes"] };
const WHAT: Record<ChangeKind, string> = { feature: "Features", enhancement: "Enhancements", fix: "Fixes" };

const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;
/** "2 features, 1 enhancement and 1 fix", only the kinds there were. */
const breakdown = (counts: Record<ChangeKind, number>, sep: string) => {
	const parts = CHANGE_KINDS.filter((k) => counts[k]).map((k) => plural(counts[k], NAMES[k]));
	return parts.length > 1 ? `${parts.slice(0, -1).join(", ")}${sep}${parts.at(-1)}` : parts.join("");
};

function cellWords(cell: DayCell, only: ChangeKind | null): string {
	if (only) return cell.counts[only] ? plural(cell.counts[only], NAMES[only]) : `no ${NAMES[only][1]}`;
	return countOf(cell, null) ? breakdown(cell.counts, ", ") : "nothing";
}

/** The twelve months in words: how many, on how many days, of which kinds, and the busiest day. */
function summary(cells: DayCell[], only: ChangeKind | null): string {
	const total = cells.reduce((n, c) => n + countOf(c, only), 0);
	const what = only ? NAMES[only] : (["change", "changes"] as [string, string]);
	if (!total) return `No ${what[1]} in the last 12 months.`;
	const busy = cells.filter((c) => countOf(c, only)).sort((a, b) => countOf(b, only) - countOf(a, only));
	const days = `on ${plural(busy.length, ["day", "days"])}`;
	const kinds = only ? "" : `: ${breakdown(cells.reduce((sum, c) => { for (const k of CHANGE_KINDS) sum[k] += c.counts[k]; return sum; }, { feature: 0, enhancement: 0, fix: 0 }), " and ")}`;
	const busiest = busy.length > 1 && countOf(busy[0]!, only) > 1 ? ` The busiest day was ${formatDay(busy[0]!.date)}, with ${countOf(busy[0]!, only)}.` : "";
	return `${plural(total, what)} in the last 12 months, ${days}${kinds}.${busiest}`;
}

/** A label over each week a month begins in; the first week shows its own month when no month begins in it or the next. */
function monthLabels(weeks: Array<Array<DayCell | null>>): SafeHtml[] {
	const first = (w: number) => weeks[w]?.find((c) => c?.date.endsWith("-01"))?.date;
	const name = (date: string) => MONTHS[Number(date.slice(5, 7)) - 1];
	return weeks.flatMap((week, w) => {
		const date = first(w) ?? (w === 0 && !first(1) ? week[0]?.date : undefined);
		return date ? [html`<text x="${LEFT + w * CELL}" y="10">${name(date)}</text>`] : [];
	});
}

export function activityHeatmap(weeks: Array<Array<DayCell | null>>, only: ChangeKind | null): SafeHtml {
	const cells = weeks.flat().filter((c): c is DayCell => c !== null);
	const max = Math.max(0, ...cells.map((c) => countOf(c, only)));
	const level = (n: number) => (n ? Math.min(5, Math.ceil((n / max) * 5)) : 0);
	const squares = weeks.map((week, w) => week.map((cell, d) => (cell
		? html`<g><title>${formatDay(cell.date)}: ${cellWords(cell, only)}</title><rect class="h${level(countOf(cell, only))}" x="${LEFT + w * CELL}" y="${TOP + d * CELL}" width="12" height="12" rx="2"></rect></g>`
		: "")));
	const days = [0, 2, 4, 6].map((d) => html`<text x="0" y="${TOP + d * CELL + 10}">${DAYS[d]}</text>`);
	const words = summary(cells, only);
	const key = [1, 2, 3, 4, 5].map((l) => html`<i class="h${l}"></i>`);
	return html`<figure class="heat weeks"><figcaption><b>Activity</b> <span class="small">${only ? WHAT[only] : "Changes"} a day, the last 12 months</span></figcaption>
<svg viewBox="0 0 ${LEFT + weeks.length * CELL} ${TOP + 7 * CELL}" role="img" aria-label="Activity: ${words}">${squares}${days}${monthLabels(weeks)}</svg>
<p class="small">${words}</p><p class="heatkey">Fewer ${key} More</p></figure>`;
}
