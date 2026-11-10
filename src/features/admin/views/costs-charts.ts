// Costs' charts (dataviz skill), as cloud cost tools draw them: a season's months as bars stacked by kind of cost,
// the months still to come shaded and marked Estimated, with a month's share of the budget as a dashed line on the one
// dollar axis; a legend over it, the current and biggest months labelled, and every month hoverable (an SVG title).
// SVG attributes and admin.css classes only (the CSP); the numbers are in the months table too.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { MONTHS } from "../../../shared/time.ts";
import { monthSpan } from "../costs-prices.ts";
import { type Currency, money } from "../costs-currency.ts";
import { KINDS, type MonthBar } from "../costs-summary.ts";

/** A chart's drawing size: the full-width months chart is wider, so its text stays the size of the half-width one's. */
interface Frame { W: number; H: number; L: number; R: number; TOP: number; BASE: number }
const WIDE: Frame = { W: 820, H: 262, L: 50, R: 10, TOP: 26, BASE: 226 };
export const HALF: Frame = { W: 600, H: 262, L: 50, R: 10, TOP: 26, BASE: 226 };

/** "$0", "$40", "$1.2k": an axis's dollars. */
export const axisDollars = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `$${Math.round(n)}`);
/** "2026-11" as "Nov". */
export const shortMonth = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

/** A round top for the axis (each step 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 a power of ten) and its four steps. */
export function niceScale(max: number): { top: number; ticks: number[] } {
	const raw = Math.max(max, 1) / 4, power = 10 ** Math.floor(Math.log10(raw));
	const step = ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * power >= raw) ?? 10) * power;
	return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

/** The dollar axis: light lines across at each step, their dollars on the left. */
export function grid(f: Frame, ticks: number[], y: (n: number) => number): SafeHtml {
	const { L, W, R } = f;
	return html`${ticks.map((t) => html`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"></line><text class="tick" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${axisDollars(t)}</text>`)}`;
}

/** The months still to come, shaded, with "Estimated" over them. */
export function futureBand(f: Frame, firstEstimate: number, band: number): SafeHtml {
	const { L, W, R, TOP, BASE } = f;
	if (firstEstimate < 0) return html``;
	const x = L + firstEstimate * band;
	return html`<rect class="future" x="${x}" y="${TOP - 18}" width="${W - R - x}" height="${BASE - TOP + 18}"></rect><text class="futurelabel" x="${x + 6}" y="${TOP - 5}">Estimated</text>`;
}

export const legend = (items: Array<{ cls: string; name: string }>) =>
	html`<ul class="legend">${items.map((i) => html`<li><span class="sw ${i.cls}" aria-hidden="true"></span>${i.name}</li>`)}</ul>`;

/** A bar's top segment: its top corners rounded (4, or less for a short one). */
function roundTop(x: number, y: number, w: number, h: number): string {
	const r = Math.min(4, h / 2, w / 2);
	return `M${x} ${y + h}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h}Z`;
}

/** A month in words: estimated (to come), actual (on Cloudflare's bill, all of it or some of its days), or not billed yet. */
export function monthStatus(b: MonthBar): string {
	if (b.estimate) return "estimated";
	if (!b.billedDays) return "not billed yet";
	const days = Math.round((Date.parse(monthSpan(b.month).end) - Date.parse(monthSpan(b.month).start)) / 86_400_000);
	return b.billedDays >= days ? "actual, Cloudflare's bill" : `actual, Cloudflare's bill for ${b.billedDays} of its ${days} days`;
}

/** Solid months are spent (Cloudflare's bill once it's been read); light ones are estimated. */
export const statusLegend = (bars: MonthBar[]) =>
	legend([{ cls: "solid", name: bars.some((b) => b.billedDays) ? "Actual: Cloudflare's bill" : "Spent, not billed yet" }, { cls: "light", name: "Estimated" }]);

/** The season's months, stacked by kind; `monthlyBudget`: a twelfth of the budget, drawn across (null: none). */
export function monthsChart(title: string, bars: MonthBar[], thisMonth: string, monthlyBudget: number | null, cur: Currency): SafeHtml {
	const dollars = money(cur), season = bars.some((b) => b.estimate) ? "for the season, estimated" : "for the season";
	const f = WIDE, { W, H, L, R, TOP, BASE } = f;
	const band = (W - L - R) / bars.length, bw = Math.min(30, band * 0.56);
	const { top, ticks } = niceScale(Math.max(...bars.map((b) => b.total), monthlyBudget ?? 0) * 1.08);
	const y = (n: number) => BASE - (n / top) * (BASE - TOP);
	const peak = bars.reduce((p, b, i) => (b.total > (bars[p]?.total ?? 0) ? i : p), 0);
	const columns = bars.map((b, i) => {
		const x = L + i * band + (band - bw) / 2;
		let at = 0;
		const drawn = KINDS.filter((k) => b.parts[k.key] > 0);
		const segs = drawn.map((k, j) => {
			const y0 = y(at + b.parts[k.key]), h = Math.max(y(at) - y0, 1);
			at += b.parts[k.key];
			return j === drawn.length - 1 ? html`<path class="seg k-${k.key}" d="${roundTop(x, y0, bw, h)}"></path>` : html`<rect class="seg k-${k.key}" x="${x}" y="${y0}" width="${bw}" height="${h}"></rect>`;
		});
		const parts = KINDS.map((k) => `${k.name} ${dollars(b.parts[k.key])}`).join(", ");
		const label = b.month === thisMonth || (i === peak && b.total > 0) ? html`<text class="val" x="${x + bw / 2}" y="${y(b.total) - 6}" text-anchor="middle">${axisDollars(b.total)}</text>` : "";
		return html`<g class="${b.estimate ? "est" : b.month === thisMonth ? "now" : ""}"><title>${shortMonth(b.month)} ${b.month.slice(0, 4)} (${monthStatus(b)}): ${dollars(b.total)}. ${parts}</title>
<rect class="hit" x="${L + i * band}" y="${TOP}" width="${band}" height="${BASE - TOP}"></rect>${segs}${label}<text class="mon" x="${x + bw / 2}" y="${BASE + 20}" text-anchor="middle">${shortMonth(b.month)}</text></g>`;
	});
	const budget = monthlyBudget === null ? "" : html`<line class="budgetline" x1="${L}" x2="${W - R}" y1="${y(monthlyBudget)}" y2="${y(monthlyBudget)}"></line><text class="budgetlabel" x="${L + 6}" y="${y(monthlyBudget) - 6}">Budget a month ${axisDollars(monthlyBudget)}</text>`;
	const total = bars.reduce((s, b) => s + b.total, 0);
	const items = KINDS.map((k) => ({ cls: `k-${k.key}`, name: k.name }));
	return html`<figure class="chart main costchart"><figcaption><b>${title}</b> <span class="small">${dollars(total)} ${season}</span></figcaption>
${legend(monthlyBudget === null ? items : [...items, { cls: "budget", name: "Budget a month" }])}${statusLegend(bars)}
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}: ${dollars(total)} ${season}, by month and kind of cost. The months are in the table below.">
${futureBand(f, bars.findIndex((b) => b.estimate), band)}${grid(f, ticks, y)}${columns}${budget}<line class="base" x1="${L}" y1="${BASE}" x2="${W - R}" y2="${BASE}"></line></svg></figure>`;
}
