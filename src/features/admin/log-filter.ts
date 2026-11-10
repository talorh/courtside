// The Log's filters, all in the address so a filtered Log can be bookmarked or shared between admins: which lines (the
// chips), the days, who, which team, which event, which kind of device, words to look for, only warnings, device views
// hidden, and the page. Every filter combines with the others (and). The choices offered are those in the days chosen,
// each with how many lines it has.
import { deviceKind } from "../../shared/device.ts";
import { type LogDays, quickDays } from "./log-entries.ts";
import { DEVICE_VIEWS, EVENTS, type LogEvent, type LogKind } from "./log-events.ts";
import { type LogRow, whoName } from "./log-words.ts";

/** Which lines: everything, or one of the Log's groups (log-events.ts). */
export const LOG_SHOWS = { all: "Everything", admins: "Admins", teams: "Teams", videos: "Videos", photos: "Photos", signins: "Sign-ins", problems: "Problems" } as const;
export type LogShow = keyof typeof LOG_SHOWS;
export const LOG_KINDS = ["admins", "teams", "videos", "photos", "signins", "problems"] as const satisfies readonly LogKind[];

/** A page of the table. */
export const PAGE_ROWS = 100;

/** `device`: a kind of device ("iPhone"); `warn`: only the lines that warn. */
export interface LogFilters { show: LogShow; days: LogDays; who: string; team: string; event: LogEvent | ""; device: string; q: string; warn: boolean; quiet: boolean; page: number }

const MAX_Q = 100;

export function askedFilters(url: URL, days: LogDays): LogFilters {
	const p = (k: string) => (url.searchParams.get(k) ?? "").trim().slice(0, 254);
	const show = p("show"), event = p("event"), page = Number.parseInt(p("page"), 10);
	return {
		show: Object.hasOwn(LOG_SHOWS, show) ? show as LogShow : "all", days, who: p("who").toLowerCase(), team: p("team"),
		event: Object.hasOwn(EVENTS, event) ? event as LogEvent : "", device: p("device").slice(0, 40), q: p("q").slice(0, MAX_Q),
		warn: p("warn") === "1", quiet: p("quiet") === "1", page: Number.isFinite(page) && page > 1 ? page : 1,
	};
}

const same = (a: LogDays, b: LogDays) => a.from === b.from && a.to === b.to;

/** The Log's address with `f` (the default, everything in the last 7 days, is plain /admin/log). */
export function logHref(f: LogFilters, now: Date, path = "/admin/log"): string {
	const extra = [["who", f.who], ["team", f.team], ["event", f.event], ["device", f.device], ["q", f.q], ["warn", f.warn ? "1" : ""], ["quiet", f.quiet ? "1" : ""],
		["page", f.page > 1 ? String(f.page) : ""]].filter(([, v]) => v);
	if (f.show === "all" && same(f.days, quickDays(now).week) && !extra.length) return path;
	return `${path}?${new URLSearchParams([["show", f.show], ["from", f.days.from], ["to", f.days.to], ...extra]).toString()}`;
}

type Own = "show" | "who" | "team" | "event" | "device";

/** Whether a row passes every filter but `skip` (a filter's own choices are counted without itself). */
function passes(r: LogRow, f: LogFilters, skip?: Own): boolean {
	if (skip !== "show" && f.show !== "all" && r.kind !== f.show) return false;
	if (skip !== "who" && f.who && r.who.toLowerCase() !== f.who) return false;
	if (skip !== "team" && f.team && r.team !== f.team) return false;
	if (skip !== "event" && f.event && r.event !== f.event) return false;
	if (skip !== "device" && f.device && deviceKind(r.device) !== f.device) return false;
	if (f.warn && EVENTS[r.event].tone !== "warn") return false;
	if (f.quiet && !f.event && DEVICE_VIEWS.includes(r.event)) return false;
	if (!f.q) return true;
	const q = f.q.toLowerCase();
	return [whoName(r.who), r.what, r.teamSeason ?? "", r.ip, r.device, EVENTS[r.event].name].some((s) => s.toLowerCase().includes(q));
}

export const filterRows = (rows: LogRow[], f: LogFilters) => rows.filter((r) => passes(r, f));

export interface Choice { value: string; label: string; n: number }

const tally = (rows: LogRow[], key: (r: LogRow) => string | null, label: (r: LogRow) => string): Choice[] => {
	const seen = new Map<string, Choice>();
	for (const r of rows) {
		const k = key(r);
		if (!k) continue;
		const c = seen.get(k) ?? { value: k, label: label(r), n: 0 };
		c.n++;
		seen.set(k, c);
	}
	return [...seen.values()];
};

/** The choices each filter offers, from the days chosen with the other filters applied, and how many lines each has. */
export function logChoices(rows: LogRow[], f: LogFilters) {
	const without = (skip: Own) => rows.filter((r) => passes(r, f, skip));
	const byLabel = (a: Choice, b: Choice) => a.label.localeCompare(b.label);
	const shows = without("show"), kinds = { all: shows.length, admins: 0, teams: 0, videos: 0, photos: 0, signins: 0, problems: 0 } satisfies Record<LogShow, number>;
	for (const r of shows) kinds[r.kind]++;
	const events = tally(without("event"), (r) => r.event, (r) => EVENTS[r.event].name).sort(byLabel);
	return {
		kinds,
		who: tally(without("who"), (r) => r.who.toLowerCase(), (r) => whoName(r.who)).sort(byLabel),
		team: tally(without("team"), (r) => r.team, (r) => r.teamSeason ?? "").sort(byLabel),
		event: LOG_KINDS.map((kind) => ({ kind, choices: events.filter((c) => EVENTS[c.value as LogEvent].kind === kind) })),
		device: tally(without("device"), (r) => deviceKind(r.device), (r) => deviceKind(r.device)).sort(byLabel),
	};
}
export type LogChoices = ReturnType<typeof logChoices>;
