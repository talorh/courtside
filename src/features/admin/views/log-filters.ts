// The Log's filter bar: which lines as chips (each with how many), the days as chips or two dates, and a form with who,
// team, event, device, words to look for, only warnings and device views hidden, which applies as each changes
// (admin.js; Apply without scripts). Clear keeps the days and drops the rest.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { type LogChoices, type LogFilters, logHref, LOG_SHOWS, type LogShow } from "../log-filter.ts";
import { type LogDays, quickDays } from "../log-entries.ts";
import { EVENTS, KIND_NAMES } from "../log-events.ts";

const QUICK = { today: "Today", yesterday: "Yesterday", week: "Last 7 days", month: "Last month" } as const;

const chip = (to: string, label: string | SafeHtml, on: boolean) => html`<a class="chip" href="${to}"${on ? html` aria-current="true"` : ""}>${label}</a>`;
const count = (n: number) => n.toLocaleString("en-AU");

function select(name: string, label: string, any: string, options: SafeHtml): SafeHtml {
	return html`<label class="lf-${name}">${label}<select name="${name}"><option value="">${any}</option>${options}</select></label>`;
}
const option = (value: string, label: string, n: number, selected: string) => html`<option value="${value}"${value === selected ? html` selected` : ""}>${label} (${count(n)})</option>`;
const tick = (name: string, on: boolean, label: string) => html`<label class="lf-tick"><input type="checkbox" name="${name}" value="1"${on ? html` checked` : ""}> ${label}</label>`;

/** The chosen value stays a choice even when the days chosen have none of it, so the filter shows what's applied. */
function withChosen(choices: LogChoices["who"], chosen: string, label: string) {
	return chosen && !choices.some((c) => c.value === chosen) ? [...choices, { value: chosen, label, n: 0 }] : choices;
}

export function logFilters(f: LogFilters, choices: LogChoices, now: Date, today: string): SafeHtml {
	const quick = quickDays(now), same = (a: LogDays, b: LogDays) => a.from === b.from && a.to === b.to;
	const to = (change: Partial<LogFilters>) => logHref({ ...f, page: 1, ...change }, now);
	const shows = (Object.keys(LOG_SHOWS) as LogShow[]).map((s) => chip(to({ show: s }), html`${LOG_SHOWS[s]} <span class="n">${count(choices.kinds[s])}</span>`, s === f.show));
	const days = (Object.keys(QUICK) as Array<keyof typeof QUICK>).map((k) => chip(to({ days: quick[k] }), QUICK[k], same(f.days, quick[k])));
	const options = (list: LogChoices["who"], chosen: string) => withChosen(list, chosen, chosen).map((c) => option(c.value, c.label, c.n, chosen));
	const listed = choices.event.some((g) => g.choices.some((c) => c.value === f.event));
	const event = [...choices.event.filter((g) => g.choices.length).map((g) => html`<optgroup label="${KIND_NAMES[g.kind]}">${g.choices.map((c) => option(c.value, c.label, c.n, f.event))}</optgroup>`),
		...(f.event && !listed ? [option(f.event, EVENTS[f.event].name, 0, f.event)] : [])];
	const date = (name: "from" | "to") => html`<input type="date" name="${name}" value="${f.days[name]}" max="${today}" required>`;
	const filtered = Boolean(f.who || f.team || f.event || f.device || f.q || f.warn || f.quiet);
	return html`<nav class="chips" aria-label="Which lines">${shows}</nav>
<form method="get" action="/admin/log" class="panel logfilters" data-autosubmit><input type="hidden" name="show" value="${f.show}">
<div class="lf-days"><nav class="chips" aria-label="Which days">${days}</nav><label>From ${date("from")}</label><label>To ${date("to")}</label></div>
<div class="lf-row">${select("who", "Who", "Anyone", html`${options(choices.who, f.who)}`)}${select("team", "Team", "Any team", html`${options(choices.team, f.team)}`)}
${select("event", "Event", "Any event", html`${event}`)}${select("device", "Device", "Any device", html`${options(choices.device, f.device)}`)}
<label class="lf-q">Search<input type="search" name="q" value="${f.q}" maxlength="100" placeholder="An email, a team, an address, words"></label></div>
<div class="lf-foot"><span class="lf-ticks">${tick("warn", f.warn, "Only warnings")}${tick("quiet", f.quiet, "Hide device views")}</span>
<span class="lf-acts">${filtered ? html`<a class="btn" href="${to({ who: "", team: "", event: "", device: "", q: "", warn: false, quiet: false })}">Clear filters</a>` : ""}<button class="btn primary">Apply</button></span></div></form>`;
}
