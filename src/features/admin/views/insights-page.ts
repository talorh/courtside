// The admin area's landing page, Insights: is the site all right (Alerts: the banner, what needs an admin, every
// check as a light, what's going on now), then the whole site in numbers on three boards, first views week by week and
// when families watch, the rest as small charts, mobile against desktop, the teams side by side, then what stands out.
// The figures behind the checks are on Platform.
import type { AdminFrame } from "../../../app/admin-router.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, formatShortDate, localTime } from "../../../shared/time.ts";
import { ICON_PLUS } from "../../../ui/icons.ts";
import { teamLabel } from "../../teams/team-code.ts";
import type { Health } from "../health-load.ts";
import type { Attention } from "../insights-attention.ts";
import type { TeamCounts } from "../insights-repository.ts";
import { adminLayout } from "./admin-layout.ts";
import { alertsSection } from "./alerts-section.ts";
import { type Score, scoreboards } from "./insights-board.ts";
import { meter, weeklyChart, weeklyTable } from "./insights-chart.ts";
import { type Devices, devicesSection } from "./insights-devices.ts";
import { heatmap } from "./insights-heatmap.ts";

/** `series`: first views, videos added, live streams saved, clips made, photos added, downloads, each by week. */
export interface InsightsProps {
	frame: AdminFrame; now: Date; teams: TeamCounts[]; people: number; signedIn: { week: number; month: number };
	weeks: string[]; series: Record<"views" | "videos" | "streams" | "clips" | "photos" | "downloads", number[]>;
	heat: number[][]; standouts: string[]; attention: Attention[]; health: Health; devices: Devices;
}

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const hours = (seconds: number) => (seconds >= 36_000 ? thousands(seconds / 3600) : (Math.round(seconds / 360) / 10).toString());
const sum = (teams: TeamCounts[], pick: (t: TeamCounts) => number) => teams.reduce((n, t) => n + pick(t), 0);

function board(p: InsightsProps): SafeHtml {
	const t = p.teams, s = p.series;
	const running = t.filter((c) => c.team.status === "active").length;
	// A count and what it counts, one or many ("1 video", "2 videos").
	const of = (n: number, one: string, many: string, more: Omit<Score, "value" | "label"> = {}): Score => ({ value: thousands(n), label: n === 1 ? one : many, ...more });
	return scoreboards([
		{ title: "Teams and people", scores: [
			of(running, "team running", "teams running"), { value: html`${p.people}`, label: "people on teams" }, { value: p.signedIn.week, label: "opened the site this week" },
		] },
		{ title: "Footage", scores: [
			of(sum(t, (c) => c.videos), `video, ${hours(sum(t, (c) => c.videoSeconds))} hours`, `videos, ${hours(sum(t, (c) => c.videoSeconds))} hours`, { weekly: s.videos, trend: "added" }),
			of(sum(t, (c) => c.streams), "live stream saved", "live streams saved", { weekly: s.streams, trend: "saved" }),
			of(sum(t, (c) => c.clips), "highlight clip", "highlight clips", { weekly: s.clips, trend: "added" }),
			of(sum(t, (c) => c.photos), "photo", "photos", { weekly: s.photos, trend: "added" }),
		] },
		{ title: "Watching and asking", scores: [
			of(sum(t, (c) => c.watchers30), "first view, 30 days", "first views, 30 days", { weekly: s.views }),
			of(sum(t, (c) => c.downloads30), "download, 30 days", "downloads, 30 days", { weekly: s.downloads }),
			of(sum(t, (c) => c.questions30), "question asked, 30 days", "questions asked, 30 days"),
		] },
	]);
}

/** Each team side by side: its people, a bar for who of them opened the site, and its share of first views. */
function compare(teams: TeamCounts[]): SafeHtml {
	const most = Math.max(1, ...teams.map((c) => c.watchers30));
	const bar = (n: number, of: number, limit = false) => html`<span class="inbar">${meter(n, of, limit)}<span>${n}</span></span>`;
	const head = ["People", "Opened the site, 30 days", "Videos", "Clips", "Photos", "First views, 30 days", "Last upload", "Removal requests"];
	const cell = (i: number, body: SafeHtml | string | number) => html`<td data-label="${head[i]}">${body}</td>`;
	const row = (c: TeamCounts) => html`<tr><th scope="row">${teamLabel(c.team)}${c.team.status !== "active" ? html` <span class="t">Season over</span>` : ""}</th>
${cell(0, c.people)}${cell(1, bar(c.signedIn30, Math.max(1, c.people)))}
${cell(2, `${c.videos} (${hours(c.videoSeconds)} h)`)}${cell(3, c.clips)}${cell(4, c.photos)}${cell(5, bar(c.watchers30, most))}
${cell(6, c.lastUpload ? formatShortDate(localTime(new Date(c.lastUpload))) : "None yet")}${cell(7, c.openRequests)}</tr>`;
	return html`<section class="stack"><div class="panelhead"><h2>The teams side by side</h2><span class="small"><a href="/admin/teams">Teams</a></span></div>
<div class="tablewrap cards"><table class="compare"><thead><tr><th scope="col">Team</th>${head.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead><tbody>${teams.map(row)}</tbody></table></div></section>`;
}

export function insightsPage(p: InsightsProps): SafeHtml {
	const s = p.series;
	const table = [{ title: "First views", values: s.views }, { title: "Videos added", values: s.videos }, { title: "Clips made", values: s.clips },
		{ title: "Photos added", values: s.photos }, { title: "Downloads", values: s.downloads }, { title: "Devices, mobile view", values: p.devices.weekly.mobile },
		{ title: "Devices, desktop view", values: p.devices.weekly.desktop }];
	const small = table.slice(1, 5).map((c) => weeklyChart(c.title, p.weeks, c.values));
	const head = html`<a class="btn primary" href="/admin/teams/new">${ICON_PLUS}Onboard a team</a>`;
	return adminLayout({ title: "Insights", current: "insights", frame: p.frame, head, lede: `Is the site all right, and the whole site at a glance, every team. Updated ${formatGameDate(localTime(p.now))}.` },
		html`${alertsSection({ now: p.now, needs: p.attention, ...p.health })}
<section class="stack" aria-labelledby="numbers-h"><h2 id="numbers-h" class="sr">The site in numbers</h2>${board(p)}
<div class="insightgrid">${weeklyChart("First views", p.weeks, s.views, true)}${heatmap(p.heat)}</div>
<div class="charts">${small}</div>
${devicesSection(p.weeks, p.devices)}
<div class="insightpair">${compare(p.teams)}<section class="panel stack"><h2>What stands out</h2><ul class="steps">${p.standouts.map((line) => html`<li>${line}</li>`)}</ul></section></div>
${weeklyTable(p.weeks, table)}</section>
<p class="small">First views: the first time each person opened a video. Weeks run Monday to Sunday, local time.</p>`);
}
