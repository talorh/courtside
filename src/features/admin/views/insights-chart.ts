// The Insights page's pictures (dataviz skill): one series a chart (no legend; the heading names it), thin bars in the
// club's green with rounded tops on a baseline, the peak labelled, every week hoverable (an SVG title) and the numbers in
// a table too; the scoreboard's sparklines. SVG attributes and admin.css classes only: the site's CSP allows no inline
// styles or scripts.
import { html, raw, type SafeHtml } from "../../../shared/html.ts";
import { MONTHS } from "../../../shared/time.ts";

/** A chart's size: the main one (First views) is twice as wide, so its bars stay thin at full width. */
const SIZES = { small: { W: 300, H: 96, TOP: 14, BASE: 94, BAR: 15 }, main: { W: 600, H: 160, TOP: 26, BASE: 158, BAR: 24 } };

/** '2026-10-05' as '5 Oct'. */
export const dayMonth = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

/** A bar from the baseline up, its top corners rounded (4, or less for a short bar). */
function barPath(x: number, height: number, base: number, bar: number): string {
	const top = base - height, r = Math.min(4, height / 2, bar / 2);
	return `M${x} ${base}V${top + r}A${r} ${r} 0 0 1 ${x + r} ${top}H${x + bar - r}A${r} ${r} 0 0 1 ${x + bar} ${top + r}V${base}Z`;
}

/** Twelve weeks of one series, oldest first; `weeks` are their Mondays. */
export function weeklyChart(title: string, weeks: string[], values: number[], main = false): SafeHtml {
	const { W, H, TOP, BASE, BAR } = SIZES[main ? "main" : "small"], BAND = W / 12;
	const max = Math.max(0, ...values), total = values.reduce((a, b) => a + b, 0), peak = values.indexOf(max);
	const scale = (n: number) => (max ? Math.max((n / max) * (BASE - TOP), n ? 2 : 0) : 0);
	const bars = values.map((n, i) => {
		const x = i * BAND + (BAND - BAR) / 2, h = scale(n);
		return html`<g><title>Week of ${dayMonth(weeks[i] ?? "")}: ${n}</title><rect class="hit" x="${i * BAND}" y="0" width="${BAND}" height="${BASE}"></rect>${h ? html`<path class="bar" d="${barPath(x, h, BASE, BAR)}"></path>` : ""}</g>`;
	});
	const peakLabel = max ? html`<text class="peak" x="${peak * BAND + BAND / 2}" y="${BASE - scale(max) - 4}" text-anchor="middle">${max}</text>`
		: html`<text class="empty" x="${W / 2}" y="${(TOP + BASE) / 2}" text-anchor="middle">None yet</text>`;
	const summary = max ? `${title}, last 12 weeks: ${total} in all, most in the week of ${dayMonth(weeks[peak] ?? "")} (${max})` : `${title}, last 12 weeks: none yet`;
	return html`<figure class="chart${main ? " main" : ""}"><figcaption><b>${title}</b> <span class="small">${total} in 12 weeks</span></figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${summary}">${bars}${peakLabel}<line class="base" x1="0" y1="${BASE}" x2="${W}" y2="${BASE}"></line></svg>
<div class="axis" aria-hidden="true"><span>${dayMonth(weeks[0] ?? "")}</span><span>This week</span></div></figure>`;
}

/** The scoreboard's twelve weeks: a small bar a week, this week's in white; a week with none is a sliver on the line. */
export function sparkline(values: number[]): SafeHtml {
	const max = Math.max(1, ...values), last = values.length - 1;
	const bars = values.map((n, i) => {
		const h = n ? Math.max(3, Math.round((n / max) * 22)) : 1;
		return `<rect${i === last ? ' class="now"' : ""} x="${i * 10 + 2}" y="${22 - h}" width="6" height="${h}" rx="1.5"></rect>`;
	});
	return raw(`<svg class="spark" viewBox="0 0 120 22" aria-hidden="true">${bars.join("")}</svg>`);
}

/** The same numbers as a table, for screen readers and anyone who'd rather read them. */
export function weeklyTable(weeks: string[], series: Array<{ title: string; values: number[] }>): SafeHtml {
	const head = html`<tr><th scope="col">Week of</th>${series.map((s) => html`<th scope="col">${s.title}</th>`)}</tr>`;
	const rows = weeks.map((w, i) => html`<tr><td>${dayMonth(w)}</td>${series.map((s) => html`<td>${s.values[i] ?? 0}</td>`)}</tr>`);
	return html`<details class="panel"><summary>The numbers, week by week</summary><div class="tablewrap"><table class="datatable">${head}${rows}</table></div></details>`;
}

/** How much of a limit is used, as a thin bar (0 to 100), red from 90% (`limit` false: a share, never alarming). */
export function meter(used: number, of: number, limit = true): SafeHtml {
	const pct = of > 0 ? Math.min(100, Math.round((used / of) * 1000) / 10) : 0;
	return raw(`<svg class="meter" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="100" height="6" rx="3"></rect>${pct ? `<rect class="fill${limit && pct >= 90 ? " high" : ""}" width="${Math.max(pct, 1)}" height="6" rx="3"></rect>` : ""}</svg>`);
}
