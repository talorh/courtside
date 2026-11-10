// Costs' consolidated view: every team, month by month, in one grid: a row a team (dearest first), a column a month of
// the season, each cell its dollars shaded by how big they are (the months to come lighter), the season at the end, and
// every team's total under them, so the whole season's spend reads across and down at once.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { teamLabel } from "../../teams/team-code.ts";
import { type Currency, money } from "../costs-currency.ts";
import type { TeamCosts } from "../costs-estimate.ts";
import type { MonthBar } from "../costs-summary.ts";
import { shortMonth } from "./costs-charts.ts";

/** `bars`: every team's months added up (the total row), in the season's order. */
export function teamMonths(costs: TeamCosts[], bars: MonthBar[], thisMonth: string, cur: Currency): SafeHtml {
	const m = money(cur), sorted = [...costs].sort((a, b) => b.estimate - a.estimate);
	const of = (c: TeamCosts, month: string) => c.months.find((x) => x.month === month)?.total ?? 0;
	const max = Math.max(0.01, ...sorted.flatMap((c) => bars.map((b) => of(c, b.month))));
	const heat = (n: number) => (n > 0 ? 1 + Math.min(3, Math.floor((n / max) * 4)) : 0);
	const cls = (b: MonthBar, n: number | null) => `${n === null ? "" : `hm${heat(n)}`}${b.estimate ? " est" : b.month === thisMonth ? " now" : ""}`.trim();
	const cell = (b: MonthBar, n: number, team: string) => html`<td class="${cls(b, n)}" title="${team}, ${shortMonth(b.month)} ${b.month.slice(0, 4)}${b.estimate ? " (estimate)" : ""}">${m(n)}</td>`;
	const head = html`<tr><th scope="col">Team</th>${bars.map((b) => html`<th scope="col"${b.estimate ? html` class="est"` : b.month === thisMonth ? html` class="now"` : ""}>${shortMonth(b.month)}</th>`)}<th scope="col">Season</th></tr>`;
	const rows = sorted.map((c) => {
		const name = teamLabel(c.team);
		return html`<tr><th scope="row"><a href="/admin/costs/${c.team.id}${cur === "usd" ? "?cur=usd" : ""}">${name}</a></th>${bars.map((b) => cell(b, of(c, b.month), name))}<td class="season"><b>${m(c.estimate)}</b></td></tr>`;
	});
	const total = html`<tr class="total"><th scope="row">Every team</th>${bars.map((b) => html`<td class="${cls(b, null)}">${m(b.total)}</td>`)}<td class="season"><b>${m(bars.reduce((s, b) => s + b.total, 0))}</b></td></tr>`;
	const season = bars.some((b) => b.estimate) ? "The months to come are estimated, lighter" : "The season";
	return html`<figure class="chart teammonths"><figcaption><b>Team by team</b> <span class="small">${season}</span></figcaption>
<div class="tablewrap"><table class="tmgrid"><thead>${head}</thead><tbody>${rows}${total}</tbody></table></div>
<p class="small">Each team's months, the darker the dearer, and its season at the end; every team's total under them. Open a team for its own.</p></figure>`;
}
