// The admin area's Log: what's happening right now across the teams (log-now.ts), then every line of the days chosen,
// newest first, in local time, as a table a day at a time: when, who, the event, what happened, the team, and the
// device (with the internet address, for the sign-in page's lines). Admins', team managers' and the site's changes,
// videos (uploads, processing, clips, Go live, removal requests), photos, the sign-in page and which view each
// signed-in device uses. Every filter is in the bar above (log-filters.ts); a person, team, event or device in the table
// filters to it when clicked. A few figures for the lines shown, 100 a page, and the lines shown for Excel.
import type { AdminFrame } from "../../../app/admin-router.ts";
import { deviceKind } from "../../../shared/device.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatDay, formatGameDate, localTime } from "../../../shared/time.ts";
import { type LogChoices, type LogFilters, logHref, PAGE_ROWS } from "../log-filter.ts";
import { LOG_MOST, quickDays } from "../log-entries.ts";
import { EVENTS } from "../log-events.ts";
import { type LogRow, whoName } from "../log-words.ts";
import { adminLayout } from "./admin-layout.ts";
import { logFilters } from "./log-filters.ts";
import { type RightNow, rightNow } from "./log-now.ts";

const count = (n: number) => n.toLocaleString("en-AU");

function device(r: LogRow, to: (change: Partial<LogFilters>) => string): SafeHtml {
	const kind = deviceKind(r.device);
	const label = kind ? html`<a href="${to({ device: kind })}" title="Only ${kind}">${r.device}</a>` : "";
	return html`${label}${r.ip ? html`<a class="l-addr" href="${to({ q: r.ip })}" title="Only ${r.ip}">${r.ip}</a>` : ""}`;
}

function row(r: LogRow, to: (change: Partial<LogFilters>) => string): SafeHtml {
	const [, time = ""] = formatGameDate(localTime(new Date(r.at))).split(", ");
	const e = EVENTS[r.event];
	return html`<tr class="lr"><td class="l-when"><time datetime="${r.at}">${time}</time></td>
<td class="l-who"><a href="${to({ who: r.who.toLowerCase() })}" title="Only ${whoName(r.who)}">${whoName(r.who)}</a></td>
<td class="l-event"><a class="ev ${e.tone}" href="${to({ event: r.event })}" title="Only ${e.name}">${e.name}</a></td>
<td class="l-what">${r.what}</td>
<td class="l-team">${r.team ? html`<a class="teamtag" href="${to({ team: r.team })}" title="Only ${r.teamSeason}">${r.teamName}</a>` : ""}</td>
<td class="l-ip">${device(r, to)}</td></tr>`;
}

/** The rows a day at a time, each day's heading row first. */
function rows(shown: LogRow[], to: (change: Partial<LogFilters>) => string): SafeHtml[] {
	let day = "";
	return shown.map((r) => {
		const d = localTime(new Date(r.at)).slice(0, 10), head = d === day ? "" : html`<tr class="sectionrow lday"><td colspan="6">${formatDay(d)}</td></tr>`;
		day = d;
		return html`${head}${row(r, to)}`;
	});
}

function stats(lines: LogRow[]): SafeHtml {
	const people = new Set(lines.filter((r) => r.who && r.who !== "site").map((r) => r.who.toLowerCase())).size;
	const stat = (n: number, label: string, cls = "") => html`<div class="lstat${cls}"><b>${count(n)}</b><span>${label}</span></div>`;
	const warnings = lines.filter((r) => EVENTS[r.event].tone === "warn").length;
	return html`<section class="statrow" aria-label="These lines">${stat(lines.length, lines.length === 1 ? "line" : "lines")}${stat(people, people === 1 ? "person" : "people")}
${stat(lines.filter((r) => r.event === "signed_in").length, "signed in")}${stat(warnings, warnings === 1 ? "warning" : "warnings", " warn")}</section>`;
}

/** `cut`: the days had more lines than the Log reads (log-entries.ts). */
export function logPage(p: { frame: AdminFrame; lines: LogRow[]; cut: boolean; filters: LogFilters; choices: LogChoices; now: Date; rightNow: RightNow }): SafeHtml {
	const f = p.filters, n = p.lines.length, pages = Math.max(1, Math.ceil(n / PAGE_ROWS)), page = Math.min(f.page, pages);
	const to = (change: Partial<LogFilters>) => logHref({ ...f, page: 1, ...change }, p.now);
	const first = (page - 1) * PAGE_ROWS, shown = p.lines.slice(first, first + PAGE_ROWS);
	const span = f.days.from === f.days.to ? formatDay(f.days.from) : `${formatDay(f.days.from)} to ${formatDay(f.days.to)}`;
	const most = p.cut ? html` The newest ${count(LOG_MOST)} of each kind of line in these dates: choose fewer days for the rest.` : "";
	const at = n ? `${count(first + 1)} to ${count(first + shown.length)} of ` : "";
	const pager = pages > 1 ? html`<nav class="pager" aria-label="Pages">${page > 1 ? html`<a class="btn" href="${logHref({ ...f, page: page - 1 }, p.now)}">Newer</a>` : ""}<span class="small">Page ${page} of ${pages}</span>${page < pages ? html`<a class="btn" href="${logHref({ ...f, page: page + 1 }, p.now)}">Older</a>` : ""}</nav>` : "";
	const table = n ? html`<div class="tablewrap cards"><table class="logtable"><thead><tr><th scope="col">Time</th><th scope="col">Who</th><th scope="col">Event</th><th scope="col">What happened</th><th scope="col">Team</th><th scope="col">Device</th></tr></thead>
<tbody>${rows(shown, to)}</tbody></table></div>${pager}` : html`<div class="empty"><b>No lines match.</b><p>Try more days, or clear a filter.</p></div>`;
	const download = n ? html`<a class="btn" href="${logHref({ ...f, page: 1 }, p.now, "/admin/log.xlsx")}" download>Download for Excel</a>` : "";
	return adminLayout({ title: "Log", current: "log", frame: p.frame, lede: "What's happening now in every team, then everything that happened: admins', team managers' and the site's changes, uploads and videos, photos, and the sign-in page (kept a month), newest first, in local time, with the device each came from. Filter by anything; click a person, team, event or device to see only its lines." },
		html`${rightNow(p.rightNow)}${logFilters(f, p.choices, p.now, quickDays(p.now).today.to)}${stats(p.lines)}
<section class="panel stack"><div class="loghead"><p class="small"><b>${at}${count(n)} ${n === 1 ? "line" : "lines"}, ${span}</b>.${most}</p>${download}</div>${table}</section>`);
}
