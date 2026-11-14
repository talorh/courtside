// The admin area's Platform page (Insights and Platform overlapped, so everything about the site's
// health is here and once): a row for each thing watched, its figure against its limit and how its alert stands; the
// nightly backup and clean-up in the 3am job's row; Cloudflare's last 30 days. Security Center's findings are read
// on the Cloudflare dashboard.
import type { AdminFrame } from "../../../app/admin-router.ts";
import { EMAILS_A_MONTH } from "../email-count-repository.ts";
import type { CloudflareFigures } from "../../../platform/cloudflare-insights.ts";
import type { StoredObject } from "../../../platform/r2-originals.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime } from "../../../shared/time.ts";
import { notice } from "../../../ui/components.ts";
import { KINDS } from "../alert-kinds.ts";
import type { AlertKind, PlatformAlert } from "../alerts-repository.ts";
import type { SignInFigures } from "../../../auth/sign-in-codes-repository.ts";
import { adminLayout } from "./admin-layout.ts";
import { meter } from "./insights-chart.ts";
import { backupLine, sweepLine } from "./platform-nightly.ts";
import { cloudflareSection } from "./platform-cloudflare.ts";

/** Images' plan stores this many (the Images and Stream bundle); a D1 database can't grow past 10 GB (5 included). */
export const IMAGES_INCLUDED = 100_000;
const D1_MAX_BYTES = 10 * 1024 ** 3;

export interface PlatformProps {
	frame: AdminFrame; lastBackup: StoredObject | null; lastSweep: StoredObject | null;
	/** Stream's minutes, or null when it didn't answer. */
	storage: { usedMinutes: number; limitMinutes: number } | null;
	photos: number; people: number; alerts: PlatformAlert[]; now: Date; dbBytes: number | null;
	/** Emails sent this month, against EMAILS_A_MONTH. */
	emailsThisMonth: number;
	/** The sign-in's last 24 hours, and devices signed in now (the site's own sign-in). */
	signIns: SignInFigures & { sessions: number };
	cloudflare: { configured: boolean; figures: CloudflareFigures | null };
	/** The last test email, from the admin log. */
	testEmail: { at: string; detail: string } | null;
	/** Staging (docs/runbooks/staging.md): its 5-minute job runs from here. */
	staging: boolean;
	message: string | null;
}

/** What a change just did (`?done=`): fixed words only, never anything from the address itself. */
export const PLATFORM_MESSAGES: Record<string, string> = {
	ran: "The 5-minute job ran.", ranfailed: "The 5-minute job ran, but something in it failed: the Worker's logs say what.",
	gameday: "The game check ran: its row says how the week's live games stand.",
};

const when = (iso: string) => formatGameDate(localTime(new Date(iso)));
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const bytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

/** How an alert stands: a badge, and its detail, since when and its ticket (or when it's first checked). */
function standing(kind: AlertKind, alerts: PlatformAlert[]): { badge: SafeHtml; line: SafeHtml } {
	const k = KINDS.find((x) => x.kind === kind)!;
	const a = alerts.find((x) => x.kind === kind);
	if (!a) return { badge: html`<span class="t">${k.first.split(":")[0]}</span>`, line: html`<p class="small">${k.first}</p>` };
	const badge = a.level === "ok" ? html`<span class="t src">Ok</span>` : a.level === "warn" ? html`<span class="t warn">${k.warn}</span>` : html`<span class="t urgent">Urgent</span>`;
	const since = a.since ? ` Since ${when(a.since)}.` : "";
	const ticket = a.ticketId ? html` <a href="/admin/support/${a.ticketId}">Ticket #${a.ticketId}</a>` : "";
	return { badge, line: html`<p class="small">${a.detail}.${since}${ticket}</p>` };
}

function row(heading: string, figure: SafeHtml, o: { kind?: AlertKind; alerts: PlatformAlert[]; used?: number; limit?: number; more?: SafeHtml }): SafeHtml {
	const state = o.kind ? standing(o.kind, o.alerts) : null;
	return html`<li class="watch1"><div><h3>${heading}</h3><p class="fig">${figure}</p></div><p class="state">${state?.badge ?? ""}</p>
${o.used !== undefined && o.limit ? meter(o.used, o.limit) : ""}${state?.line ?? ""}${o.more ?? ""}</li>`;
}

function watched(p: PlatformProps): SafeHtml {
	const a = p.alerts, s = p.storage;
	return html`<section class="panel stack"><h2>What's watched</h2><ul class="watchlist">
${row("Video storage (Stream)", s ? html`<b>${thousands(s.usedMinutes)}</b> of ${thousands(s.limitMinutes)} minutes used, shared by every team.` : html`Stream didn't answer just now: reload to try again.`, { kind: "stream_storage", alerts: a, used: s?.usedMinutes, limit: s?.limitMinutes })}
${row("Sign-ins", html`<b>${thousands(p.signIns.sessions)}</b> ${p.signIns.sessions === 1 ? "device" : "devices"} signed in; <b>${p.people}</b> people on teams (each email once).`, { alerts: a, more: html`<p class="small">Last 24 hours: ${thousands(p.signIns.codesSent)} ${p.signIns.codesSent === 1 ? "code" : "codes"} sent, ${thousands(p.signIns.signedIn)} signed in, ${thousands(p.signIns.wrong)} wrong ${p.signIns.wrong === 1 ? "code" : "codes"}, ${thousands(p.signIns.refused)} refused (not on a list, or over a limit). Each address gets 10 codes an hour and 20 a day, and 15 wrong codes a day; the site sends 200 an hour at most.</p>` })}
${row("Photos (Images)", html`<b>${thousands(p.photos)}</b> of ${thousands(IMAGES_INCLUDED)}, in the Images and Stream bundle.`, { kind: "images", alerts: a, used: p.photos, limit: IMAGES_INCLUDED })}
${row("Database (D1)", p.dbBytes === null ? html`Its size couldn't be read just now.` : html`<b>${bytes(p.dbBytes)}</b> of 10 GB, for every team (5 GB is included).`, { kind: "database", alerts: a, used: p.dbBytes ?? undefined, limit: D1_MAX_BYTES })}
${row("Server errors", html`Pages and uploads the site couldn't answer, counted by the site itself.`, { kind: "site_errors", alerts: a })}
${row("Emails", html`Support tickets' and alerts' emails, sent straight away or by the 5-minute job.`, { kind: "email", alerts: a })}
${row("Emails this month", html`<b>${thousands(p.emailsThisMonth)}</b> of ${thousands(EMAILS_A_MONTH)} included with Workers Paid: sign-in codes, tickets and alerts.`, { kind: "email_allowance", alerts: a, used: p.emailsThisMonth, limit: EMAILS_A_MONTH })}
${row("AI models (Workers AI)", html`The model behind Ask Virtual Team Manager, the Documentation assistant and reading fixture pages, checked against Cloudflare's catalog for a planned retirement.`, { kind: "ai_models", alerts: a })}
${row("The 3am job", html`The database backup, the clean-up of videos and photos nothing uses, and the sign-in's leftovers, every night.`, { kind: "daily_job", alerts: a, more: html`${backupLine(p.lastBackup, p.now)}${sweepLine(p.lastSweep, p.now)}` })}
${row("The 5-minute job", html`Uploads, live streams, processing, scores and emails, for every team.`, { kind: "sync_job", alerts: a })}
${row("The video joiner", html`Joins a live stream's parts into one video after its page closed mid-game: the courtside-join Worker and its container.`, { kind: "joiner", alerts: a })}
${row("The game check", html`Each live game, 8 hours before tip-off, against what it'll need: Stream answering with minutes to spare, its Go live input, the video joiner and the 5-minute job, and no other alert up.`, { kind: "game_day", alerts: a })}
</ul></section>`;
}

export function platformPage(p: PlatformProps): SafeHtml {
	const runSync = p.staging ? html`<form method="post" action="/admin/run-sync" class="inline"><button class="btn">Run the 5-minute job now</button></form>` : "";
	const head = html`${runSync}<form method="post" action="/admin/run-game-day" class="inline"><button class="btn">Run the game check now</button></form><form method="post" action="/admin/test-email" class="inline"><button class="btn">Send a test email</button></form>`;
	const tested = p.testEmail ? html`<p class="small">Last test email: ${when(p.testEmail.at)}, ${p.testEmail.detail}.</p>` : html`<p class="small">No test email sent yet.</p>`;
	return adminLayout({ title: "Platform", current: "platform", frame: p.frame, head, lede: "How the site is doing: what it uses against what it has, its jobs, and Cloudflare's view." },
		html`${notice(p.message)}${watched(p)}${cloudflareSection(p.cloudflare.figures, p.cloudflare.configured)}${tested}`);
}
