// Costs' smaller widgets, around its charts: the figures as a row of tiles (each a figure, what it is, a line under it
// and, for some, a small picture: the months as a sparkline, or a meter), every team's season on one scale, and what the
// teams used this month. SVG attributes and admin.css classes only (the CSP).
import { html, raw, type SafeHtml } from "../../../shared/html.ts";
import { teamLabel } from "../../teams/team-code.ts";
import { budgetLevel } from "../budget-checks.ts";
import { type Currency, money } from "../costs-currency.ts";
import type { TeamCosts } from "../costs-estimate.ts";
import { BASELINE, PRICES } from "../costs-prices.ts";
import { thousands } from "./costs-words.ts";

/** `pill`: whether the figure is actual (Cloudflare's bill) or estimated, said beside its name. */
export interface Tile { value: string; label: string; note: string; pic?: SafeHtml; pill?: Pill }
export interface Pill { cls: "actual" | "est"; text: string }
export const ACTUAL: Pill = { cls: "actual", text: "Actual" }, ESTIMATED: Pill = { cls: "est", text: "Estimated" }, NOT_BILLED: Pill = { cls: "est", text: "Not billed" };
export const pill = (p: Pill) => html`<span class="pill ${p.cls}">${p.text}</span>`;

export type Level = "ok" | "warn" | "over";

/** A thin bar, filled to `share` of its length (past the end, full); `cls` "fmeter" for one on a white card. */
export function meter(share: number, level: Level = "ok", cls = "tmeter"): SafeHtml {
	const w = (Math.max(0, Math.min(1, share)) * 100).toFixed(1);
	return raw(`<svg class="${cls}" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="100" height="6" rx="3"></rect><rect class="fill ${level}" width="${w}" height="6" rx="3"></rect></svg>`);
}

/** The figures, a tile each, in one board. */
export const tiles = (ts: Tile[]) =>
	html`<section class="scoreboard costtiles" aria-label="The figures">${ts.map((t) => html`<div class="sb"><b>${t.value}</b><span>${t.label}</span>${t.pill ? pill(t.pill) : ""}${t.pic ?? ""}<span class="delta">${t.note}</span></div>`)}</section>`;

/** Stream's storage this month, every team's, against what's bought (the bundle's, unless more is). */
export function storageTile(costs: TeamCosts[], bought: number | null): Tile {
	const stored = costs.reduce((s, c) => s + (c.thisMonth?.use.stored ?? 0), 0);
	const cap = Math.max(PRICES.bundleMinutes, bought ?? 0);
	return {
		value: `${thousands(stored)} min`, label: "Stream storage", pill: ACTUAL, pic: meter(stored / cap, stored > cap ? "over" : stored > cap * 0.8 ? "warn" : "ok"),
		note: `of ${thousands(cap)} ${cap > PRICES.bundleMinutes ? "bought" : "in the bundle"}`,
	};
}

const LEVELS = { none: "ok", ok: "ok", warn: "warn", urgent: "over" } as const;

/** Each team's season, dearest first, on one scale: spent so far (solid), the rest of its estimate (light), its budget (a tick). */
export function teamSeasons(costs: TeamCosts[], cur: Currency): SafeHtml {
	const m = money(cur), sorted = [...costs].sort((a, b) => b.estimate - a.estimate);
	const top = Math.max(0.01, ...sorted.map((c) => Math.max(c.estimate, c.team.budget)));
	const at = (n: number) => ((Math.max(0, n) / top) * 100).toFixed(1);
	const row = (c: TeamCosts) => {
		const bar = `<svg class="tbar" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><rect class="track" y="3" width="100" height="6" rx="3"></rect><rect class="est" y="3" width="${at(c.estimate)}" height="6" rx="3"></rect><rect class="spent ${LEVELS[budgetLevel(c)]}" y="3" width="${at(c.soFar)}" height="6" rx="3"></rect><rect class="budgetmark" x="${(Number(at(c.team.budget)) - 0.5).toFixed(1)}" y="0" width="1" height="12"></rect></svg>`;
		return html`<li><a href="/admin/costs/${c.team.id}${cur === "usd" ? "?cur=usd" : ""}">${teamLabel(c.team)}</a><span class="kval"><b>${m(c.estimate)}</b> of ${m(c.team.budget)}</span>${raw(bar)}<span class="sub">${m(c.soFar)} spent${c.team.status === "active" ? "" : ", its season over"}</span></li>`;
	};
	const body = sorted.length ? html`<ul class="kindlist teamlist">${sorted.map(row)}</ul>` : html`<p class="small">No teams this season.</p>`;
	return html`<figure class="chart kinds"><figcaption><b>Each team's season</b> <span class="small">Estimated, against its budget</span></figcaption>${body}
<p class="small">Solid: spent so far. Light: the rest of the season, estimated. The tick: its budget.</p></figure>`;
}

/** What the teams used in `month`: minutes Stream stored and delivered, originals R2 kept, games with a video. */
export function usedThisMonth(costs: TeamCosts[], month: string, title: string): SafeHtml {
	const sum = (f: (c: TeamCosts) => number) => costs.reduce((s, c) => s + f(c), 0);
	const running = costs.filter((c) => c.team.status === "active").length;
	const unit = (value: string, label: string, sub: string) => html`<div class="unit"><b>${value}</b><span>${label}</span><span class="sub">${sub}</span></div>`;
	return html`<figure class="chart kinds"><figcaption><b>${title}</b> <span class="small">Every team</span></figcaption><div class="units">
${unit(thousands(sum((c) => c.months.find((x) => x.month === month)?.use.stored ?? 0)), "Minutes stored", "Videos and clips, on Stream")}
${unit(thousands(sum((c) => c.months.find((x) => x.month === month)?.use.watched ?? 0)), "Minutes watched", "Live, later and downloads")}
${unit(`${sum((c) => c.months.find((x) => x.month === month)?.use.gbMonths ?? 0).toFixed(1)} GB`, "Originals in R2", "GB-months, each kept 30 days")}
${unit(thousands(sum((c) => c.games)), "Games with a video", running ? `Of ${running * BASELINE.games}, ${BASELINE.games} a team` : "This season")}
</div></figure>`;
}
