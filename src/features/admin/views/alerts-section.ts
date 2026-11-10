// Insights' Alerts section: is the site all right? One answer at the top (all green, or what's wrong and how badly),
// then what needs an admin, every check with its colour and figure (problems first), and what's going on now.
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime } from "../../../shared/time.ts";
import { ICON_CHECK } from "../../../ui/icons.ts";
import type { Check, HealthLevel } from "../health-checks.ts";
import type { HealthCounts } from "../health-repository.ts";
import type { Attention } from "../insights-attention.ts";
import { attentionList } from "./insights-board.ts";

const WORDS: Record<HealthLevel, string> = { ok: "Green", warn: "Warning", urgent: "Urgent", idle: "Not yet" };
const ORDER: Record<HealthLevel, number> = { urgent: 0, warn: 1, ok: 2, idle: 3 };
const when = (iso: string) => formatGameDate(localTime(new Date(iso)));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function banner(checks: Check[], needs: Attention[], now: Date): SafeHtml {
	const urgent = checks.filter((c) => c.level === "urgent").length + needs.filter((a) => a.level === "urgent").length;
	const warn = checks.filter((c) => c.level === "warn").length + needs.filter((a) => a.level === "warn").length;
	const level = urgent ? "urgent" : warn ? "warn" : "ok";
	const checked = `Checked ${when(now.toISOString())}.`;
	if (level === "ok") return html`<section class="healthbanner ok" role="status">${ICON_CHECK}<div><h2>All green</h2><p>Every check is fine and nothing needs you. ${checked}</p></div></section>`;
	const what = [urgent ? `${urgent} urgent` : "", warn ? plural(warn, "warning") : ""].filter(Boolean).join(", ");
	return html`<section class="healthbanner ${level}" role="alert"><span class="dot" aria-hidden="true"></span><div><h2>${what}</h2><p>${urgent ? "Something needs you now" : "Worth a look soon"}: ${urgent + warn === 1 ? "it's" : "they're"} first below. ${checked}</p></div></section>`;
}

function check(c: Check): SafeHtml {
	const on = c.level === "warn" || c.level === "urgent";
	const ticket = on && c.ticketId ? html`<a href="/admin/support/${c.ticketId}">Ticket #${c.ticketId}</a>, ` : "";
	const since = on && c.since ? html`<span class="sub">${ticket}since ${when(c.since)}</span>` : "";
	return html`<li class="check ${c.level}"><span class="dot" aria-hidden="true"></span><div><h3><a href="${c.href}">${c.name}</a></h3><p>${c.figure}</p>${since}</div>${c.level === "ok" ? html`<span class="sr">${WORDS.ok}</span>` : html`<span class="lvl">${WORDS[c.level]}</span>`}</li>`;
}

/** The section: the banner, what needs an admin, the checks worst first, and what's going on right now. */
export function alertsSection(p: { now: Date; checks: Check[]; needs: Attention[]; counts: HealthCounts; sessions: number }): SafeHtml {
	const sorted = [...p.checks].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
	const needs = p.needs.length ? html`<section class="panel stack"><h2>Needs you</h2>${attentionList(p.needs)}</section>` : "";
	const now = html`<section class="panel nowstrip" aria-label="Right now"><p><b>${p.counts.liveNow}</b> ${p.counts.liveNow === 1 ? "live stream" : "live streams"} open</p>
<p><b>${p.counts.uploadingNow}</b> ${p.counts.uploadingNow === 1 ? "upload" : "uploads"} under way</p><p><b>${p.sessions}</b> ${p.sessions === 1 ? "device" : "devices"} signed in</p></section>`;
	return html`<section class="stack alerts" id="alerts" aria-labelledby="alerts-h"><div class="panelhead"><h2 id="alerts-h">Is the site all right?</h2><span class="small"><a href="/admin#alerts">Check again</a></span></div>
${banner(p.checks, p.needs, p.now)}${needs}<section class="panel stack"><h2>Checks</h2><ul class="checks">${sorted.map(check)}</ul></section>${now}</section>`;
}
