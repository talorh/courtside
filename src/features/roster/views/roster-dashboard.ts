import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatShortDate, MONTHS } from "../../../shared/time.ts";
import type { Credit } from "../roster-away.ts";
import { dutiesOn, dutyLabel, type RosterDuties, standingFamily } from "../roster-duties.ts";
import { DUTIES, type Duty, type Slot } from "../roster-plan.ts";

// The fairness check at the bottom of the Roster, for everyone: how many of each duty every family on the roster has
// this season (done and coming up) with their total, whether that's even, in plain words, and who's on each week.
// Plain HTML and inline SVG: the page's security policy allows no inline styles, and there's no chart library to load.

export interface DashboardProps {
	/** Who evens the roster up, to start a sentence: "Sam", or "Your team manager". */
	Ask: string;
	season: string;
	thisWeek: string;
	weeks: Array<{ week: string; video: boolean }>;
	slots: Slot[];
	names: Map<number, string>;
	fair: Map<number, Record<Duty | "total", number>>;
	/** Each family's time off the roster, counted as its share of those weeks (roster-away.ts). */
	away: Map<number, Credit>;
	/** The team's duties: a duty it doesn't have shows only while someone's done it this season. */
	duties: RosterDuties;
	/** Families on the roster now: only they are counted here. One taken off keeps their duties on the weeks they did. */
	active: Set<number>;
	/** The team manager, who can Generate roster to even it up. */
	canGenerate: boolean;
}

/** `credit`: what the family's time off the roster counts as (roster-away.ts). */
type Row = { id: number; name: string; credit: Credit | undefined } & Record<Duty | "total", number>;

/**
 * Fair is every family within one duty of each other, a family's time off the roster counting as its share of those
 * weeks: the roster is built to keep it that way. A change afterwards (a week made No video drops its video duty, say)
 * can leave someone further behind until Generate roster.
 */
function verdict(rows: Row[], canGenerate: boolean, Ask: string): SafeHtml | "" {
	const totals = rows.map((r) => r.total + (r.credit?.total ?? 0));
	if (!totals.length) return "";
	const lo = Math.min(...totals), hi = Math.max(...totals);
	// A hundredth over one: shares counted for time off rarely come out whole.
	if (hi - lo > 1.01) {
		const fix = canGenerate ? "Generate roster shares out the weeks to come so it evens up." : `${Ask} evens it up for the weeks to come.`;
		const counting = rows.some((r) => r.credit?.total) ? ", counting time off the roster" : "";
		return html`<p class="fm-verdict fm-warn" role="status"><b>Not even yet:</b> families have between ${Math.floor(lo)} and ${Math.ceil(hi)} duties${counting}. ${fix}</p>`;
	}
	return html`<p class="fm-verdict fm-good" role="status"><b>Fair:</b> every family has as close as possible to an equal share of duties.</p>`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Who had time off the roster, and what it counts as ("Smith: 6 weeks off the roster, counted as 2.4 duties"). */
function timeOff(rows: Row[]): SafeHtml | "" {
	const lines = rows.flatMap((r) => {
		const c = r.credit;
		if (!c || !(c.before + c.off)) return [];
		const when = [...(c.before ? [`${count(c.before, "week", "weeks")} before it was added`] : []), ...(c.off ? [`${count(c.off, "week", "weeks")} off the roster`] : [])];
		return [`${r.name}: ${when.join(" and ")}, counted as ${count(Math.round(c.total * 10) / 10, "duty", "duties")}`];
	});
	if (!lines.length) return "";
	return html`<p class="fm-how"><b>Time off the roster:</b> ${lines.join("; ")}. Each of those weeks counts as the family's share of it, so it takes turns like everyone else rather than catching up.</p>`;
}

function table(rows: Row[], shown: Duty[], duties: RosterDuties): SafeHtml {
	const head = shown.map((d) => html`<th><i class="fm-dot fm-${d}"></i>${dutyLabel(d, duties)}</th>`);
	const body = rows.map((r) => html`<tr><th scope="row">${r.name}</th>${shown.map((d) => html`<td>${r[d]}</td>`)}<td class="fm-total">${r.total}</td></tr>`);
	return html`<div class="fm-scroll"><table class="fm-table"><thead><tr><th>Family</th>${head}<th>Total</th></tr></thead>
<tbody>${body}</tbody></table></div>`;
}

/** Where each month starts along the chart. Two months a week apart would overlap: the earlier name gives way. */
function monthLabels(weeks: string[]): Array<{ at: number; name: string }> {
	const labels: Array<{ at: number; name: string }> = [];
	weeks.forEach((w, i) => {
		const month = Number(w.slice(5, 7)) - 1;
		if (i > 0 && month === Number(weeks[i - 1]!.slice(5, 7)) - 1) return;
		if (labels.length && i - labels.at(-1)!.at < 2) labels.pop();
		labels.push({ at: i, name: MONTHS[month]! });
	});
	return labels;
}

// The chart runs the whole season (October to September, 40 or more weeks with games), so every square keeps one size
// you can read, and the chart scrolls sideways when the screen is narrower than the season (roster.js opens it at this
// week). The names stay put on the left.
const CELL = 14, SQUARE = 11, ROW = 20, HEAD = 16;

function weekGrid(rows: Row[], p: DashboardProps): SafeHtml {
	// A family's duties that week, in the duties' order (two on a weekend with more duties than families).
	const duty = new Map<string, Duty[]>();
	for (const s of p.slots) duty.set(`${s.week}|${s.familyId}`, [...(duty.get(`${s.week}|${s.familyId}`) ?? []), s.duty].sort((a, b) => DUTIES.indexOf(a) - DUTIES.indexOf(b)));
	const weeks = p.weeks.map((w) => w.week);
	const now = weeks.findIndex((w) => w >= p.thisWeek);
	const labels = monthLabels(weeks).map((m) => html`<text x="${m.at * CELL + 1}" y="11">${m.name}</text>`);
	const squares = rows.map((r, row) => weeks.map((w, i) => {
		const ds = duty.get(`${w}|${r.id}`) ?? [], d = ds[0];
		return html`<rect class="${d ? `fm-${d}` : "fm-track"}" x="${i * CELL + 1}" y="${HEAD + row * ROW + 4}" width="${SQUARE}" height="${SQUARE}" rx="2"><title>${r.name}, week of ${formatShortDate(`${w}T00:00`)}: ${d ? ds.map((x) => dutyLabel(x, p.duties)).join(" and ") : "no duty"}</title></rect>`;
	}));
	const outline = now >= 0 ? html`<rect class="fm-now" x="${now * CELL}" y="${HEAD + 2}" width="${CELL - 1}" height="${rows.length * ROW - 2}" rx="3"/>` : "";
	const width = weeks.length * CELL + 2, height = HEAD + rows.length * ROW;
	return html`<div class="fm-gridwrap"><div class="fm-names">${rows.map((r) => html`<span>${r.name}</span>`)}</div>
<div class="fm-scroller" data-now-x="${Math.max(0, now) * CELL}"><svg class="fm-weeks" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
${labels}${squares}${outline}</svg></div></div>`;
}

export function rosterDashboard(p: DashboardProps): SafeHtml | "" {
	const byName = (a: Row, b: Row) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0);
	// As the families list (no locale tables, which are slow to load in a fresh Worker).
	const rows: Row[] = [...p.fair].filter(([id]) => p.active.has(id)).map(([id, c]) => ({ id, name: p.names.get(id) ?? "?", credit: p.away.get(id), ...c })).sort(byName);
	if (!rows.length || !p.slots.length) return "";
	const on = new Set(dutiesOn(p.duties));
	const shown = DUTIES.filter((d) => on.has(d) || rows.some((r) => r[d] > 0));
	const quiet = p.weeks.filter((w) => !w.video).length;
	const weeks = `${p.weeks.length} ${p.weeks.length === 1 ? "week" : "weeks"} with games${quiet ? `, ${quiet} with no video` : ""}`;
	// A family the team gives one duty every week isn't shared out, so it's left out of the verdict.
	const regulars = new Set(DUTIES.map((d) => standingFamily(d, p.duties)).filter((f): f is number => f !== null && p.active.has(f)));
	const others = ["scorers", ...(p.duties.lollies ? [p.duties.lolliesLabel === "Lollies" ? "lollies" : p.duties.lolliesLabel] : [])].join(" and ");
	const noVideo = p.duties.video ? `\nA week with no filming (No video) only needs ${others}, so there are fewer video turns to go round.` : "";
	const regular = regulars.size ? " A family on one duty every week has no other, so it isn't in the fair shares." : "";
	const off = "\nA family taken off for a while and added back by the same surname, or added partway through the season, has its weeks off counted as its share of them, so it isn't given duty after duty to catch up.";
	return html`<section class="fm" aria-labelledby="fm-h"><div class="fm-head"><h2 id="fm-h">Roster fairness</h2>
<p>Season ${p.season} · ${rows.length} ${rows.length === 1 ? "family" : "families"} · ${weeks}</p></div>
${verdict(rows.filter((r) => !regulars.has(r.id)), p.canGenerate, p.Ask)}${timeOff(rows)}
<p class="fm-how"><b>How duties are shared:</b> each week goes to the families who've had the fewest duties so far, and each
job to whoever has done it least, so no family ends up more than one duty ahead. Every game has its own duties, and nobody has two jobs in the same week unless a weekend has more duties than families. Where it's just as fair, nobody does the same job two weeks running or two games in a row.${noVideo}${off}${regular}</p>
<div class="fm-panel"><div class="fm-panel-head"><span class="fm-label">Duties per family</span><span class="fm-hint">this season, done and coming up</span></div>
${table(rows, shown, p.duties)}</div>
<div class="fm-panel"><div class="fm-panel-head"><span class="fm-label">Week by week</span><span class="fm-hint">each square is a week with a game, coloured by that family's duty; outlined is this week; slide sideways for the rest of the season</span></div>
${weekGrid(rows, p)}<div class="fm-legend">${shown.map((d) => html`<span><i class="fm-dot fm-${d}"></i>${dutyLabel(d, p.duties)}</span>`)}<span><i class="fm-dot fm-track"></i>No duty</span></div></div></section>`;
}
