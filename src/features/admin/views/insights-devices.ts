// Insights' Mobile and desktop: how many signed-in devices use each view right now (with each view's weeks), and the
// devices that opened the site in each view, week by week, as paired bars with a legend (dataviz skill: two series
// named in words too). SVG attributes and admin.css classes only: the site's CSP allows no inline styles.
import type { DeviceView } from "../../../auth/session-repository.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { type Score, scoreboard } from "./insights-board.ts";
import { dayMonth } from "./insights-chart.ts";

export interface Devices { now: Record<DeviceView | "unknown", number>; weekly: Record<DeviceView, number[]> }

const VIEWS: Array<{ view: DeviceView; name: string }> = [{ view: "mobile", name: "mobile view" }, { view: "desktop", name: "desktop view" }];
const W = 600, H = 160, TOP = 26, BASE = 158, BAR = 16, GAP = 2, BAND = W / 12;

/** A bar from the baseline up, its top corners rounded (4, or less for a short bar). */
function barPath(x: number, height: number): string {
	const top = BASE - height, r = Math.min(4, height / 2, BAR / 2);
	return `M${x} ${BASE}V${top + r}A${r} ${r} 0 0 1 ${x + r} ${top}H${x + BAR - r}A${r} ${r} 0 0 1 ${x + BAR} ${top + r}V${BASE}Z`;
}

/** Twelve weeks of both views side by side, oldest first; `weeks` are their Mondays. */
function pairedChart(weeks: string[], weekly: Record<DeviceView, number[]>): SafeHtml {
	const title = "Devices that opened the site each week";
	const all = VIEWS.flatMap((v) => weekly[v.view]), max = Math.max(0, ...all);
	const totals = VIEWS.map((v) => `${weekly[v.view].reduce((a, b) => a + b, 0)} in the ${v.name}`).join(", ");
	const scale = (n: number) => (max ? Math.max((n / max) * (BASE - TOP), n ? 2 : 0) : 0);
	const bars = weeks.map((week, i) => {
		const x0 = i * BAND + (BAND - 2 * BAR - GAP) / 2;
		const said = VIEWS.map((v) => `${weekly[v.view][i] ?? 0} in the ${v.name}`).join(", ");
		const pair = VIEWS.map((v, k) => {
			const h = scale(weekly[v.view][i] ?? 0);
			return h ? html`<path class="bar ${v.view}" d="${barPath(x0 + k * (BAR + GAP), h)}"></path>` : "";
		});
		return html`<g><title>Week of ${dayMonth(week)}: ${said}</title><rect class="hit" x="${i * BAND}" y="0" width="${BAND}" height="${BASE}"></rect>${pair}</g>`;
	});
	const peaks = max ? VIEWS.map((v, k) => {
		const n = Math.max(...weekly[v.view]), i = weekly[v.view].indexOf(n);
		return n ? html`<text class="peak" x="${i * BAND + (BAND - 2 * BAR - GAP) / 2 + k * (BAR + GAP) + BAR / 2}" y="${BASE - scale(n) - 4}" text-anchor="middle">${n}</text>` : "";
	}) : html`<text class="empty" x="${W / 2}" y="${(TOP + BASE) / 2}" text-anchor="middle">None yet</text>`;
	return html`<figure class="chart main pair"><figcaption><b>${title}</b> <span class="legend">${VIEWS.map((v) => html`<span><span class="key ${v.view}"></span>${v.name[0]?.toUpperCase()}${v.name.slice(1)}</span>`)}</span></figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}, last 12 weeks: ${totals}">${bars}${peaks}<line class="base" x1="0" y1="${BASE}" x2="${W}" y2="${BASE}"></line></svg>
<div class="axis" aria-hidden="true"><span>${dayMonth(weeks[0] ?? "")}</span><span>This week</span></div></figure>`;
}

export function devicesSection(weeks: string[], d: Devices): SafeHtml {
	const tile = (v: { view: DeviceView; name: string }): Score => ({ value: d.now[v.view], label: `${d.now[v.view] === 1 ? "device" : "devices"} in the ${v.name}`, weekly: d.weekly[v.view], trend: "opened the site" });
	const unknown: Score[] = d.now.unknown ? [{ value: d.now.unknown, label: `${d.now.unknown === 1 ? "device whose view isn't" : "devices whose views aren't"} known yet` }] : [];
	return html`<section class="stack" aria-labelledby="devices-h"><div class="panelhead"><h2 id="devices-h">Mobile and desktop</h2><span class="small">Which view each signed-in device uses: a phone's, or the desktop view on a computer</span></div>
${scoreboard([...VIEWS.map(tile), ...unknown])}
${pairedChart(weeks, d.weekly)}</section>`;
}
