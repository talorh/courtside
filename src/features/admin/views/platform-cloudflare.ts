import { CLUB } from "../../../club.ts";
// Platform's Cloudflare part (what the Cloudflare dashboard says about the site and its security): the
// Worker, its database, the originals, Stream, Workers AI and the zone over the last 30 days, against what's included.
import type { CloudflareFigures } from "../../../platform/cloudflare-insights.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { meter } from "./insights-chart.ts";

/** What Workers Paid includes each month (Cloudflare's pricing), and Workers AI's free daily allowance. */
const WORKER_REQUESTS = 10_000_000, D1_ROWS_READ = 25_000_000_000, D1_ROWS_WRITTEN = 50_000_000, AI_NEURONS_A_DAY = 10_000;

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

function row(label: string, value: string, note: string, used?: number, limit?: number): SafeHtml {
	return html`<div class="limitrow"><div class="limithead"><b>${label}</b><span>${value}</span></div>${used !== undefined && limit ? meter(used, limit) : ""}<p class="small">${note}</p></div>`;
}

/** `figures` null: not read just now; `configured` false: no token (local dev). */
export function cloudflareSection(figures: CloudflareFigures | null, configured: boolean): SafeHtml {
	const panel = (body: SafeHtml) => html`<section class="panel stack"><h2>Cloudflare, the last 30 days</h2>${body}</section>`;
	if (!configured) return panel(html`<p class="small">Cloudflare's figures need the read-only token (CF_INSIGHTS_TOKEN, docs/runbooks/cloudflare-setup.md).</p>`);
	if (!figures) return panel(html`<p class="small">Cloudflare's figures couldn't be read just now.</p>`);
	const f = figures;
	const aiADay = f.aiNeurons / 30;
	return panel(html`${row("Worker requests", `${thousands(f.workers.requests)} of ${thousands(WORKER_REQUESTS)} a month`,
		`Typical page ${Math.round(f.workers.cpuP50Ms)} ms of processing, the slowest 1% ${Math.round(f.workers.cpuP99Ms)} ms; ${f.workers.errors} ${f.workers.errors === 1 ? "error" : "errors"}.`, f.workers.requests, WORKER_REQUESTS)}
${row("Database rows read", `${thousands(f.d1.rowsRead)} of ${thousands(D1_ROWS_READ)} a month`, `${thousands(f.d1.queries)} queries in all.`, f.d1.rowsRead, D1_ROWS_READ)}
${row("Database rows written", `${thousands(f.d1.rowsWritten)} of ${thousands(D1_ROWS_WRITTEN)} a month`, "Included in Workers Paid.", f.d1.rowsWritten, D1_ROWS_WRITTEN)}
${row("Uploaded originals (R2)", `${gb(f.r2.bytes)} in ${thousands(f.r2.objects)} ${f.r2.objects === 1 ? "file" : "files"}`, "Kept 30 days, then Stream's copy is the video. 10 GB is free, then US$0.015 a GB a month.")}
${row("Minutes watched (Stream)", thousands(f.streamMinutesWatched), "Free within the plan's allowance, then US$1 for every 1,000; Costs shows what Cloudflare charged.")}
${row("Workers AI", `${thousands(aiADay)} of ${thousands(AI_NEURONS_A_DAY)} a day`, "Neurons, a day on average (Ask, the Documentation assistant, fixture pages); the first 10,000 each day are free.", aiADay, AI_NEURONS_A_DAY)}
${row(`Requests to ${CLUB.domain}`, `${thousands(f.zone.requests)}; ${thousands(f.zone.threats)} threats stopped`, "Everything that reached the address, the human check and blocked bots included.")}`);
}
