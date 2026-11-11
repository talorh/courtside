// The admin Changelog, as release notes: a panel a day, newest first, its changes under Features, Enhancements and
// Fixes (in that order, whatever order they were written in), each with its area in bold; chips show one kind only,
// and the activity heatmap at the top (changelog-heatmap.ts) counts the same kind.
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { adminLayout } from "../../admin/views/admin-layout.ts";
import { CHANGE_KINDS, type ChangeKind, type ChangelogDay } from "../changelog.ts";
import type { DayCell } from "../changelog-weeks.ts";
import { activityHeatmap } from "./changelog-heatmap.ts";

const HEADINGS: Record<ChangeKind, string> = { feature: "Features", enhancement: "Enhancements", fix: "Fixes" };

function day(d: ChangelogDay, only: ChangeKind | null): SafeHtml | "" {
	const groups = CHANGE_KINDS.filter((k) => !only || k === only).map((k) => ({ k, changes: d.changes.filter((c) => c.kind === k) })).filter((g) => g.changes.length);
	if (!groups.length) return "";
	return html`<section class="panel release"><h2>${d.date}</h2>${groups.map((g) => html`<h3 class="rkind k-${g.k}">${HEADINGS[g.k]} <span class="n">${g.changes.length}</span></h3>
<ul class="rnotes">${g.changes.map((c) => html`<li>${c.area ? html`<b>${c.area}:</b> ` : ""}${c.text}</li>`)}</ul>`)}</section>`;
}

export function changelogPage({ frame, days, weeks, only }: { frame: AdminFrame; days: ChangelogDay[]; weeks: Array<Array<DayCell | null>>; only: ChangeKind | null }): SafeHtml {
	const count = (k: ChangeKind | null) => days.reduce((n, d) => n + d.changes.filter((c) => !k || c.kind === k).length, 0);
	const chip = (k: ChangeKind | null) => html`<a class="chip" href="/admin/changelog${k ? `?type=${k}` : ""}"${k === only ? html` aria-current="true"` : ""}>${k ? HEADINGS[k] : "All"} <span class="n">${count(k)}</span></a>`;
	return adminLayout({ title: "Changelog", current: "changelog", frame, lede: "What changed on the site, newest first, as release notes: new features, enhancements to what was there, and fixes. The first line of each update is its deploy's message." },
		html`<nav class="chips" aria-label="Which changes">${chip(null)}${CHANGE_KINDS.map(chip)}</nav>${activityHeatmap(weeks, only)}${days.map((d) => day(d, only))}`);
}
