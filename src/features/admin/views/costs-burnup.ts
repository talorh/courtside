// Costs' other pictures: the season's running total against its budget (spent, then estimated, dashed; the budget a
// straight dashed line to its full amount in September), the season by kind of cost, and each team's small pictures:
// its months as a sparkline and how much of its budget is used, with where its estimate lands.
import { html, raw, type SafeHtml } from "../../../shared/html.ts";
import { type Currency, money } from "../costs-currency.ts";
import { byKind, type MonthBar, runningTotal } from "../costs-summary.ts";
import { axisDollars, futureBand, grid, HALF, legend, niceScale, shortMonth } from "./costs-charts.ts";

/** The running total, month by month, against `budget` (null: none set). */
export function burnUp(title: string, bars: MonthBar[], budget: number | null, cur: Currency): SafeHtml {
	const dollars = money(cur);
	const f = HALF, { W, H, L, R, TOP, BASE } = f;
	const sums = runningTotal(bars), band = (W - L - R) / bars.length, cx = (i: number) => L + i * band + band / 2;
	const { top, ticks } = niceScale(Math.max(sums.at(-1) ?? 0, budget ?? 0) * 1.08);
	const y = (n: number) => BASE - (n / top) * (BASE - TOP);
	const last = bars.findLastIndex((b) => !b.estimate);
	const path = (from: number, to: number) => sums.slice(from, to + 1).map((s, i) => `${i ? "L" : "M"}${cx(from + i).toFixed(1)} ${y(s).toFixed(1)}`).join("");
	const spent = last >= 0 ? html`<path class="spent" d="${path(0, last)}"></path>` : "";
	const ahead = last < bars.length - 1 ? html`<path class="ahead" d="${path(Math.max(last, 0), bars.length - 1)}"></path>` : "";
	const points = bars.map((b, i) => html`<g><title>${shortMonth(b.month)} ${b.month.slice(0, 4)}: ${dollars(sums[i] ?? 0)} by its end${b.estimate ? " (estimate)" : ""}${budget === null ? "" : `, against ${dollars((budget * (i + 1)) / bars.length)} of the budget`}</title><rect class="hit" x="${L + i * band}" y="${TOP}" width="${band}" height="${BASE - TOP}"></rect><circle class="${b.estimate ? "pt est" : "pt"}" cx="${cx(i)}" cy="${y(sums[i] ?? 0)}" r="4"></circle><text class="mon" x="${cx(i)}" y="${BASE + 20}" text-anchor="middle">${shortMonth(b.month)}</text></g>`);
	const end = sums.at(-1) ?? 0;
	// The two end labels go on the sides away from each other: the higher line's above it, the lower one's below.
	const budgetAbove = budget !== null && budget >= end;
	const budgetLine = budget === null ? "" : html`<path class="budgetline" d="M${cx(0)} ${y(budget / bars.length)}L${cx(bars.length - 1)} ${y(budget)}"></path><text class="budgetlabel" x="${cx(bars.length - 1) - 8}" y="${y(budget) + (budgetAbove ? -8 : 20)}" text-anchor="end">Budget ${axisDollars(budget)}</text>`;
	const endLabel = html`<text class="val" x="${cx(bars.length - 1) - 8}" y="${y(end) + (budgetAbove ? 22 : -8)}" text-anchor="end">${axisDollars(end)}</text>`;
	const verdict = budget === null ? "No budget set" : end > budget ? `${dollars(end - budget)} over budget, estimated` : `${dollars(budget - end)} under budget, estimated`;
	const items = [{ cls: "spent", name: "Spent" }, { cls: "ahead", name: "Estimated" }, ...(budget === null ? [] : [{ cls: "budget", name: "Budget" }])];
	return html`<figure class="chart main costchart burn"><figcaption><b>${title}</b> <span class="small">${verdict}</span></figcaption>${legend(items)}
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}: ${dollars(end)} by September, estimated. ${verdict}.">${futureBand(f, bars.findIndex((b) => b.estimate), band)}${grid(f, ticks, y)}${budgetLine}${spent}${ahead}${points}${endLabel}<line class="base" x1="${L}" y1="${BASE}" x2="${W - R}" y2="${BASE}"></line></svg></figure>`;
}

/** The season by kind of cost, biggest first: each a bar of its share, with its dollars and share beside it, and with
 * `thisMonth`, that month's dollars before them. */
export function kindBars(bars: MonthBar[], cur: Currency, thisMonth?: string): SafeHtml {
	const dollars = money(cur);
	const kinds = byKind(bars), most = Math.max(...kinds.map((k) => k.share), 0.0001);
	const season = bars.some((b) => b.estimate) ? "The season, estimated" : "The season";
	const now = thisMonth ? bars.find((b) => b.month === thisMonth) : undefined, mon = now ? shortMonth(now.month) : "";
	const head = now ? html`<li class="khead" aria-hidden="true"><span></span><span>${mon}</span><span>Season</span></li>` : "";
	return html`<figure class="chart kinds"><figcaption><b>Where it goes</b> <span class="small">${season}</span></figcaption><ul class="kindlist${now ? " withnow" : ""}">${head}${kinds.map((k) => html`<li><span class="kname"><span class="sw k-${k.key}" aria-hidden="true"></span>${k.name}</span>
${now ? html`<span class="kval now">${dollars(now.parts[k.key])} <span class="vh">in ${mon}</span></span>` : ""}<span class="kval"><b>${dollars(k.dollars)}</b> ${Math.round(k.share * 100)}%</span>${raw(`<svg class="kbar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="100" height="10" rx="3"></rect>${k.dollars > 0 ? `<rect class="k-${k.key}" width="${Math.max((k.share / most) * 100, 1).toFixed(1)}" height="10" rx="3"></rect>` : ""}</svg>`)}</li>`)}</ul></figure>`;
}

/** A team's twelve months, small: spent months solid, estimated ones light, this month darker. */
export function monthSpark(bars: MonthBar[], thisMonth: string): SafeHtml {
	const max = Math.max(0.01, ...bars.map((b) => b.total));
	const rects = bars.map((b, i) => {
		const h = b.total ? Math.max(2, (b.total / max) * 22) : 1;
		return `<rect class="${b.estimate ? "est" : b.month === thisMonth ? "now" : ""}" x="${i * 10 + 1}" y="${(24 - h).toFixed(1)}" width="7" height="${h.toFixed(1)}" rx="1.5"></rect>`;
	});
	return raw(`<svg class="mspark" viewBox="0 0 120 24" aria-hidden="true">${rects.join("")}</svg>`);
}

/** How much of the budget is used so far (the bar), and where the season's estimate lands (the tick); the budget is the
 * end of the track, or a mark on it when the estimate's past it. */
export function budgetUse(soFar: number, estimate: number, budget: number): SafeHtml {
	const end = Math.max(budget, estimate, 0.01), at = (n: number) => ((Math.min(n, end) / end) * 100).toFixed(1);
	const level = soFar > budget ? "over" : estimate > budget ? "warn" : "ok";
	return raw(`<svg class="buse" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><rect class="track" y="2" width="100" height="8" rx="4"></rect><rect class="used ${level}" y="2" width="${at(soFar)}" height="8" rx="4"></rect><rect class="budgetmark" x="${(Number(at(budget)) - 0.6).toFixed(1)}" y="0" width="1.2" height="12"></rect><rect class="estmark" x="${(Number(at(estimate)) - 0.6).toFixed(1)}" y="0" width="1.2" height="12"></rect></svg>`);
}
