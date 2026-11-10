// When families watch, as a picture: first views over the last 12 weeks by day and hour,
// local time, a square an hour in one green from light to dark (admin.css .h0 to .h5, validated light and dark with
// the dataviz skill), every square hoverable, and the busiest time in words.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { busiestTime, plural } from "../insights-service.ts";

const DAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const CELL = 14, LEFT = 32, TOP = 2;

/** 0 as "12am", 13 as "1pm". */
export const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

export function heatmap(grid: number[][]): SafeHtml {
	const max = Math.max(0, ...grid.flat());
	const level = (n: number) => (n ? Math.min(5, Math.ceil((n / max) * 5)) : 0);
	const cells = grid.map((row, d) => row.map((n, h) => html`<g><title>${DAYS[d]}, ${hourLabel(h)}: ${n ? plural(n, "first view") : "none"}</title><rect class="h${level(n)}" x="${LEFT + h * CELL}" y="${TOP + d * CELL}" width="12" height="12" rx="2"></rect></g>`));
	const days = DAYS.map((d, i) => html`<text x="0" y="${TOP + i * CELL + 10}">${d.slice(0, 3)}</text>`);
	const hours = [0, 6, 12, 18].map((h) => html`<text x="${LEFT + h * CELL}" y="${TOP + 7 * CELL + 10}">${hourLabel(h)}</text>`);
	const busy = busiestTime(grid);
	const words = busy ? `Most first views come on ${DAYS[busy.day]} around ${hourLabel(busy.hour)}.` : "Not enough first views yet to say when families watch most.";
	const key = [1, 2, 3, 4, 5].map((l) => html`<i class="h${l}"></i>`);
	return html`<figure class="heat"><figcaption><b>When families watch</b> <span class="small">First views by day and hour, the last 12 weeks</span></figcaption>
<svg viewBox="0 0 ${LEFT + 24 * CELL} ${TOP + 7 * CELL + 14}" role="img" aria-label="When families watch: ${words}">${cells}${days}${hours}</svg>
<p class="small">${words}</p><p class="heatkey">Fewer ${key} More</p></figure>`;
}
